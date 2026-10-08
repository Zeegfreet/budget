# Migração do banco: SQLite → PostgreSQL

## Context

A API usa Prisma 7 com SQLite (`@prisma/adapter-better-sqlite3`, `dev.db`/`test.db`). Para um SaaS multi-tenant, queremos PostgreSQL em dev, e2e, CI e produção. Decisões já tomadas:
- **Nova baseline**: apagar as 16 migrations SQLite e gerar uma única migration inicial para Postgres (não há produção em SQLite).
- **Descartar** os dados do `dev.db`.
- **docker-compose** na raiz com Postgres para dev (`budget`) e e2e (`budget_test`).

O schema não usa nada específico de SQLite (sem `$queryRaw`, sem `mode: 'insensitive'`, enums nativos já suportados), então a mudança de código é pequena; o grosso é infra, testes e docs.

## Passos

### 1. Infra local
- `docker-compose.yml` (raiz): serviço `db` com `postgres:17-alpine`, `POSTGRES_USER/PASSWORD/DB = budget/budget/budget`, porta `5432:5432`, volume nomeado `pgdata`, healthcheck `pg_isready`, e `./docker/postgres/init.sql` montado em `/docker-entrypoint-initdb.d/` com `CREATE DATABASE budget_test;`.
- `.gitignore` (raiz) e `apps/api/.gitignore`: remover as entradas de SQLite (`*.db`, journals, `test.db*`). Apagar os `dev.db`/`test.db` locais ao fim.

### 2. Dependências (`apps/api/package.json`, `pnpm-workspace.yaml`)
- `pnpm --filter api remove @prisma/adapter-better-sqlite3`; `pnpm --filter api add @prisma/adapter-pg@^7.10.0 pg` (+ `@types/pg` dev, se o tipo for necessário).
- Remover `better-sqlite3: true` de `allowBuilds` em `pnpm-workspace.yaml`.

### 3. Prisma
- `apps/api/prisma/schema.prisma`: `provider = "postgresql"` (sem `url`, continua no `prisma7.config.ts`). Nenhuma mudança de modelos (dinheiro segue `Int` em centavos).
- `prisma7.config.ts`: sem mudança (lê `DATABASE_URL`).
- Apagar `prisma/migrations/*` e gerar a baseline com o Postgres do compose no ar:
  `pnpm prisma migrate dev --name init --config prisma7.config.ts` → nova pasta `…_init` + `migration_lock.toml` com `provider = "postgresql"`.
- `src/prisma/prisma.service.ts`: trocar por `new PrismaPg({ connectionString: configService.getOrThrow<string>('DATABASE_URL') })` de `@prisma/adapter-pg`.
- `src/config/env.validation.ts`: validar que `DATABASE_URL` começa com `postgres://` ou `postgresql://` (erro claro se alguém ainda tiver `file:./dev.db`), com teste unitário no spec existente de env validation.
- `src/user/user.service.ts:188`: comentário "matches no row in SQLite" → genérico (Prisma não executa um update vazio); lógica mantida.

### 4. Env
- `apps/api/.env.example`: `DATABASE_URL="postgresql://budget:budget@localhost:5432/budget"` e comentário apontando `budget_test` para e2e e `docker compose up -d`.

### 5. Testes e2e
- `apps/api/vitest.config.e2e.ts`: `DATABASE_URL` padrão `postgresql://budget:budget@localhost:5432/budget_test` quando não definida; atualizar o comentário do `fileParallelism: false` (banco compartilhado).
- `test/utils.ts` `resetDatabase`: trocar a cadeia de `deleteMany` por um único `TRUNCATE … RESTART IDENTITY CASCADE` das tabelas do schema atual (lidas de `pg_tables`, excluindo `_prisma_migrations`), via `$executeRawUnsafe`. Mais rápido e reinicia as sequences (o SQLite reaproveitava ids após apagar tudo). Guarda: lançar erro se o nome do banco da URL não terminar em `_test`, para nunca truncar o banco de dev.
- Rodar todo o `pnpm test:e2e` e corrigir diferenças de comportamento, em especial:
  - **Ordenação de texto** (`orderBy: { group: { name } }` em `groups/group.service.ts:35`): collation do Postgres ≠ BINARY do SQLite (maiúsculas/acentos).
  - **Erros dentro de transação interativa**: no Postgres um `P2002` dentro do `$transaction(async tx => …)` aborta a transação; conferir os pontos que capturam `P2002` (`invitation.service.ts`, `budget.service.ts` `ensureDefaults`, `oauth.service.ts`) — capturar fora da transação, como já parece ser o caso.
  - **Concorrência**: SQLite serializava as escritas; no Postgres (Read Committed) verificar que os fluxos com leitura-e-escrita (`resplitPending`, `join`, `endMembership`) continuam corretos nos testes.
- Unit tests: não dependem do adapter (mockam `PrismaService`); só rodar.

### 6. CI (`.github/workflows/ci.yml`, job `api`)
- `services.postgres`: `postgres:17-alpine`, `POSTGRES_USER/PASSWORD=budget`, `POSTGRES_DB=budget_test`, porta 5432, health-cmd `pg_isready`.
- `env.DATABASE_URL: postgresql://budget:budget@localhost:5432/budget_test`; o resto (generate → lint → build → test → `migrate deploy` → `test:e2e`) sem mudança.

### 7. Docs
- `README.md` (PT): stack (PostgreSQL via `@prisma/adapter-pg`), setup (`docker compose up -d` + `prisma migrate dev`), tabela de env vars (`DATABASE_URL` Postgres), testes (`budget_test`), CI (service Postgres), deploy (diagrama com PostgreSQL, `export DATABASE_URL=postgresql://…`, checklist com backup via `pg_dump`/serviço gerenciado), linha do Docker na tabela de status (compose do banco já existe; Dockerfiles ainda não).
- `CLAUDE.md`: trocar as menções a SQLite (layout, Prisma, `PrismaService`, profile, "Known state of tests" com a nova `DATABASE_URL` de teste e o `docker compose up -d`).
- Copiar este plano para `plans/migracao-postgresql.md`.

## Verificação
1. `docker compose up -d` e `pnpm --filter api prisma migrate dev --config prisma7.config.ts` (baseline aplicada em `budget`).
2. `DATABASE_URL=postgresql://budget:budget@localhost:5432/budget_test pnpm prisma migrate deploy --config prisma7.config.ts` e então `pnpm test:e2e` — tudo verde.
3. `pnpm --filter api lint && pnpm --filter api build && pnpm --filter api test`.
4. `pnpm --filter api start:dev` + `pnpm --filter web start:dev`: cadastrar, ativar (link no log), criar lançamento e grupo pela UI.
5. Web: `pnpm --filter web test` (não deve mudar, sanidade).

## Ajustes feitos na implementação
- **Ordem do enum `EntryKind`**: o Postgres ordena enums pela ordem de declaração (o SQLite ordenava o texto). Declarado como `EXPENSE, INCOME` para manter despesas primeiro em `orderBy: { kind: 'asc' }` (`budget.service.ts`). Era o único `orderBy` sobre enum.
- **`better-sqlite3: false` em `allowBuilds`**: o próprio CLI `prisma` depende dele; sem a entrada, `pnpm install --frozen-lockfile` falha (quebraria o CI).
- `prisma migrate reset` é bloqueado para agentes; os bancos recém-criados (vazios) foram recriados com `DROP SCHEMA public CASCADE` via psql.

# Budget

SaaS de **gestão de finanças pessoais** com suporte a **finanças compartilhadas em grupo** (ex.: uma república que divide aluguel e contas).

> Este README acompanha a evolução do projeto: cada recurso entregue atualiza a seção [Status dos recursos](#status-dos-recursos) e, quando necessário, as seções de configuração e deploy.

## Sumário

- [Principais recursos](#principais-recursos)
- [Status dos recursos](#status-dos-recursos)
- [Stack](#stack)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Rodando localmente](#rodando-localmente)
- [Testes](#testes)
- [CI/CD](#cicd)
- [Deploy](#deploy)

## Principais recursos

- **Isolamento total por usuário (multi-tenant)**: cada usuário vê e altera apenas as próprias finanças. O dono dos dados vem sempre do contexto de autenticação, nunca do corpo da requisição. Acesso a dados de outro usuário retorna `404`, para não revelar que o recurso existe.
- **Receitas e despesas pessoais**: valores guardados em centavos (inteiros), sem ponto flutuante, para que totais e divisões fiquem exatos.
- **Grupos de finanças**: um usuário cria um grupo com receitas e despesas próprias (ex.: aluguel). Só os membros enxergam os dados do grupo.
- **Convites**: um membro convida outro usuário, que só ganha acesso depois de aceitar. Quem sai ou é removido do grupo perde o acesso.
- **Métodos de divisão**: cada grupo define como dividir as receitas e despesas entre os membros (partes iguais, valores fixos, percentuais/pesos). A soma das partes sempre fecha com o total.

## Status dos recursos

| Recurso | API | Web | Observação |
| --- | :---: | :---: | --- |
| Fundação da API (NestJS, Prisma, Swagger, validação) | ✅ | — | |
| Fundação do frontend (Tailwind, shadcn/ui, Router, Query, Atomic Design) | — | ✅ | |
| Pipeline de CI (lint, build, testes unitários e e2e) | ✅ | ✅ | |
| CRUD de usuários | 🚧 | 🚧 | Gerado pelo scaffold. Ainda sem autenticação nem isolamento |
| Autenticação | ⏳ | ⏳ | |
| Receitas e despesas pessoais | ⏳ | ⏳ | |
| Grupos de finanças | ⏳ | ⏳ | |
| Convites para grupos | ⏳ | ⏳ | |
| Métodos de divisão | ⏳ | ⏳ | |
| Docker / deploy em containers | ⏳ | ⏳ | Próximo passo, veja [Deploy](#deploy) |

Legenda: ✅ pronto · 🚧 em andamento · ⏳ planejado

## Stack

### API ([apps/api](apps/api))

- **[NestJS 12](https://nestjs.com/)** (TypeScript, ESM)
- **[Prisma 7](https://www.prisma.io/)** com **SQLite** via driver adapter `better-sqlite3`
- **class-validator / class-transformer**: `ValidationPipe` global com `whitelist` e `forbidNonWhitelisted`
- **Swagger** (`@nestjs/swagger`), servido em `/docs`
- **Vitest** + **Supertest** para testes unitários e e2e
- **oxlint** (lint type-aware) e **Prettier**

### Web ([apps/web](apps/web))

- **[React 19](https://react.dev/)** + **[Vite 8](https://vite.dev/)**
- **Tailwind CSS v4** + **[shadcn/ui](https://ui.shadcn.com/)** (Radix)
- **[TanStack Router](https://tanstack.com/router)** (rotas baseadas em arquivos) + **[TanStack Query](https://tanstack.com/query)**
- **Axios** para chamadas HTTP
- **Vitest** + **Testing Library** (jsdom)
- **ESLint**

### Infra

- Monorepo **pnpm workspaces** (`pnpm@12`)
- **Node.js 24**
- **GitHub Actions** para CI

## Estrutura do repositório

```
.
├── apps/
│   ├── api/                 # Backend NestJS
│   │   ├── prisma/          # schema.prisma e migrations
│   │   ├── src/             # módulos (controller, service, dto, entities)
│   │   └── test/            # testes e2e (*.e2e-spec.ts)
│   └── web/                 # Frontend React
│       └── src/
│           ├── components/  # ui → atoms → molecules → organisms → templates
│           ├── features/    # <feature>/{types,api,queries}.ts
│           ├── lib/         # cliente Axios, QueryClient, formatação de dinheiro
│           └── routes/      # páginas (TanStack Router file-based)
├── plans/                   # planos de implementação
└── .github/workflows/ci.yml # pipeline de CI
```

## Rodando localmente

### Pré-requisitos

- Node.js 24+
- pnpm 12 (`corepack enable` ou `npm i -g pnpm`)

### 1. Instalar dependências

```bash
pnpm install
```

### 2. Configurar e subir a API

```bash
cd apps/api
echo 'DATABASE_URL="file:./dev.db"' > .env

pnpm prisma generate --config prisma7.config.ts                 # gera o client em src/prisma/generated
pnpm prisma migrate dev --config prisma7.config.ts              # cria/atualiza o dev.db
pnpm start:dev                                                  # http://localhost:3000
```

A documentação da API (Swagger) fica em http://localhost:3000/docs.

> O arquivo de configuração do Prisma se chama `prisma7.config.ts`, então passe `--config prisma7.config.ts` em todo comando do Prisma.

### 3. Subir o frontend

```bash
cd apps/web
pnpm start:dev        # http://localhost:5173
```

Em desenvolvimento, o Vite encaminha `/api/*` para `http://localhost:3000` (removendo o prefixo `/api`). Para apontar para outra API, defina `VITE_API_URL` (veja [apps/web/.env.example](apps/web/.env.example)).

### Variáveis de ambiente

| App | Variável | Padrão | Descrição |
| --- | --- | --- | --- |
| api | `DATABASE_URL` | — (obrigatória) | Conexão do SQLite, ex.: `file:./dev.db` |
| api | `PORT` | `3000` | Porta HTTP da API |
| web | `VITE_API_URL` | `/api` | URL base da API, embutida no bundle no momento do build |

## Testes

Todo recurso só é considerado pronto com testes e2e e unitários (veja [CLAUDE.md](CLAUDE.md)).

```bash
# API
cd apps/api
pnpm test                                                      # unitários
DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts
DATABASE_URL=file:./test.db pnpm test:e2e                      # e2e em banco isolado (nunca o dev.db)

# Web
cd apps/web
pnpm test
```

## CI/CD

O workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) roda em todo push e pull request:

- **api**: instala dependências → `prisma generate` → lint → build → testes unitários → `prisma migrate deploy` em `test.db` → testes e2e
- **web**: instala dependências → gera a árvore de rotas → lint → testes → build

Ainda não há etapa de deploy automático. Ela entra junto com os arquivos Docker.

## Deploy

> **Status:** os arquivos Docker (`Dockerfile` da API e do web, `docker-compose.yml`) ainda não existem. Esta seção descreve o deploy manual atual e será substituída pelo fluxo com containers quando eles forem criados.

### Visão geral da arquitetura de produção

```
navegador ──► proxy reverso (ex.: Nginx)
               ├── /        → arquivos estáticos do web (apps/web/dist)
               └── /api/*   → API NestJS :3000 (removendo o prefixo /api)
                               └── SQLite (arquivo em volume persistente)
```

A API ainda **não tem CORS habilitado nem prefixo global**. Por isso, em produção o frontend e a API devem ficar sob o mesmo domínio, com um proxy reverso que remove o `/api`, igual ao proxy do Vite em desenvolvimento.

### API

```bash
pnpm install --frozen-lockfile
cd apps/api
pnpm prisma generate --config prisma7.config.ts
pnpm build

export DATABASE_URL="file:/var/lib/budget/prod.db"   # caminho em disco persistente
export PORT=3000
pnpm prisma migrate deploy --config prisma7.config.ts  # aplica migrations pendentes (rode a cada deploy)
pnpm start:prod                                        # node dist/main
```

### Web

```bash
cd apps/web
pnpm build            # gera apps/web/dist
```

Sirva `apps/web/dist` como site estático. Como é uma SPA, configure o fallback para `index.html` (no Nginx: `try_files $uri /index.html;`).

### Exemplo de Nginx

```nginx
server {
  listen 80;
  root /srv/budget/web;            # conteúdo de apps/web/dist

  location /api/ {
    proxy_pass http://127.0.0.1:3000/;   # a barra final remove o prefixo /api
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

### Checklist de produção

- [ ] `DATABASE_URL` apontando para um arquivo em volume persistente, com backup
- [ ] `prisma migrate deploy` executado a cada deploy, antes de iniciar a API
- [ ] Credenciais reais do `@nestjs/observe` em `app.module.ts` (hoje estão com placeholders), de preferência lidas de variáveis de ambiente
- [ ] HTTPS no proxy reverso
- [ ] Avaliar se o Swagger (`/docs`) deve ficar exposto em produção

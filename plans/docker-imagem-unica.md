# Imagem Docker única (API + web) publicada em `zeegfreet/budget`

## Context

O projeto vai para produção e precisa de uma imagem Docker publicada no Docker Hub (usuário `zeegfreet`). Decisões do usuário: **uma imagem única por enquanto**, **Traefik** como proxy de borda (não Nginx), **script local + GitHub Actions** para build/push, **multi-arch amd64 + arm64**.

Problema: hoje o web chama `/api/*` e depende de um proxy (Vite em dev, Nginx no README) que remove o `/api` e reescreve o cookie `Path=/auth` → `/api/auth`. O Traefik não reescreve path de cookie, e não haverá Nginx no container. Solução: no modo "imagem única", a própria API publica as rotas sob o prefixo `/api` (prefixo global do Nest), define os cookies de refresh/OAuth com `Path=/api/auth` e serve o build do web (estáticos + fallback de SPA). O Traefik só termina TLS e encaminha tudo para a porta 3000. Dev e testes continuam iguais (sem prefixo, cookie `/auth`).

Salvar uma cópia deste plano em `plans/docker-imagem-unica.md` (memória: planos ficam em `plans/`).

## Mudanças na API (`apps/api`)

1. **Env** (`src/config/env.validation.ts`): novas opcionais
   - `API_PREFIX` (ex.: `api`; só `[a-z0-9-]+`, sem barras)
   - `WEB_DIST_DIR` (diretório do build do web); exige `API_PREFIX` (senão rotas do SPA colidiriam com as da API) → erro `WEB_DIST_DIR requires API_PREFIX`.
   - Testes em `src/config/env.validation.spec.ts` (se existir; senão criar).
2. **Prefixo global** em `configureApp` (`src/app.setup.ts`): se `API_PREFIX`, `app.setGlobalPrefix(prefix)`; se `WEB_DIST_DIR`, chama `serveWebApp(app, dir, prefix)`.
3. **`src/web-app.ts`** (novo, `serveWebApp`): `useStaticAssets(dir, { index: false })` com `Cache-Control: immutable` para `/assets/*` (arquivos com hash do Vite) e um middleware de fallback: `GET`/`HEAD` cujo path não seja `/<prefix>` nem `/<prefix>/...` → `sendFile(index.html)` com `Cache-Control: no-cache`. Middleware Express puro (fora dos guards do Nest), sem nova dependência.
4. **Cookie path configurável**: `AuthConfig` (`src/auth/auth.config.ts`) ganha `refreshCookiePath` = `/${API_PREFIX}/auth` ou `/auth`. Substituir `REFRESH_COOKIE_PATH` em `src/auth/auth.cookies.ts` (`setAuthCookies`/`clearAuthCookies`) e em `stateCookieOptions` de `src/auth/oauth/oauth.controller.ts`; atualizar specs que usam a constante (`auth.controller.spec.ts` etc.). O callback OAuth (`OAUTH_CALLBACK_BASE_URL` padrão `${WEB_URL}/api`) já bate com o prefixo.
5. **`src/main.ts`**: chamar `configureApp(app)` **antes** do Swagger (o documento precisa do prefixo) e `SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true })` → `/api/docs` na imagem.
6. **`package.json`**: mover `prisma` e `dotenv` para `dependencies` (o container roda `prisma migrate deploy` no start e `prisma7.config.ts` importa `dotenv/config`). Atualizar `pnpm-lock.yaml` com `pnpm install`.

## Arquivos Docker (raiz)

- **`Dockerfile`** multi-stage, base `node:24-bookworm-slim` (argon2 nativo e schema engine do Prisma sem dor de musl):
  1. `base`: `npm i -g pnpm@12.9.1`, `WORKDIR /app`.
  2. `deps`: copia `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` e os `package.json` dos apps → `pnpm install --frozen-lockfile` (cache mount do store).
  3. `build`: copia o código; `apps/api`: `prisma generate --config prisma7.config.ts` + `pnpm build`; `apps/web`: `pnpm build` (sem `VITE_API_URL` → `/api`, mesma origem).
  4. `prod-deps`: `pnpm install --frozen-lockfile --prod --filter api...` (root `node_modules/.pnpm` + `apps/api/node_modules`). Se o pnpm 12 tratar bem, alternativa `pnpm --filter api deploy --prod`; validar no build.
  5. `runtime`: usuário `node`, copia node_modules de produção, `apps/api/dist`, `apps/api/prisma` (schema + migrations), `prisma7.config.ts`, `apps/api/package.json` e `apps/web/dist` → `/app/web`. `ENV NODE_ENV=production API_PREFIX=api WEB_DIST_DIR=/app/web PORT=3000`, `EXPOSE 3000`, `HEALTHCHECK` com `node -e "fetch('http://127.0.0.1:3000/api')..."` (rota pública `GET /` do `AppController`), labels OCI.
- **`docker/entrypoint.sh`**: `prisma migrate deploy --config prisma7.config.ts` (desligável com `SKIP_MIGRATIONS=true`) e `exec node dist/main.js`.
- **`.dockerignore`**: `node_modules`, `**/dist`, `.env*` (exceto exemplos), `.git`, `coverage`, `src/prisma/generated`, `.tanstack`, `plans`, `.claude`, etc.
- **`docker-compose.prod.yml`** (exemplo de deploy com Traefik): serviços `traefik` (v3, entrypoints 80/443, redirect HTTP→HTTPS, Let's Encrypt com `ACME_EMAIL`), `app` (`zeegfreet/budget:${BUDGET_TAG:-latest}`, `env_file: .env.prod`, labels `traefik.http.routers.budget.rule=Host(\`${DOMAIN}\`)`, tls certresolver, porta 3000, `TRUST_PROXY=1`, depende do `db` saudável) e `db` (`postgres:17-alpine`, volume). Arquivo **`.env.prod.example`** com as variáveis (DATABASE_URL, JWT_ACCESS_SECRET, WEB_URL, SMTP_*, OAuth, DOMAIN, ACME_EMAIL).

## Script e CI/CD

- **`scripts/docker-build.sh`**: `./scripts/docker-build.sh [versão] [--push]`. Imagem `zeegfreet/budget` (sobrescrevível com `IMAGE=`). Versão padrão = `git describe --tags --always`. Com `--push`: `docker buildx build --platform linux/amd64,linux/arm64 -t …:<versão> -t …:latest --push` (requer `docker login`; cria um builder buildx se não houver). Sem `--push`: build só da plataforma local com `--load` (multi-arch não carrega no daemon local).
- **`.github/workflows/docker.yml`** (novo): dispara em tags `v*` e `workflow_dispatch`; `docker/setup-qemu-action`, `setup-buildx-action`, `login-action` (secrets `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`), `metadata-action` (tags semver `1.2.3`, `1.2`, `latest`, sha) e `build-push-action` multi-arch com cache `type=gha`.
- **`.github/workflows/ci.yml`**: novo job `docker` que só valida o build da imagem (`linux/amd64`, `push: false`, cache gha) em todo push/PR.

## Testes

- **E2E** `apps/api/test/web-app.e2e-spec.ts`: define `process.env.API_PREFIX='api'` e `WEB_DIST_DIR` (diretório temporário com `index.html` e `assets/app.js`) antes de `createTestApp`, restaura depois. Casos: `GET /grupos` e `GET /` → index.html; `GET /assets/app.js` → arquivo com cache imutável; `GET /api` → hello; cadastro/login via `/api/auth/...` define `refresh_token` com `Path=/api/auth` e `POST /api/auth/refresh` funciona; `GET /api/inexistente` → 404 JSON (não o SPA); `GET /auth/me` (sem prefixo) → index.html, não a API; rota protegida sem cookie → 401.
- **Unit**: `auth.config` (`refreshCookiePath` com/sem prefixo), `env.validation` (novas regras), `web-app.ts` (fallback ignora prefixo / métodos não-GET).
- Nenhuma mudança no web; `pnpm test` do web continua igual.

## README (PT-BR)

Substituir a seção **Deploy** (hoje "arquivos Docker ainda não existem") pelo fluxo da imagem: arquitetura (navegador → Traefik → container :3000 com `/api` + SPA → PostgreSQL), variáveis novas (`API_PREFIX`, `WEB_DIST_DIR`, `SKIP_MIGRATIONS`), `scripts/docker-build.sh`, publicação por tag `v*` e secrets do Docker Hub, exemplo `docker-compose.prod.yml`; manter o exemplo Nginx como alternativa curta ou remover; ajustar **Proxy reverso e cookies**, **CI/CD** (job docker + workflow de publicação), **Infra** da stack, tabela de variáveis e checklist (incluir credenciais do `@nestjs/observe` ainda placeholder). Atualizar `CLAUDE.md` (HTTP setup, cookie path, Docker).

## Verificação

1. `pnpm --filter api lint && pnpm --filter api test && pnpm --filter api test:e2e` (com `docker compose up -d` e migrations no `budget_test`); `pnpm --filter web test`.
2. `./scripts/docker-build.sh dev` (build local `--load`), depois rodar o container contra o Postgres do compose (`DATABASE_URL=postgresql://budget:budget@host.docker.internal:5432/budget`, `JWT_ACCESS_SECRET`, `SMTP_HOST=host.docker.internal` com Mailpit, `COOKIE_SECURE=false`, `WEB_URL=http://localhost:3000`): conferir que migrations rodam, `http://localhost:3000/` abre o SPA, cadastro → e-mail no Mailpit → ativação → login → refresh funcionam, `/api/docs` abre, `docker inspect` mostra healthy.
3. `docker buildx build --platform linux/amd64,linux/arm64 .` sem push para validar o multi-arch (push real fica com o usuário: `docker login` + `./scripts/docker-build.sh v1.0.0 --push`, ou criar a tag `v1.0.0` após cadastrar os secrets).

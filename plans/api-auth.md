# API de autenticação (e-mail + senha) com Passport, JWT em cookie e refresh token

## Context
As telas `/login` e `/signup` do web já existem e consomem um contrato de auth documentado no README (`POST /auth/login`, `POST /auth/register`, `GET /auth/me`, `POST /auth/logout`), mas a API só tem o scaffold `User { id, email, name }` + `Post` e um CRUD `/user` aberto que lista todos os usuários (vazamento entre tenants). Agora vamos:
- criar o esquema de usuário real (senha com hash, data de nascimento, CEP, cidade, UF) e a sessão de refresh;
- implementar as rotas de auth com **Passport** (`local` para login, `jwt` para o guard);
- proteger **toda a API por padrão** com um guard global (rotas abertas só com `@Public()`);
- integrar o web (refresh automático em 401) e remover o CRUD `/user`.

Decisões do usuário:
- **Sessão mista**: access token JWT curto em cookie httpOnly, validado sem banco (stateless) em todas as requisições; refresh token opaco em cookie httpOnly com **sessão controlada no banco**, consultada só em `/auth/refresh` (e no logout).
- **Só e-mail/senha agora**; GitHub/Google ficam para outra tarefa (os botões continuam no web, e `/auth/github|google` seguem respondendo 404 → "servidor indisponível", como hoje).
- **Remover o CRUD `/user`** da API e `features/user` do web.

## Passo 0
- Copiar este plano para `plans/api-auth.md` na raiz do repo (preferência do usuário: planos ficam em `plans/`).

## Contrato final (o web já espera; acrescenta `/auth/refresh`)
| Método | Rota | Auth | Resposta |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | pública, throttled | `201` `AuthUser` + cookies; `400` validação; `409` e-mail já cadastrado; `429` |
| `POST` | `/auth/login` | pública, throttled, `LocalAuthGuard` | `200` `AuthUser` + cookies; `401` genérico (`Invalid credentials`); `429` |
| `POST` | `/auth/refresh` | pública (usa cookie de refresh), throttled | `200` `AuthUser` + cookies rotacionados; `401` sem/inválido/expirado/revogado (limpa cookies) |
| `GET` | `/auth/me` | JWT | `200` `AuthUser`; `401` |
| `POST` | `/auth/logout` | pública (idempotente) | `204`; revoga a sessão do refresh cookie (se houver) e limpa os dois cookies |

`AuthUser = { id: number; email: string; name: string }` (nunca expõe hash, sessão etc.).

## API (`apps/api`)

### Dependências
`@nestjs/passport passport passport-local passport-jwt @nestjs/jwt cookie-parser argon2 @nestjs/throttler` + dev `@types/passport-local @types/passport-jwt @types/cookie-parser`. Instalar as versões compatíveis com Nest 12 (`pnpm --filter api add ...`). Verificar `pnpm.onlyBuiltDependencies`/approve-builds para o `argon2` (nativo, como o `better-sqlite3`).

### Prisma (`prisma/schema.prisma`)
- Remover `Post` (scaffold).
- `User`: `id Int @id @default(autoincrement())`, `email String @unique` (salvo em minúsculas), `name String`, `passwordHash String`, `birthDate DateTime` (meia-noite UTC da data informada), `cep String`, `city String`, `state String`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, `sessions Session[]`.
- `Session` (refresh): `id String @id @default(uuid())`, `userId Int` (`onDelete: Cascade`, `@@index([userId])`), `tokenHash String`, `expiresAt DateTime`, `revokedAt DateTime?`, `createdAt`, `lastUsedAt DateTime @default(now())`, `userAgent String?`, `ip String?`.
- Migração `pnpm prisma migrate dev --name auth_users --config prisma7.config.ts`. Como as colunas novas são obrigatórias, o `dev.db` local precisa ser resetado (só dados de dev; confirmar com o usuário antes de rodar o reset). Rodar `prisma generate` depois.

### Bootstrap compartilhado
- `src/app.setup.ts` (novo): `configureApp(app)` aplica `cookieParser()`, o `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) e `enableShutdownHooks`. Usado por `main.ts` **e** pelos e2e — hoje o e2e não aplica o pipe, então os testes de validação não refletiriam produção. `main.ts` continua configurando o Swagger (adicionar `addCookieAuth('access_token')`).

### Módulos
- `src/user/`: `UserModule` importa `PrismaModule` (deixa de registrar `PrismaService` direto) e **exporta** `UserService`. Remover `user.controller.ts` (+ spec), `dto/` e `entities/`. `UserService` passa a ter só o que a auth usa: `create(data)`, `findByEmail(email)`, `findById(id)`; e um `toAuthUser(user)` (ou `select` fixo `{ id, email, name }`) para nunca vazar `passwordHash`.
- `src/auth/` (novo):
  - `auth.module.ts`: importa `UserModule`, `PrismaModule`, `PassportModule`, `JwtModule.registerAsync` (secret `JWT_ACCESS_SECRET`, `expiresIn` `JWT_ACCESS_TTL`). Registra `LocalStrategy`, `JwtStrategy`, `AuthService`, `SessionService`.
  - `auth.controller.ts`: as 5 rotas acima, com `@ApiTags('auth')`, `@ApiCookieAuth` em `/me` e respostas documentadas. Usa `@Res({ passthrough: true })` para os cookies; `@HttpCode(200)` em login/refresh e `204` em logout.
  - `auth.service.ts`:
    - `register(dto, meta)`: e-mail normalizado; `argon2.hash` (argon2id); cria usuário; `P2002` → `ConflictException` (409); abre sessão e devolve tokens.
    - `validateCredentials(email, password)`: usuário inexistente ainda roda `argon2.verify` contra um hash fixo (tempo constante, sem enumeração); devolve `AuthUser` ou `null`.
    - `issueTokens(user, meta)`: assina o access JWT (`{ sub: id }`) e cria a sessão via `SessionService`.
  - `session.service.ts` (único ponto stateful):
    - token de refresh = `${session.id}.${secret}` com `secret = randomBytes(32).base64url`; no banco só `sha256(secret)`.
    - `create(userId, meta)`; `rotate(token)`: busca por id; inexistente/revogada/expirada → `UnauthorizedException`; **hash diferente = reuso de token antigo → revoga a sessão** e 401; senão grava novo hash, `lastUsedAt` e `expiresAt` deslizante (`REFRESH_TOKEN_TTL_DAYS`), devolve novo token + `userId`. Comparação com `timingSafeEqual`.
    - `revoke(token)`: marca `revokedAt` se o segredo bater (ignora token inválido).
  - `auth.cookies.ts`: `setAuthCookies(res, { accessToken, refreshToken })` / `clearAuthCookies(res)`. Ambos `httpOnly`, `sameSite: 'lax'`, `secure` = `COOKIE_SECURE` (padrão `true` quando `NODE_ENV=production`). `access_token`: `path: '/'`, maxAge = TTL do JWT. `refresh_token`: `path: '/auth'` (só vai para refresh/logout), maxAge = TTL do refresh.
  - `strategies/local.strategy.ts`: `usernameField: 'email'`; inválido → `UnauthorizedException('Invalid credentials')`.
  - `strategies/jwt.strategy.ts`: `jwtFromRequest` lê `req.cookies.access_token`; `ignoreExpiration: false`; `validate({ sub })` → `{ id: sub }` **sem consultar o banco** (stateless).
  - `guards/jwt-auth.guard.ts`: estende `AuthGuard('jwt')`, libera rotas com `@Public()` via `Reflector`. `guards/local-auth.guard.ts`.
  - `decorators/public.decorator.ts`, `decorators/current-user.decorator.ts` (`@CurrentUser()` → `req.user` tipado `{ id }`; é a fonte do dono dos dados para os próximos recursos).
  - `dto/register.dto.ts`: espelha `validateRegister` do web — `name` (trim, 2–100), `email` (`IsEmail`, trim + lowercase via `@Transform`, ≤254), `password` (8–128), `birthDate` (`IsISO8601({ strict: true })` + validador `IsAdult` 18–120 anos, rejeita futuro e datas impossíveis), `cep` (`/^\d{8}$/`), `city` (trim, 1–100), `state` (`IsIn(UFS)`). `dto/login.dto.ts` (só para Swagger). `dto/auth-user.dto.ts` (resposta).
  - `validators/is-adult.validator.ts` + `brazil.ts` (lista de UFs).
- `app.module.ts`:
  - importa `AuthModule`, `UserModule`, `ThrottlerModule.forRoot` (padrão generoso) ;
  - `APP_GUARD`: `ThrottlerGuard` e `JwtAuthGuard` (protegido por padrão);
  - limites específicos com `@Throttle` em login/register/refresh (ex.: 5/min em login e register, 30/min em refresh), lidos do `ConfigService` (`AUTH_THROTTLE_LIMIT`, padrão 5) para os e2e poderem testar o 429 sem esperar.
  - `AppController` `GET /` recebe `@Public()`.
  - `ConfigModule.forRoot` com `validate` simples exigindo `JWT_ACCESS_SECRET` (falha no boot se ausente).

### Variáveis de ambiente (novas)
`JWT_ACCESS_SECRET` (obrigatória), `JWT_ACCESS_TTL` (`15m`), `REFRESH_TOKEN_TTL_DAYS` (`7`), `COOKIE_SECURE` (padrão por `NODE_ENV`), `AUTH_THROTTLE_LIMIT` (`5`). Criar `apps/api/.env.example` (versionado) e acrescentar ao `.env` local.

## Web (`apps/web`)
- `src/lib/api/client.ts`: interceptor de resposta com refresh transparente — em `401` de requisição que não seja `/auth/login|register|refresh|logout` e ainda não repetida (`config._retry`), faz **um único** `POST /auth/refresh` compartilhado (promise single-flight entre requisições simultâneas) e repete a original; se o refresh falhar, rejeita com o `ApiError` 401 original (o `_app` já manda para `/login`). O normalizador `toApiError` continua igual.
- `vite.config.ts`: no proxy `/api`, `cookiePathRewrite: { '/auth': '/api/auth' }`, para o cookie de refresh (`Path=/auth`) chegar em `/api/auth/refresh` no dev. Documentar que, em produção atrás de um prefixo, o proxy reverso precisa do mesmo ajuste.
- `features/auth/types.ts`: `AuthUser.name: string`.
- Remover `features/user/`; a home (`routes/_app/index.tsx`) troca o card "Usuários" por uma saudação com o nome do usuário (`useQuery(authQueries.me())`). Remover os `vi.mock('@/features/user/api')` dos specs (`login`, `signup`, `_app/index`).

## Testes
### API e2e — `test/auth.e2e-spec.ts` (AppModule real + `configureApp`, `DATABASE_URL=file:./test.db`, `deleteMany` em `Session`/`User` no `beforeEach`; usar `request.agent` para carregar cookies)
- register: 201 + `Set-Cookie` com `HttpOnly`/`SameSite=Lax` nos dois cookies, corpo sem `passwordHash`; senha salva como hash argon2; e-mail normalizado; 409 duplicado (case-insensitive); 400 por campo (e-mail, senha curta, < 18 anos, data futura/impossível, CEP, UF) e por campo desconhecido (`forbidNonWhitelisted`).
- login: 200 + cookies; 401 com a mesma mensagem para senha errada e e-mail inexistente; 401 sem corpo; 429 após `AUTH_THROTTLE_LIMIT` tentativas.
- me: 200 com o cookie; 401 sem cookie, com JWT adulterado e com JWT expirado (assinado via `JwtService` com `expiresIn` negativo).
- refresh: 200 rotaciona os dois cookies e `me` funciona com o novo access; reusar o refresh antigo → 401 **e** a sessão fica revogada (o novo também deixa de funcionar); sessão expirada → 401; sem cookie → 401.
- logout: 204 limpa cookies; refresh posterior → 401; logout sem cookie → 204.
- isolamento: dois usuários (A e B) — `me` devolve cada um o seu; logout/revogação de A não afeta a sessão de B; refresh token de A com id de sessão de B → 401.
- guard global: `GET /` continua público; rota protegida sem cookie → 401.
- Atualizar `test/app.e2e-spec.ts` para usar `configureApp`.

### API unit (`*.spec.ts`, Prisma mockado)
`auth.service.spec` (hash, 409 em `P2002`, verificação com usuário inexistente), `session.service.spec` (create/rotate/reuso/expirada/revoke), `jwt-auth.guard.spec` (`@Public`), `local.strategy.spec`, `jwt.strategy.spec` (extrai do cookie, `validate`), `auth.controller.spec` (cookies setados/limpos), `is-adult.validator.spec` (fronteira dos 18 anos), `user.service.spec` atualizado. Remover `user.controller.spec.ts`.

### Web
- `src/lib/api/client.spec.ts` (novo, com `adapter` customizado do Axios): 401 → refresh → repete com sucesso; refresh falha → rejeita 401; duas requisições simultâneas disparam um único refresh; rotas `/auth/login|register|refresh` não disparam refresh.
- `routes/_app/index.spec.tsx`: saudação com o nome do usuário.
- Rodar todos os specs existentes (login/signup continuam mockando `features/auth/api`).

## CI / README / docs
- `.github/workflows/ci.yml` (job `api`): `env` ganha `JWT_ACCESS_SECRET: ci-test-secret` (e `AUTH_THROTTLE_LIMIT` se necessário). Sem outros passos novos (migrate deploy já existe).
- `README.md` (pt-BR):
  - Status: "Autenticação" → API ✅ (e-mail/senha, refresh, guard global), Web ✅ para e-mail/senha; observação de que OAuth GitHub/Google está pendente. "CRUD de usuários" sai da tabela (removido).
  - Stack/API: Passport (local + JWT), `@nestjs/jwt`, argon2, `@nestjs/throttler`, cookie-parser.
  - Variáveis de ambiente: as novas da API + menção ao `.env.example`.
  - Seção Autenticação: contrato final com `/auth/refresh`, modelo access stateless + refresh stateful com rotação e detecção de reuso, cookies (paths, `SameSite=Lax`, `Secure` em produção), guard global com `@Public()`, nota do `cookiePathRewrite`/proxy reverso; remover "A API ainda vai implementar".
  - Rodando localmente: reset do `dev.db` após a migração e `JWT_ACCESS_SECRET` no `.env`.
- `CLAUDE.md`: atualizar a nota de "Module wiring" (UserModule agora importa PrismaModule) e citar o guard global/`@Public()`/`@CurrentUser()` como padrão para recursos novos.

## Verificação
- `cd apps/api && pnpm prisma generate --config prisma7.config.ts && pnpm lint && pnpm build && pnpm test`
- `DATABASE_URL=file:./test.db JWT_ACCESS_SECRET=x pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db JWT_ACCESS_SECRET=x pnpm test:e2e`
- `cd apps/web && pnpm generate:routes && pnpm lint && pnpm test && pnpm build`
- Manual: API + web em dev → criar conta em `/signup` (entra logado e cai na home com o nome), sair, entrar em `/login`, apagar o cookie `access_token` no DevTools e recarregar (refresh transparente mantém a sessão), conferir `/docs` com as rotas de auth.

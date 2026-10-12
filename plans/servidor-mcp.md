# Servidor MCP para agentes de IA (orçamento, categorias e lançamentos)

## Context

O produto já cobre orçamento, extrato, grupos e meios de pagamento. O próximo passo é deixar **agentes de LLM** (Claude.ai/Desktop/Code e outros clientes MCP) ajudarem o usuário a gerir as finanças. Para isso a API passa a expor um **servidor MCP remoto** (Streamable HTTP) com ferramentas para ler e alterar o orçamento, os tipos/categorias e os lançamentos do usuário.

Decisões do usuário:
- **Autenticação: OAuth 2.1 conforme a spec MCP** (a API é o authorization server: metadata, Dynamic Client Registration, PKCE, tela de consentimento no web). Funciona como conector remoto no claude.ai sem copiar tokens.
- **Escopo: orçamento + categorias + lançamentos** (meios de pagamento só leitura; grupos ficam fora).
- **Leitura e escrita com escopos** `budget:read` / `budget:write`.

Isolamento multi-tenant continua a regra: o `userId` vem **só** do token; as ferramentas chamam os services existentes (que já escopam por `userId` e devolvem 404 para dados de outro usuário).

## Arquitetura: entrypoint MCP separado (mesmo código, outro processo)

```
                        ┌──────────── processo MCP (src/mcp/main.ts, MCP_PORT=3001, host mcp.<domínio>) ────────────┐
Cliente MCP ──POST /mcp──►│ McpController ─► McpBearerGuard (hash do token no banco) ─► McpServer por requisição      │
 (Bearer)                 │ GET /.well-known/oauth-protected-resource[/mcp]           ─► Budget/Category/Transaction/  │
                          │                                                              PaymentMethod services        │
                          └─────────────────────────────────────────────────────────────────────────────────────────────┘
                        ┌──────────── API principal (src/main.ts, inalterada exceto pelo authorization server) ────────┐
Cliente MCP ─────────────►│ /.well-known/oauth-authorization-server, /oauth/register|authorize|token|revoke             │
Web (sessão) ────────────►│ /oauth/requests/:id (consentimento), /oauth/grants (conexões)                               │
                          └─────────────────────────────────────────────────────────────────────────────────────────────┘
/oauth/authorize ─302─► WEB_URL/autorizar-agente?request=<id> (usuário logado aprova/nega) ─► redirect com ?code=
```

- **Por que separar**: escala, rate limit e restart independentes; falha/abuso no MCP não derruba a API; o MCP não herda o `JwtAuthGuard` de cookie nem o `API_PREFIX`/SPA; host próprio simplifica o protected resource metadata.
- **Por que no mesmo `apps/api`**: chama os services diretamente (mesmas regras de validação, 404 e escopo por `userId`), sem salto HTTP nem pacote compartilhado. Um `apps/mcp` separado fica para quando houver um pacote `domain`.
- **Divisão de papéis**: a API principal é o **authorization server** (precisa da sessão do usuário para o consentimento); o processo MCP é só o **resource server** (valida o token no mesmo banco via `McpTokenVerifier`, exportado por um `OAuthServerCoreModule` usado pelos dois).
- **Entrypoint**: `src/mcp/main.ts` cria `McpAppModule` (`ConfigModule` global com `validateEnv`, `ThrottlerModule` próprio — p.ex. 60/min por token —, `PrismaModule`, `BudgetModule`, `PaymentMethodsModule`, `McpModule`) e aplica um `configureMcpApp` (só `ValidationPipe` + trust proxy; sem cookies/prefixo/SPA). `nest-cli.json`/`tsconfig.build` geram `dist/mcp/main.js`; scripts `start:mcp` (`nest start --watch --entryFile mcp/main`) e `start:mcp:prod`.
- **Deploy**: mesma imagem `zeegfreet/budget`; `docker-compose.prod.yml` ganha o serviço `mcp` (`command: node dist/mcp/main.js`, `SKIP_MIGRATIONS=true`, rota Traefik `Host(${MCP_HOST})`), `.env.prod.example` com `MCP_HOST`/`MCP_PUBLIC_URL`. Em dev: `pnpm --filter api start:mcp` → `http://localhost:3001/mcp`.

### Dois transportes, um núcleo: HTTP e stdio

O registro das ferramentas não conhece o transporte, para que o mesmo servidor sirva clientes remotos (HTTP), clientes locais (stdio) e, no futuro, um agente dentro da própria aplicação.

```
McpCoreModule ── McpServerFactory.create(principal) ─► McpServer com as ferramentas
   ├── HTTP  (src/mcp/main.ts)  : McpAppModule  = McpCoreModule + McpController/Guard → StreamableHTTPServerTransport
   ├── stdio (src/mcp/stdio.ts) : NestFactory.createApplicationContext(McpCoreModule) → StdioServerTransport
   └── futuro, dentro do app    : a mesma factory + InMemoryTransport (sem processo extra)
```

- `McpPrincipal = { userId: number; scopes: Scope[]; via: 'oauth' | 'local' }` é a única entrada da factory; todas as ferramentas usam `principal.userId` (nunca um id vindo dos argumentos).
- **`McpCoreModule`**: `ConfigModule` (validateEnv), `PrismaModule`, `BudgetModule`, `PaymentMethodsModule`, `OAuthServerCoreModule` (verificador de token) e `McpServerFactory`. Sem controllers próprios. Os controllers de domínio dos módulos importados não sobem no stdio porque `createApplicationContext` não abre HTTP.
- **Entrypoint stdio** (`src/mcp/stdio.ts`, `dist/mcp/stdio.js`, scripts `mcp:stdio` (dev, via `tsx`/`nest start --entryFile mcp/stdio`) e `mcp:stdio:prod`). A identidade vem do ambiente, em uma de duas formas (exatamente uma; as duas ou nenhuma → erro no stderr e `exit 1`):
  - `MCP_ACCESS_TOKEN`: um access token OAuth, verificado como no HTTP (grant ativo, não expirado). Os escopos são os do grant. O token é **reverificado a cada chamada de ferramenta**, então revogar na página "Agentes de IA" corta o acesso na hora. Serve para um usuário rodar o servidor localmente.
  - `MCP_USER_ID` (+ `MCP_SCOPES`, padrão `budget:read`): identidade **confiável**, para quando a própria aplicação iniciar o processo para um usuário já autenticado. Quem roda isso já tem `DATABASE_URL`, ou seja, acesso total ao banco, então não abre brecha nova. Mesmo assim o processo confere que o usuário existe e não é pré-cadastro, e o modo fica documentado como **interno** (nunca exposto a usuários finais).
- **stdout é exclusivo do JSON-RPC**: o contexto Nest sobe com um logger que escreve no **stderr** (`StderrLogger`), sem `ObserveModule` e sem banner. Um teste garante que nada além de mensagens JSON-RPC vai para o stdout.
- O `McpBearerGuard` do HTTP e o resolvedor do stdio usam o mesmo `McpTokenVerifier`, que devolve um `McpPrincipal`.
- Docker: o `dist/mcp/stdio.js` já vai na imagem. Uso: `docker run -i --rm -e DATABASE_URL -e MCP_ACCESS_TOKEN zeegfreet/budget node dist/mcp/stdio.js` com `SKIP_MIGRATIONS=true`. O `entrypoint.sh` não pode escrever no stdout nesse caso: conferir, e mandar os logs dele para o stderr se preciso.

- **SDK**: `@modelcontextprotocol/sdk` (v1.x, já presente transitivamente na versão 1.32.1) + `zod` como dependências do `apps/api`. Usar `McpServer` e `StreamableHTTPServerTransport` em modo **stateless** (`sessionIdGenerator: undefined`, `enableJsonResponse: true`), um servidor por requisição com o `userId` capturado nas closures das ferramentas. `GET`/`DELETE /mcp` → 405.
- **Authorization server hand-rolled em Nest** (como o OAuth de GitHub/Google), não o `mcpAuthRouter` do SDK, porque precisa conviver com `API_PREFIX`, `@Public`, throttler e os e2e com Supertest.

## API (`apps/api/src/mcp/`)

### URLs públicas
- `McpConfig` (`mcp.config.ts`, `MCP_CONFIG`, lido pelos dois processos): `issuer` = base pública da API = `OAUTH_CALLBACK_BASE_URL` (`${WEB_URL}/api` por padrão; reaproveitar `oauthConfigFactory`/`webUrlFrom`); `resource` = `${MCP_PUBLIC_URL}/mcp` (`MCP_PUBLIC_URL` padrão `http://localhost:${MCP_PORT ?? 3001}`). TTLs: `MCP_ACCESS_TOKEN_TTL_MINUTES` (60), `MCP_REFRESH_TOKEN_TTL_DAYS` (30), código 10 min, pedido de autorização 10 min. Validar URLs/inteiros em `env.validation.ts`.
- **Well-known fora do prefixo**: `configureApp` passa a usar `app.setGlobalPrefix(prefix, { exclude: ['.well-known/{*path}'] })` e `serveWebApp` (`src/web-app.ts`) não faz fallback de SPA para `/.well-known/*`. Rotas servidas:
  - No **processo MCP**: `GET /.well-known/oauth-protected-resource` e `/.well-known/oauth-protected-resource/mcp` (RFC 9728: `resource`, `authorization_servers: [issuer]`, `scopes_supported`, `bearer_methods_supported: ['header']`).
  - `GET /.well-known/oauth-authorization-server[/<prefix>]` e `/.well-known/openid-configuration[/<prefix>]` (RFC 8414: endpoints abaixo, `code_challenge_methods_supported: ['S256']`, `grant_types_supported: ['authorization_code','refresh_token']`, `token_endpoint_auth_methods_supported: ['none','client_secret_post']`, `response_types_supported: ['code']`).

### Modelos Prisma (migration `mcp_oauth`)
- `OAuthClient` — `id` (uuid = `client_id`), `name`, `redirectUris String[]`, `secretHash?` (público quando null), `createdAt`.
- `OAuthAuthorizationRequest` — `id` (uuid), `clientId`, `redirectUri`, `state?`, `codeChallenge`, `scopes String[]`, `resource`, `expiresAt` (pedido pendente que a tela de consentimento lê).
- `OAuthAuthorizationCode` — `codeHash` (unique), `clientId`, `userId`, `redirectUri`, `codeChallenge`, `scopes`, `resource`, `expiresAt`, `usedAt?`.
- `OAuthGrant` — a "conexão" do usuário com um cliente: `id`, `userId`, `clientId`, `scopes`, `resource`, `accessHash` (unique), `accessExpiresAt`, `refreshHash` (unique), `previousRefreshHash?`, `refreshExpiresAt`, `revokedAt?`, `createdAt`, `lastUsedAt`. Cascade em `User`/`OAuthClient`. Index `userId`.
- Segredos: reutilizar `newToken`/`hashToken`/`isTokenShaped` de `src/activation/token.ts` (SHA-256 de 32 bytes base64url).

### Endpoints OAuth (`OAuthServerController`, todos `@Public` exceto os do consentimento)
- `POST /oauth/register` (RFC 7591, throttle de credenciais): `client_name`, `redirect_uris` (https, ou `http://localhost|127.0.0.1` em qualquer porta), `token_endpoint_auth_method` → 201 com `client_id` (+`client_secret` se pedido). DTO com class-validator; resposta em snake_case.
- `GET /oauth/authorize`: valida `response_type=code`, `client_id`, `redirect_uri` registrado, `code_challenge` + `S256`, `scope` ⊆ suportados (padrão `budget:read budget:write`), `resource` = `McpConfig.resource` (opcional). Erro antes de confiar no `redirect_uri` → 400 JSON; depois → redirect com `error=`. Sucesso: cria `OAuthAuthorizationRequest` e redireciona para `${WEB_URL}/autorizar-agente?request=<id>`.
- Consentimento (exigem sessão, `@CurrentUser`): `GET /oauth/requests/:id` → `{ client: { name, redirectHost }, scopes }` (404 vencido/inexistente); `POST /oauth/requests/:id` `{ approve: boolean }` → `{ redirectUrl }` (aprova: gera código vinculado ao usuário; nega: `error=access_denied`; o pedido é consumido nos dois casos). Usuários com `pending` nunca chegam aqui (não têm sessão).
- `POST /oauth/token` (`application/x-www-form-urlencoded` e JSON; respostas RFC 6749 `{ error, error_description }`): `authorization_code` (PKCE S256, `redirect_uri` e `client_id` iguais, código de uso único — reuso revoga o grant emitido), `refresh_token` (rotação com `previousRefreshHash` como no `SessionService`, escopo pode só diminuir). Retorna `access_token`, `refresh_token`, `token_type: 'Bearer'`, `expires_in`, `scope`. `Cache-Control: no-store`.
- `POST /oauth/revoke` (RFC 7009, sempre 200).
- Gerência pelo usuário (sessão): `GET /oauth/grants` (conexões ativas: cliente, escopos, criado/último uso) e `DELETE /oauth/grants/:id` (204; 404 se não for do usuário).
- Express não parseia `x-www-form-urlencoded` hoje: habilitar `urlencoded` no `configureApp` (ou só na rota de token).

### Endpoint MCP (processo MCP; `McpController` com `McpBearerGuard`, sem guard de cookie)
- `POST /mcp`: `McpBearerGuard` lê `Authorization: Bearer`, `McpAuthService.verify` (hash → grant não revogado, não expirado, `resource` igual, atualiza `lastUsedAt` no máximo 1×/min) e põe `{ userId, scopes }` no request. Falha → 401 com `WWW-Authenticate: Bearer resource_metadata="<url do protected resource>"` (e `error="invalid_token"` quando havia token); escopo insuficiente → 403 `insufficient_scope`.
- `McpServerFactory.create({ userId, scopes })` registra as ferramentas; as de escrita só quando há `budget:write`. Em seguida `transport.handleRequest(req, res, req.body)`; fechar server/transport em `res.on('close')`.

### Ferramentas (`src/mcp/tools/*.ts`)
Valores em **centavos inteiros** (`amountCents`), meses `YYYY-MM`. Cada ferramenta: schema zod (descrição para o LLM), depois **valida com o DTO existente** via um helper `validateDto(Class, input)` (`plainToInstance` + `validate` com `whitelist`/`forbidNonWhitelisted`, mesmas regras do `ValidationPipe`), chama o service e devolve `structuredContent` + texto JSON. `HttpException` → resultado `isError: true` com a mensagem (404 continua 404, sem vazar existência). Annotations `readOnlyHint` / `destructiveHint` / `idempotentHint`.

Leitura (`budget:read`):
| tool | service |
|---|---|
| `get_categories` | `BudgetService.categories` (árvore tipo → categoria, com `active`, `goalPercent`) |
| `get_budget_summary {month}` | `BudgetService.summary` |
| `get_budget_lines {from,to}` | `BudgetService.lines` + `entries` (≤ 24 meses) |
| `list_transactions {month}` | `TransactionService.list` |
| `list_payment_methods {month}` | `PaymentMethodService.list` |

Escrita (`budget:write`):
| tool | service |
|---|---|
| `create_category_type` / `update_category_type` / `delete_category_type` | `CategoryService.createGroup/updateGroup/deleteGroup` |
| `create_category` / `update_category` / `delete_category` | `CategoryService.createCategory/updateCategory/deleteCategory` |
| `create_transaction` (com `repeatMonths`, `openEnded`, `adjustment`) | `TransactionService.create` |
| `update_transaction` / `delete_transaction` (`scope` ONE\|FOLLOWING) | `TransactionService.update/remove` |
| `set_transaction_realized` (`realizedCents` ou `null` para voltar a pendente) | `TransactionService.setRealized` / clear |
| `set_series_end` | `TransactionService.setSeriesEnd` |
| `set_budget_cells` | `BudgetService.saveLines` |
| `set_initial_balance` | `BudgetService.setInitialBalance` |

`McpModule` importa `BudgetModule` (passa a exportar `BudgetService` e `CategoryService` além de `TransactionService`), `PaymentMethodsModule` (exportar `PaymentMethodService`) e `OAuthServerCoreModule` (verificação de token). **Só o `McpAppModule` o registra**; o `AppModule` registra o `OAuthServerModule` (endpoints do authorization server). Os controllers de domínio (`BudgetController` etc.) também sobem no processo MCP por estarem nos módulos; para não expô-los lá, o `McpAppModule` aplica um guard global que nega tudo fora de `/mcp` e `/.well-known` (ou os módulos ganham variantes sem controllers — escolher o guard, mais simples).

## Web (`apps/web`)

- `src/features/agents/{types,api,queries,hooks}.ts`: `getAuthorizationRequest`, `decideAuthorizationRequest`, `listGrants`, `revokeGrant`; `agentQueries.request(id)`, `agentQueries.grants()`.
- Rota `src/routes/autorizar-agente.tsx` (fora do `_app`, mesmo padrão de `completar-cadastro.tsx`: sem sessão → `/login?redirect=`): organism `AgentConsentCard` em `AuthLayout` — nome do cliente, host do redirect, escopos traduzidos ("Ler seu orçamento, categorias e lançamentos" / "Criar, alterar e excluir…"), botões **Permitir** / **Negar** → `window.location.assign(redirectUrl)`; pedido inválido/vencido → mensagem.
- Página `src/routes/_app/settings/agents.tsx` ("Agentes de IA", item novo no `UserMenu`): organism `ConnectedAgentsList` com as conexões e **Revogar** (AlertDialog), mais um bloco explicando a URL do servidor MCP (`MCP_PUBLIC_URL/mcp`, vindo de um `GET /oauth/info` público ou de `VITE_MCP_URL`) para colar no cliente.

## Testes

- **E2E API** (`apps/api/test/mcp-oauth.e2e-spec.ts`, `test/mcp.e2e-spec.ts`; `createTestMcpApp()` em `test/utils.ts` sobe o `McpAppModule` com `configureMcpApp`, ao lado do `createTestApp()`; helper `connectAgent(api, user)` em `test/mcp.ts` faz register → authorize → consentimento → token com PKCE na API e devolve o access token; chamadas MCP via Supertest no app MCP com JSON-RPC `initialize`/`tools/list`/`tools/call`):
  - **stdio** (`test/mcp-stdio.e2e-spec.ts`): no processo de teste, monta `McpCoreModule` e liga a factory a um `InMemoryTransport` com um `Client` do SDK, com principal resolvido pelo mesmo `resolveStdioPrincipal(env)`. Cobre: `MCP_ACCESS_TOKEN` válido, revogado no meio da sessão (a próxima chamada falha) e expirado; `MCP_USER_ID` com escopos só de leitura (não lista ferramentas de escrita), usuário inexistente ou pré-cadastro → erro; env ambígua → erro. Mais um smoke que **spawna** `dist/mcp/stdio.js` (`StdioClientTransport`) após o build, faz `initialize` + `tools/list` e confere que o stdout só tem JSON-RPC.
  - o app MCP não expõe as rotas REST (`GET /budget/categories` → 404) e a API principal não expõe `/mcp`.
  - metadata/well-known (com e sem `API_PREFIX`), 401 com `WWW-Authenticate`, DCR válido/inválido (redirect http não-local), authorize com erros (cliente desconhecido, redirect não registrado, sem PKCE, escopo/recurso inválido), consentimento negar/aprovar, pedido vencido, token: PKCE errado, código reusado, refresh rotacionado, token revogado/expirado, `resource` errado.
  - `tools/list` só com `budget:read` não expõe escrita; chamada de escrita sem escopo falha.
  - Fluxos reais: criar tipo/categoria, criar lançamento recorrente, realizar, editar com FOLLOWING, alterar células, resumo reflete.
  - **Isolamento**: token do usuário A não lê/altera/exclui dados do usuário B (`isError` com "not found"); A não revoga grant de B (404); A não decide pedido… (o pedido não tem dono até a decisão — garantir que o código vai para quem aprovou).
  - Validação: entrada inválida (centavos negativos, mês inválido, campo extra) → erro da ferramenta com a mensagem do DTO.
- **Unit**: `resolveStdioPrincipal` (combinações de env), `StderrLogger`, `McpAuthService`/`OAuthServerService` (PKCE, rotação, expiração), `validateDto`, redirect URI policy, cada arquivo de ferramentas com services mockados, `McpBearerGuard`.
- **Web**: `autorizar-agente.spec.tsx` (sem sessão → login; permitir/negar redireciona; pedido inválido) e `settings/agents.spec.tsx` (lista, revogar), mockando `@/features/agents/api`.

## CI/CD, Docker, docs

- `ci.yml`: sem serviços novos (o `prisma migrate deploy` já aplica a migration; os e2e sobem os dois apps em processo); o job `docker` faz um smoke de `node dist/mcp/main.js` se for barato, senão só garante que `dist/mcp/main.js` existe na imagem.
- Dockerfile: `dist/` inteiro já é copiado; nada novo além das dependências. `docker-compose.prod.yml` com o serviço `mcp` e `.env.prod.example` com `MCP_HOST`/`MCP_PUBLIC_URL`/`MCP_PORT`.
- `README.md` (PT): linha "Servidor MCP (agentes de IA)" na tabela de status, seção explicando o processo MCP separado (URL `https://<MCP_HOST>/mcp`, `start:mcp`, serviço no compose) e o uso por stdio (`MCP_ACCESS_TOKEN` para uso local; `MCP_USER_ID` só para uso interno), como conectar no Claude (conector remoto) e no Claude Code (`claude mcp add --transport http budget https://<MCP_HOST>/mcp`), escopos, envs novas.
- `CLAUDE.md`: bullet "MCP / OAuth server" na arquitetura da API e da web.

## Arquivos principais

- Novos: `apps/api/src/mcp/{main,stdio,stdio-principal,stderr-logger,mcp-core.module,mcp-app.module,mcp.setup,mcp.controller,mcp.config,mcp-server.factory,mcp-bearer.guard,validate-dto}.ts`, `src/oauth-server/{oauth-server.module,oauth-server-core.module,oauth-server.controller,oauth-server.service,token-verifier,well-known.controller,dto/*}.ts`, `src/mcp/tools/{categories,budget,transactions,payment-methods}.ts`, migration Prisma, specs.
- Alterados: `prisma/schema.prisma`, `src/app.module.ts`, `src/app.setup.ts` (exclude do prefixo, urlencoded), `src/web-app.ts` (well-known), `src/config/env.validation.ts`, `src/budget/budget.module.ts`, `src/payment-methods/payment-methods.module.ts`, `apps/api/package.json`, web (`routes/autorizar-agente.tsx`, `routes/_app/settings/agents.tsx`, `features/agents/*`, `UserMenu`), `README.md`, `CLAUDE.md`, `plans/servidor-mcp.md`.

## Verificação

1. `pnpm --filter api prisma migrate dev --name mcp_oauth --config prisma7.config.ts` e `prisma generate`.
2. `pnpm --filter api lint && pnpm --filter api test && pnpm --filter api test:e2e`; `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
3. Manual: subir API (`start:dev`), MCP (`start:mcp`) e web; `npx @modelcontextprotocol/inspector` apontando para `http://localhost:3001/mcp`, completar o OAuth pela tela de consentimento, listar/chamar ferramentas; derrubar a API e ver que o MCP continua respondendo com token válido; depois `claude mcp add --transport http budget http://localhost:3001/mcp` e pedir ao Claude para criar uma categoria e um lançamento, conferindo no dashboard/extrato; revogar na página "Agentes de IA" e ver o 401.
   - stdio: `claude mcp add budget-local -e DATABASE_URL=… -e MCP_ACCESS_TOKEN=<token do inspector> -- node apps/api/dist/mcp/stdio.js` e repetir os fluxos; revogar e ver a próxima chamada falhar. Com `MCP_USER_ID=<id>` e `MCP_SCOPES=budget:read`, conferir que só as ferramentas de leitura aparecem.
4. `scripts/docker-build.sh` e rodar a imagem com `node dist/mcp/main.js`, testar `/mcp` e `/.well-known/oauth-protected-resource` nela e o `/.well-known/oauth-authorization-server` na API (SPA fallback não engole o well-known).

## Notas da implementação

- Os modelos ficaram com prefixo `Mcp` (`McpClient`, `McpAuthorizationRequest`, `McpAuthorizationCode`, `McpGrant`) para não confundir com o `OAuthAccount` do login GitHub/Google. Migration `mcp_oauth`.
- A rotação do refresh usa a mesma janela de 30 s do `SessionService`; o instante da rotação é derivado de `accessExpiresAt − TTL` (sem coluna extra).
- `/oauth/authorize` com cliente ou redirect inválido leva à tela `/autorizar-agente?error=…` (mensagem amigável) em vez de JSON 400.
- Sem scripts `pnpm` para o stdio: o pnpm escreve no stdout e quebraria o JSON-RPC; usar `node dist/mcp/stdio.js`.
- Bug antigo corrigido de passagem: `PUT /budget/lines` zerando o mês de um lançamento avulso e preenchendo outro mês no mesmo envio dava 500 (`update` da âncora já apagada → `updateMany`).

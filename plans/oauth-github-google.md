# Login com GitHub e Google (OAuth) na API + fluxo no web

## Contexto
O web já mostra "Continuar com GitHub/Google" (`OAuthButton` → `getOAuthLoginUrl` → `/api/auth/<provider>`) e o `/login` já trata `?error=`, mas a API não tem essas rotas (hoje dá 404). Vamos implementar o OAuth na API e fechar o fluxo no web.

Decisões confirmadas:
- **Primeiro login via OAuth cria a conta só com nome/e-mail** e o usuário precisa **completar o cadastro** (nascimento + CEP/cidade/UF) antes de entrar no app.
- **Vínculo automático por e-mail verificado**: se o e-mail verificado pelo provedor já é de uma conta, a conta é vinculada; um pré-cadastro (convite de grupo) é assumido com o mesmo id, mantendo grupos e rateios.

## Abordagem na API
OAuth 2.0 Authorization Code + **PKCE (S256)** e `state`, feito à mão com `fetch` (Node 24). Sem passport-github/google: menos dependências e fácil de mockar no e2e. Depois do callback, a sessão é a mesma de hoje: `AuthService.signIn` mais `setAuthCookies`.

### Prisma
- Novo model `OAuthAccount { id, provider (enum GITHUB|GOOGLE), providerAccountId, userId → User (Cascade), email, createdAt; @@unique([provider, providerAccountId]); @@index([userId]) }`. `User.oauthAccounts`.
- Agora `passwordHash`/`birthDate`/`cep`/`city`/`state` também ficam `null` para uma conta OAuth com cadastro incompleto (o schema já é nullable, então só mudam os comentários). Migration `oauth_accounts`.
- `test/utils.ts` `resetDatabase`: apagar `oAuthAccount` antes de `user`.

### Configuração (`src/auth/oauth/oauth.config.ts`, `env.validation.ts`)
- Opcionais e sempre em pares: `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Só um dos dois preenchido → erro no boot.
- `WEB_URL` (padrão `http://localhost:5173`): para onde o callback redireciona.
- `OAUTH_CALLBACK_BASE_URL` (padrão `${WEB_URL}/api`): URL pública da API vista pelo navegador. O callback precisa passar pelo mesmo host do web (proxy do Vite em dev), senão os cookies de sessão ficam no host errado. O redirect URI é `${base}/auth/oauth/<provider>/callback`.
- Provider sem credenciais → as rotas redirecionam para `${WEB_URL}/login?error=oauth_unavailable`.

### Arquivos novos em `src/auth/oauth/`
- `providers.ts`: definição pura de cada provedor (`authorizeUrl(...)`, `fetchProfile(code, verifier, redirectUri) → { providerAccountId, email, emailVerified, name }`).
  - GitHub: `github.com/login/oauth/authorize` (scope `read:user user:email`), token em `/login/oauth/access_token` (`Accept: application/json`), `api.github.com/user` e `/user/emails`. Usa o e-mail `primary && verified`; nome = `name ?? login`.
  - Google: `accounts.google.com/o/oauth2/v2/auth` (scope `openid email profile`), token em `oauth2.googleapis.com/token`, `openidconnect.googleapis.com/v1/userinfo` (`sub`, `email`, `email_verified`, `name`).
  - Resposta HTTP não-ok ou formato inesperado → `OAuthProviderError`.
- `oauth-state.ts`: gera `state` e `code_verifier` (`randomBytes` base64url) e o `code_challenge` S256. Também tem `safeRedirectPath(value)` (só aceita caminho relativo começando com `/`, nunca `//` ou `/\`, senão `/`), igual ao `safeRedirect` do web.
- `oauth.service.ts` (`OAuthService`):
  - `start(provider, redirect)` → `{ url, cookie }`. O cookie `oauth_state` é httpOnly, `sameSite: lax`, `path: /auth` (o proxy reescreve para `/api/auth`, igual ao refresh), dura 10 min e guarda `{ provider, state, verifier, redirect }` em JSON.
  - `finish(provider, query, cookie)`: confere o cookie (presente, mesmo provider, `state` igual ao da query) e depois `fetchProfile`. Exige `emailVerified`. Em seguida `resolveUser`:
    1. existe `OAuthAccount (provider, id)` → esse usuário;
    2. senão, procura pelo e-mail normalizado (`normalizeEmail`): pré-cadastro → `UserService.claimPending(email, { name })` + vínculo; conta registrada → só vínculo;
    3. senão, cria `User { email, name }` (sem senha nem perfil) + vínculo, em `$transaction`. Em `P2002` (corrida) refaz a busca uma vez (`isUniqueViolation`).
  - Erros viram códigos para o web: `access_denied` (o provedor devolveu `error=access_denied`), `oauth_state`, `oauth_email` (sem e-mail verificado), `oauth_failed` (falha no provedor), `oauth_unavailable`.
- `oauth.controller.ts` (`@Controller('auth/oauth')`, `@Public()`, throttle de 30/min por IP, com `@Res()` manual para redirecionar):
  - `GET /auth/oauth/:provider?redirect=`: seta o cookie e responde 302 para o provedor. Provider desconhecido → 404.
  - `GET /auth/oauth/:provider/callback?code&state&error`: sempre limpa o cookie de state. Sucesso → `signIn(user, sessionMeta)` + `setAuthCookies` + 302 para `${WEB_URL}${redirect}`. Erro → 302 para `${WEB_URL}/login?error=<code>`, preservando `redirect`.
  - Prefixo `/auth/oauth/` para não colidir com `GET /auth/me`.
- `AuthModule`: registra `OAuthController` e `OAuthService` e o provider `OAUTH_CONFIG` (padrão do `AUTH_CONFIG`).

### Estado da conta nas respostas de auth
- Novos `UserService.findAccountState(id)` → `{ needsProfile: !pending && birthDate == null, hasPassword: passwordHash != null }` e `createFromOAuth`, além dos helpers de `OAuthAccount`. `claimPending` é reaproveitado.
- `AuthUserDto` ganha `needsProfile` e `hasPassword`. Register, login, refresh, me e password devolvem esse formato (`AuthService` monta com `findAccountState`). `AuthUser` (usado por grupos etc.) não muda.
- Para completar o cadastro, reusa `PATCH /users/me` com `birthDate` + `cep`/`city`/`state`. O DTO já exige o endereço todo ou nada e o `updateProfile` já funciona com campos `null`. Nada novo no servidor.
- `POST /auth/password` para conta sem senha continua 404 (`findCredentialsById` já devolve `null`). O web esconde o formulário nesse caso. Definir senha para conta OAuth fica fora deste escopo.
- `validateCredentials` já recusa conta sem `passwordHash`. Uma conta OAuth sem senha não entra por e-mail/senha.

## Web
- `features/auth/oauth.ts`: `getOAuthLoginUrl(provider, redirect?, baseURL)` → `${base}/auth/oauth/${provider}` + `?redirect=` quando houver. `OAuthOptions`/`OAuthButton` recebem `redirect` do `LoginCard`/`SignupCard` (que já recebem `redirect`).
- `features/auth/errors.ts`: mensagens para `oauth_unavailable`, `oauth_state` ("Sua tentativa expirou…"), `oauth_email` ("Sua conta do provedor não tem e-mail verificado…") e `oauth_failed`.
- `features/auth/types.ts`: `AuthUser` ganha `needsProfile` e `hasPassword`.
- `routes/_app.tsx`: se `user.needsProfile`, redireciona para `/completar-cadastro?redirect=<location.href>`.
- Nova rota `routes/completar-cadastro.tsx` (fora do `_app`, com `AuthLayout`): sem sessão vai para `/login`; com `!needsProfile` vai para `safeRedirect(redirect)`. Renderiza o novo organism `CompleteProfileCard`, que usa nascimento + o molecule `AddressFields` + `useCepAddress()`, e valida com `validatePersonalData` (`register-validation.ts`), só nos campos de perfil. Envia pelo `updateProfile` de `features/profile/api` e, ao terminar, invalida `authQueries.me()` e `profileQueries.me()` e navega para o `redirect`. Se ficar mais limpo, extrair do `SignupForm` um molecule `BirthDateField`.
- `routes/_app/settings/password.tsx`: com `!user.hasPassword`, mostra um aviso ("Sua conta entra com GitHub/Google e não tem senha") no lugar do `ChangePasswordForm`.
- Fixtures de teste do `AuthUser` (`src/test/*`, mocks de `@/features/auth/api`) ganham `needsProfile: false, hasPassword: true`.

## Testes
- **API unit**: `providers.spec.ts` (fetch mockado: e-mail primary+verified do GitHub, `email_verified: false` do Google, erros HTTP), `oauth-state.spec.ts` (PKCE, `safeRedirectPath` com `//evil.com` e `https://…`), `oauth.service.spec.ts` (os ramos do `resolveUser` e o state inválido, com `PrismaService`/`UserService` mockados), `oauth.controller.spec.ts`, `env.validation`/config (par incompleto, padrões de `WEB_URL`/callback), `auth.service.spec.ts` (`needsProfile`/`hasPassword`).
- **API e2e** `test/oauth.e2e-spec.ts`: credenciais de teste no `vitest.config.e2e.ts` (como o `JWT_ACCESS_SECRET`), `vi.spyOn(globalThis, 'fetch')` simulando GitHub/Google. Casos:
  - o start redireciona com `code_challenge`, `state` e o cookie;
  - callback de usuário novo: cookies, 302 para o redirect, `/auth/me` com `needsProfile: true, hasPassword: false`; o `PATCH /users/me` completa o cadastro e `needsProfile` vira `false`;
  - segundo login acha pela conta vinculada, mesmo se o e-mail do provedor mudou;
  - conta com senha é vinculada e o id é o mesmo;
  - pré-cadastro de convite é assumido e o membro continua no grupo (`createGroup`/`addMember`);
  - state divergente ou sem cookie → `oauth_state`; `error=access_denied`; e-mail não verificado → `oauth_email`; token 500 → `oauth_failed`;
  - provider desconhecido → 404; `redirect=//evil.com` → `/`;
  - `POST /auth/password` de conta OAuth → 404;
  - isolamento: o usuário OAuth não lê dados de outro (404).
  - O caso `oauth_unavailable` fica no unit do controller/serviço.
- **Web**: `oauth.spec.ts` e `OAuthButton.spec.tsx` (nova URL e `redirect`), `login.spec.tsx`/`signup.spec.tsx` (hrefs com redirect, novas mensagens), `completar-cadastro.spec.tsx` (validação, envio, redirect, guard sem sessão / cadastro já completo), spec do `_app` mandando `needsProfile` para `/completar-cadastro`, spec da página de senha sem senha.

## CI, README e docs
- `.github/workflows/ci.yml`: nada novo se as credenciais de teste ficarem no `vitest.config.e2e.ts`. A migration entra no `migrate deploy` que já existe.
- `apps/api/.env.example`: as novas variáveis, comentadas.
- `README.md`:
  - "Status dos recursos": Login com GitHub e Google → ✅/✅;
  - seção de autenticação: o fluxo e o completar cadastro;
  - variáveis de ambiente;
  - setup: como criar o OAuth App no GitHub e o client no Google Cloud. Callbacks de dev: `http://localhost:5173/api/auth/oauth/github/callback` e `.../google/callback`;
  - deploy: `WEB_URL`/`OAUTH_CALLBACK_BASE_URL` no mesmo site do web.
- `CLAUDE.md`: bullet de OAuth na arquitetura da API (`src/auth/oauth/`, `OAuthAccount`, `needsProfile`/`hasPassword`) e no web (`/completar-cadastro`, guard).

## Verificação
1. `pnpm --filter api prisma generate --config prisma7.config.ts`, depois `pnpm --filter api lint && pnpm --filter api test && pnpm --filter api build`.
2. `cd apps/api && DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm test:e2e`.
3. `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
4. Manual, com credenciais reais no `.env`: `pnpm start:dev` na API e no web, "Continuar com GitHub" → consentimento → `/completar-cadastro` → dashboard. Sair e entrar de novo deve ir direto ao dashboard. Repetir com Google usando o e-mail de uma conta com senha e conferir que é a mesma conta.

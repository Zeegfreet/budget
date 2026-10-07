# Login seguro: e-mail + senha, GitHub e Google, rotas protegidas (web)

## Context
A primeira versão de `/login` (já implementada) tem só botões OAuth (GitHub, Google, Microsoft) e nenhuma proteção: qualquer pessoa acessa `/` sem login. Agora o usuário quer:
- entrada com **e-mail + senha** (o model `User` já tem `email` único);
- botões de login via **GitHub e Google/Gmail** (sai a Microsoft);
- segurança de verdade no front: sessão em **cookie httpOnly** (o JS nunca vê o token) e **páginas internas protegidas**, com redirect para `/login`.

A API de auth ainda não existe. O web passa a depender de um contrato que a API vai implementar depois, e os testes mockam `features/auth/api.ts`. Enquanto a API não existir, abrir o app sempre leva ao login, e isso é intencional (fail-closed).

### Contrato esperado da API (documentado no README)
| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` | 200 `AuthUser` + `Set-Cookie` httpOnly/Secure/SameSite=Lax; 401 com mensagem genérica; 429 em excesso de tentativas |
| GET | `/auth/me` | — | 200 `AuthUser` ou 401 |
| POST | `/auth/logout` | — | 204, limpa o cookie |
| GET | `/auth/github`, `/auth/google` | — | redirect OAuth; o callback volta para `/login?error=<code>` em caso de falha |

`AuthUser = { id: number; email: string; name: string | null }`

## Changes

### Passo 0
- Copiar este plano para `plans/web-login-screen.md` na raiz do projeto, substituindo a versão anterior (preferência do usuário: os planos ficam em `plans/`).

### Feature `auth` (`src/features/auth/`)
- `types.ts`: `OAuthProvider = 'github' | 'google'`, `AuthUser`, `LoginInput { email; password }`.
- `api.ts` (só chamadas HTTP, fácil de mockar): `login(input)`, `fetchMe()`, `logout()`.
- `oauth.ts`: aqui ficam `oauthProviders` (GitHub; Google com hint "Gmail") e `getOAuthLoginUrl`, que hoje estão em `api.ts`.
- `queries.ts`: `authQueries.me()`, um `queryOptions` com chave `['auth','me']`, `retry: false` e `staleTime` curto.
- `errors.ts`: mantém `getLoginErrorMessage` (OAuth) e ganha `getCredentialsErrorMessage(ApiError)`: 401/400 → "E-mail ou senha inválidos." (genérica, sem revelar se o e-mail existe), 429 → "Muitas tentativas. Aguarde um pouco.", demais casos → mensagem padrão.
- `redirect.ts`: `safeRedirect(path)` aceita só caminhos internos (começam com `/` e não com `//` nem `/\`). Qualquer outra coisa vira `/`, o que **evita open redirect** via `?redirect=`.

### HTTP client
- `src/lib/api/client.ts`: `withCredentials: true`, para o cookie de sessão ir junto (o proxy do Vite já deixa tudo same-origin em dev). Trocar o comentário "Auth header injection…" por uma nota sobre o cookie.

### Rotas e proteção
- `src/routes/_app.tsx`: `beforeLoad` chama `context.queryClient.ensureQueryData(authQueries.me())`. Em `ApiError` 401, faz `throw redirect({ to: '/login', search: { redirect: location.href } })`. Outros erros são relançados, e o conteúdo protegido nunca renderiza. O usuário é devolvido no contexto (`{ user }`).
- `src/routes/login.tsx`:
  - `validateSearch`: `{ redirect?: string; error?: string }`, só strings.
  - `beforeLoad`: se `me` resolver (com `fetchQuery`, ignorando erro), redireciona para `safeRedirect(redirect)`.
  - renderiza `AuthLayout` + `LoginCard`.

### Componentes (Atomic Design)
- `atoms/BrandIcon.tsx`: remover o caso `microsoft`.
- `molecules/PasswordField.tsx` (novo): reaproveita a estrutura de `FormField` (`Field`, `FieldLabel`, `FieldError`, `aria-describedby`). Tem um botão "Mostrar/Ocultar senha" (ícones `Eye`/`EyeOff` do lucide, `aria-pressed`, `type="button"`) e `autoComplete="current-password"`.
- `molecules/OAuthButton.tsx`: sem mudanças de API. Continua com o hint em `sr-only`.
- `organisms/LoginForm.tsx` (novo): `<form noValidate method="post">` com `FormField` de e-mail (`type="email"`, `autoComplete="email"`) e `PasswordField`, mais o botão "Entrar" (com `Spinner` e `disabled` enquanto está pendente).
  - Validação no cliente, sem libs novas: e-mail obrigatório e com formato válido; senha obrigatória. O e-mail passa por `trim`, a senha não.
  - `useMutation(login)`. No sucesso, faz `queryClient.setQueryData(authQueries.me().queryKey, user)` e `navigate({ to: safeRedirect(redirect) })`.
  - No erro: `role="alert"` com `getCredentialsErrorMessage`, a senha é limpa e o foco volta para ela.
  - `preventDefault`, para os dados nunca irem para a URL.
- `organisms/LoginCard.tsx`: título "Entrar no Budget" → `LoginForm` → separador "ou" (`ui/separator`) → botões GitHub e Google → rodapé de termos. O alerta de `?error=` do OAuth continua.
- `organisms/AppHeader.tsx`: botão "Sair" (`useMutation(logout)`). No sucesso, ou mesmo em erro, faz `queryClient.clear()` e `navigate({ to: '/login' })`. Mostra o e-mail do usuário logado via `useQuery(authQueries.me())`.
- Barrels `molecules/index.ts` e `organisms/index.ts` atualizados.

### Tests (Vitest + Testing Library, `renderRoute`, mockando `@/features/auth/api`)
- `routes/login.spec.tsx` (reescrito):
  - renderiza o formulário, o GitHub e o Google com os `href`s certos, e **não** mostra Microsoft nem `banner`;
  - enviar vazio ou com e-mail inválido mostra os erros por campo e não chama `login`;
  - login bem-sucedido chama `login({ email, password })` e navega para `/` (home renderizada, com `fetchUsers` mockado);
  - `?redirect=/algum` vai para o redirect, e `?redirect=//evil.com` cai em `/`;
  - 401 mostra "E-mail ou senha inválidos.", limpa a senha e mantém o e-mail; 429 mostra a mensagem de limite;
  - o botão fica desabilitado enquanto está pendente; o toggle de senha alterna o `type`;
  - usuário já autenticado em `/login` é redirecionado para `/`;
  - `?error=access_denied` e os erros genéricos de OAuth continuam cobertos.
- `routes/_app/index.spec.tsx`:
  - mockar `fetchMe` resolvido nos casos existentes;
  - novo caso: `fetchMe` rejeitando com 401 em `/` redireciona para `/login?redirect=%2F` e não renderiza o conteúdo;
  - "Sair" chama `logout` e vai para `/login`.
- Unit: `features/auth/redirect.spec.ts`, `errors.spec.ts`, `oauth.spec.ts` (o antigo `api.spec.ts` é renomeado e ajustado), `molecules/PasswordField.spec.tsx`, `OAuthButton.spec.tsx` (trocar o caso Microsoft pelo Google/Gmail).

### CI / README
- CI: sem mudança (o job web já roda routes → lint → test → build).
- README (pt-BR):
  - "Status dos recursos" → Autenticação: Web 🚧, "Login com e-mail/senha, GitHub e Google; sessão por cookie httpOnly; rotas protegidas. API pendente".
  - Nova subseção "Autenticação" com o contrato acima e os requisitos para a API: hash de senha com argon2/bcrypt, rate limit no login, mensagem genérica no 401, cookie `httpOnly; Secure; SameSite=Lax`, CORS com `credentials` se `VITE_API_URL` for de outra origem.
  - Atualizar a nota de setup sobre `/login`: o app sempre redireciona para o login enquanto a API não existir.

## Verification
- `cd apps/web && pnpm generate:routes && pnpm lint && pnpm test && pnpm build`
- `pnpm start:dev`:
  - `/` redireciona para `/login?redirect=%2F`;
  - o formulário valida os campos;
  - os links GitHub e Google apontam para `/api/auth/*`;
  - sem API, o envio mostra um erro, não uma tela quebrada.

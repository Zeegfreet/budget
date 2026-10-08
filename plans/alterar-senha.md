# Centralizar "Editar perfil" + tela "Alterar senha"

## Context
- `/settings/profile` renderiza `<ProfileForm>` (Card `max-w-xl`) dentro de um `flex flex-col` no layout fluido → o card fica colado à esquerda.
- `/settings/password` hoje é um placeholder "Em breve" (README marca ⏳/🚧). Falta a API e a tela: senha atual + nova + confirmação.

## 1. Centralizar o perfil (web)
- `src/routes/_app/settings/profile.tsx`: wrapper vira `mx-auto flex w-full max-w-xl flex-col gap-6` (título e card centralizados na mesma coluna).
- `src/components/organisms/ProfileForm.tsx`: tirar `max-w-xl` do `Card` (a largura passa a vir da página).
- A tela de senha usa o mesmo wrapper.

## 2. API: `POST /auth/password`
Fica em `/auth` de propósito: o cookie de refresh tem `path=/auth`, então a rota recebe a sessão atual.

- `src/auth/dto/change-password.dto.ts` — `ChangePasswordDto { currentPassword: string (IsString, MaxLength 128), newPassword: string (IsString, MinLength/MaxLength de register.dto.ts) }`, com `@ApiProperty`.
- `AuthService.changePassword(userId, dto, meta)`:
  - `UserService.findPasswordHash(id)` (novo; retorna `passwordHash` só para essa checagem; `null`/pré-cadastro → 404 `User not found`).
  - `argon2.verify` falhou → **403** `Current password is incorrect` (não 401, para o interceptor do web não tentar refresh).
  - `newPassword === currentPassword` → 400 `New password must differ from the current one`.
  - `argon2.hash` (argon2id, como em `register`) → `UserService.updatePasswordHash(id, hash)`.
  - `SessionService.revokeAllForUser(userId)` (novo, `updateMany where { userId, revokedAt: null }`) e depois `signIn(user, meta)` → outros aparelhos perdem o refresh; este recebe cookies novos.
- `AuthController`: `@Throttle(CREDENTIALS_THROTTLE) @HttpCode(200) @Post('password')`, `@CurrentUser()`, retorna o `AuthUserDto` via `this.open(res, …)`; Swagger: 200/400/403/404/429/401.
- Unit: `auth.service.spec.ts` (senha errada, igual à atual, sucesso revoga e abre sessão), `auth.controller.spec.ts` (seta cookies), `session.service.spec.ts` (`revokeAllForUser`), `user.service.spec.ts` (novos métodos).
- E2E em `test/auth.e2e-spec.ts` (`describe('POST /auth/password')`): 401 sem sessão; 400 campos faltando/desconhecidos/nova < 8; 403 senha atual errada; 400 nova = atual; sucesso → login com a nova funciona, com a antiga dá 401; refresh token antigo de outra sessão (outro login) passa a dar 401; a sessão atual continua (cookies novos funcionam em `/auth/refresh`); isolamento: usuário A troca a senha e o login do B segue igual.

## 3. Web: tela de alteração de senha
- `src/features/auth/api.ts`: `changePassword({ currentPassword, newPassword }): Promise<AuthUser>`; tipo `ChangePasswordInput` em `types.ts`.
- `src/features/auth/password-validation.ts` (+ spec): `validatePasswordChange({ currentPassword, newPassword, passwordConfirmation })` reusando `MIN_PASSWORD_LENGTH` de `register-validation.ts` — "Informe sua senha atual.", "Crie uma nova senha.", "Use pelo menos 8 caracteres.", "A nova senha deve ser diferente da atual.", "Confirme a nova senha.", "As senhas não coincidem.". (Extrair de `validateRegister` o trecho nova+confirmação num helper compartilhado.)
- `src/features/auth/errors.ts` (+ spec): `getChangePasswordErrorMessage` — 403 → erro do campo "Senha atual incorreta."; 400 → "Confira os dados informados."; 429 → `tooManyAttemptsMessage`; 0/404/5xx → `serverUnavailableMessage`.
- `src/features/auth/hooks.ts`: `useChangePassword()` (mutation; `onSuccess` faz `setQueryData(authQueries.me())`).
- Organism `src/components/organisms/ChangePasswordForm.tsx` (exportar no barrel): Card "Alterar senha" com 3 `PasswordField` (`current-password`, `new-password`, `new-password`), `FormAlert` para erro geral, botão com `Spinner`, sucesso com `role="status"` "Senha alterada. Os outros aparelhos foram desconectados." (mesmo padrão do `ProfileForm`). Após erro ou sucesso, limpa os campos (nunca manter senha rejeitada); erro 403 foca a senha atual.
- `src/routes/_app/settings/password.tsx`: substitui o `EmptyState` pelo título + `ChangePasswordForm` no wrapper centralizado.
- `password.spec.tsx` reescrito (mock de `@/features/auth/api` incluindo `changePassword`): renderiza formulário; validações client-side (vazio, < 8, não coincidem, igual à atual) sem chamar a API; sucesso envia `{ currentPassword, newPassword }` e mostra o status e limpa os campos; 403 mostra "Senha atual incorreta." no campo; 429 mensagem genérica; redirect para /login mantém-se.
- `profile.spec.tsx`: sem mudança de comportamento (centralização é só classe).

## 4. Docs
- `README.md`: linha "Alterar senha" → ✅/✅ com descrição; tabela de endpoints de auth ganha `POST /auth/password` (corpo, 200/400/403/429, revoga as outras sessões; o access token de outro aparelho ainda vale até expirar).
- `CLAUDE.md`: uma frase em Auth sobre `POST /auth/password` e em Web/Profile sobre `ChangePasswordForm`.
- CI: nada novo (sem migration, env ou dependência).

## Verificação
- `pnpm --filter api lint && pnpm --filter api test`
- `cd apps/api && DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm test:e2e`
- `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`

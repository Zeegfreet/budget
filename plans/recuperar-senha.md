# Recuperação de senha ("Esqueci minha senha")

## Context
Hoje quem esquece a senha não tem saída: só existe `POST /auth/password` (exige a senha atual) e o reenvio do link de ativação. Vamos criar o fluxo por e-mail, reaproveitando o desenho do link de ativação (token opaco de 32 bytes, só o SHA-256 no banco, uso único, `AccountMailer`/`MailService`, `MemoryMailTransport` nos e2e).

Decisões:
- **Pedido sempre responde 204** (não revela se o e-mail existe). Desconhecido → nada; **pré-cadastro** → reenvia o link de concluir cadastro (`sendPreRegistration`, igual a `AccountMailer.resend`); qualquer outra conta (inclusive não ativada e conta só OAuth, sem senha) → e-mail de redefinição.
- Link curto: `PASSWORD_RESET_TOKEN_TTL_MINUTES` (padrão **60**), uso único; emitir um novo invalida os anteriores.
- Redefinir: grava o novo hash (argon2id), **marca `emailVerifiedAt` se nulo** (o link prova o e-mail), apaga os tokens de redefinição do usuário, **revoga todas as sessões** e **abre uma sessão** para este cliente (como a ativação), indo ao `/`.
- E-mail de aviso "Sua senha foi alterada" após a redefinição.
- `POST /auth/password` (troca com senha atual) passa a apagar também os tokens de redefinição pendentes.

Passo 0 da implementação: salvar uma cópia deste plano em `plans/recuperar-senha.md`.

## 1. API

### Banco
- `schema.prisma`: `model PasswordResetToken { id, userId (Cascade), tokenHash @unique, expiresAt, createdAt, @@index([userId]) }` + `User.passwordResetTokens`. Migration `password_reset_token` (`prisma migrate dev --name password_reset_token --config prisma7.config.ts`).

### Código (em `src/activation/`, que já é o módulo de links por e-mail)
- `token.ts` (novo): extrair de `activation.service.ts` `hashToken`, `isTokenShaped` e `newToken()` (randomBytes(32) base64url); `ActivationService` passa a importá-los.
- `activation.config.ts`: `ActivationConfig.resetTtlMinutes` (`PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 60`). `env.validation.ts`: adicionar a chave em `positiveIntegers`.
- `password-reset.service.ts` (novo, `PasswordResetService`, exportado pelo `ActivationModule`):
  - `issue(userId, now)` → apaga os tokens do usuário + cria (transação), retorna o segredo.
  - `inspect(token, now)` → `AuthUser` de um token válido (usuário `pending: false`) ou `null`.
  - `reset(token, passwordHash, now)` → transação: `deleteMany` do token válido + `user.updateMany({ where: { id, pending: false }, data: { passwordHash, emailVerifiedAt: existente ?? now } })` + apaga os demais tokens do usuário; 404 `Invalid or expired password reset link` se algo não bateu. Para o `emailVerifiedAt` condicional: dois `updateMany` (um com `emailVerifiedAt: null` → `now`) ou ler na transação.
  - `revokeFor(userId)` → apaga os tokens (usado pela troca de senha).
  - `linkFor(token)` = `webUrlFor('/redefinir-senha?token=…')`; `ttlMinutes`.
- `PasswordResetService.findTarget(email)` → `AuthUser & { pending }` ou `null` (consulta própria; o `ActivationModule` não importa `UserModule`).
- `AccountMailer`: `sendPasswordReset(email)` aplica a regra (desconhecido → nada, pré-cadastro → `sendPreRegistration`, demais → link de redefinição); `sendPasswordChanged(user)`.
- `mail/templates.ts`: `passwordResetEmail({ name, url, ttlMinutes })` ("Redefina sua senha no Budget", botão "Redefinir senha", nota "O link vale por 60 minutos e só pode ser usado uma vez." + "Se você não pediu, ignore; sua senha continua a mesma.") e `passwordChangedEmail({ name, url: /login })`. Extrair um `validForMinutes` ao lado do `validFor`.

### Auth
- DTOs em `src/auth/dto/password-reset.dto.ts`: `ForgotPasswordDto { email }` (`IsEmail`, mesmo do `ResendActivationDto`), `PasswordResetTokenDto { token }`, `ResetPasswordDto { token, password }` (Min/Max de `register.dto.ts`), `PasswordResetInfoDto { email, name }`.
- `AuthService`: `forgotPassword(email)` (normaliza, delega ao mailer), `passwordResetInfo(token)` (404 se inválido), `resetPassword({ token, password }, meta)` → hash, `reset`, `sessions.revokeAllForUser`, `mailer.sendPasswordChanged`, `signIn`. `changePassword` chama `passwordReset.revokeFor(userId)`.
- `AuthController` (todas `@Public`; POSTs com `CREDENTIALS_THROTTLE`):
  - `POST /auth/password/forgot` → 204.
  - `GET /auth/password/reset?token=` → `{ email, name }` | 404 (sem efeitos; o link segue válido).
  - `POST /auth/password/reset` → 200 `AuthUserDto` + cookies | 400 | 404.
  Swagger com as respostas de cada um.

### Testes
- Unit: `password-reset.service.spec.ts` (issue substitui, inspect expirado/formato inválido, reset uso único/ativa conta), `account-mailer.spec.ts` (pré-cadastro → pre-registration; desconhecido → nada; demais → reset), `templates.spec.ts`, `auth.service.spec.ts`, `auth.controller.spec.ts`, `env.validation` spec se existir.
- E2E `test/password-reset.e2e-spec.ts`: e-mail com link `http://web.test/redefinir-senha?token=` e "60 minutos"; 204 para e-mail desconhecido sem enviar nada; pré-cadastro recebe o link de concluir cadastro; 400 e-mail inválido/campo extra; GET info 200/404 (token inválido, expirado via `prisma.passwordResetToken.update`); POST sucesso → sessão aberta (`/auth/me`), login com a nova ok e com a antiga 401, refresh de outra sessão vira 401, aviso "senha alterada" enviado; link reutilizado → 404; pedir de novo invalida o link anterior; senha curta 400; conta não ativada fica ativa e consegue logar; conta OAuth sem senha passa a ter `hasPassword`; troca de senha (`POST /auth/password`) invalida link pendente; isolamento: token de A só altera A (B continua logando).
- `test/mail.ts`: `tokenFrom(message, page = 'ativar-conta')` aceitando `'redefinir-senha'`.

## 2. Web

- `features/auth/types.ts`: `PasswordResetInfo`, `ResetPasswordInput`. `api.ts`: `requestPasswordReset(email)`, `fetchPasswordReset(token)`, `resetPassword({ token, password })`. `queries.ts`: `passwordResetQueries.byToken(token)` (retry false, staleTime Infinity). `hooks.ts`: `useRequestPasswordReset()`, `useResetPassword()` (`setQueryData(authQueries.me())`).
- `errors.ts` (+spec): `passwordResetSentMessage` ("Se houver uma conta com este e-mail, enviamos um link para redefinir a senha."), `invalidPasswordResetLinkMessage` ("Este link de redefinição é inválido ou expirou. Peça um novo."), `getPasswordResetErrorMessage` (404/400/429/0/5xx, mesmo molde de `getActivationErrorMessage`).
- Organisms (no barrel):
  - `ForgotPasswordCard` (`email?` inicial): campo e-mail validado com `EMAIL_PATTERN`, botão "Enviar link"; sucesso mostra `role="status"` com a mensagem neutra; link "Voltar para o login".
  - `ResetPasswordCard` (`token?`): spinner enquanto consulta; inválido → `FormAlert` + link "Pedir novo link" (`/esqueci-senha`); válido → "Redefinir senha" para **e-mail** (read-only no texto), `PasswordField` nova + repetir (`validateNewPassword` de `register-validation.ts`, `autoComplete="new-password"`), campos limpos após resposta da API; sucesso → `navigate('/')`. Nunca usa o link ao carregar.
- Rotas (fora do `_app`, com `AuthLayout`): `src/routes/esqueci-senha.tsx` (`?email=`) e `src/routes/redefinir-senha.tsx` (`?token=`), no molde de `verificar-email.tsx`/`ativar-conta.tsx`.
- `LoginForm`: link "Esqueci minha senha" sob o campo de senha → `/esqueci-senha` com `search: { email }` quando já digitado.
- Specs: `esqueci-senha.spec.tsx` (validação sem chamar API, envio + mensagem neutra, 429, voltar ao login), `redefinir-senha.spec.tsx` (sem token/404 → mensagem + link; validações; sucesso envia `{ token, password }` e cai no dashboard — mock de budget api; 400/404 na submissão), `login.spec.tsx` (link leva à tela com o e-mail preenchido). Mocks de `@/features/auth/api` ganham `requestPasswordReset`, `fetchPasswordReset`, `resetPassword` onde a tela é renderizada.

## 3. Docs / CI
- `README.md`: linha "Recuperação de senha" na tabela de status (✅ API/✅ Web), endpoints de auth, env `PASSWORD_RESET_TOKEN_TTL_MINUTES`.
- `CLAUDE.md`: parágrafo curto na parte de Account activation (API) e de Web sobre o fluxo, rotas e helpers.
- CI: sem passo novo (a migration já roda por `prisma migrate deploy`; env com default).

## Verificação
- `pnpm --filter api prisma generate --config prisma7.config.ts`, `pnpm --filter api lint`, `pnpm --filter api test`, `DATABASE_URL=file:./test.db pnpm --filter api exec prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm --filter api test:e2e`.
- `pnpm --filter web lint`, `pnpm --filter web test`, `pnpm --filter web build`.
- Manual: API sem `SMTP_HOST` loga o e-mail (`LogMailTransport`); abrir o link no web, redefinir, confirmar login com a nova senha.

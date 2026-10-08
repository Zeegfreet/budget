# Ativação de conta por e-mail (SMTP)

## Context

Hoje o cadastro (`POST /auth/register`) abre sessão na hora, sem provar que a pessoa controla o e-mail, e o convite de grupo para um e-mail sem conta cria um pré-cadastro (`User.pending`) sem que a pessoa seja avisada. Queremos um serviço de envio de e-mail (SMTP) na API e:

1. **Novo cadastro** → a conta nasce **não ativada**; o login fica bloqueado até clicar no link de ativação enviado por e-mail.
2. **E-mail sem conta adicionado a um grupo** (pré-cadastro) → e-mail com link para uma tela **Ativar conta**, onde a pessoa define nome, senha, nascimento e endereço; ao concluir, a conta fica ativa (o token prova o e-mail) e a sessão é aberta.
3. **Usuário já cadastrado convidado a um grupo** → e-mail de aviso do convite com link para `/grupos` (aceitar/recusar).

Escopo: API + Web, com testes, CI e README (definition of done do CLAUDE.md). Ao executar, salvar uma cópia deste plano em `plans/ativacao-conta-email.md` (convenção do projeto).

## API

### 1. Schema + migração (`apps/api/prisma/schema.prisma`)
- `User.emailVerifiedAt DateTime?` — `null` = não ativada. A migração faz backfill: `UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "pending" = false` (contas existentes e OAuth seguem entrando).
- Novo `ActivationToken { id, userId (Cascade), tokenHash @unique, expiresAt, createdAt, @@index([userId]) }`. Token opaco (32 bytes base64url) guardado como SHA-256, igual ao `SessionService`. Emitir um novo token apaga os anteriores do usuário; consumir apaga o token.
- `prisma migrate dev --name account_activation --config prisma7.config.ts`; adicionar `activationToken` ao `resetDatabase` em `test/utils.ts`.

### 2. Módulo de e-mail (`src/mail/`)
- `mail.config.ts`: `MAIL_CONFIG` a partir de `SMTP_HOST`, `SMTP_PORT` (padrão 587), `SMTP_SECURE` (padrão `false`), `SMTP_USER`/`SMTP_PASS` (par opcional), `MAIL_FROM` (padrão `Budget <no-reply@budget.local>`).
- `mail.transport.ts`: token `MAIL_TRANSPORT` com interface `{ send(message: MailMessage): Promise<void> }`; `SmtpMailTransport` (nova dependência `nodemailer` + `@types/nodemailer`) quando há `SMTP_HOST`, senão `LogMailTransport` (escreve destinatário, assunto e texto no `Logger` — em dev o link aparece no console).
- `mail.service.ts`: `MailService.send(message)` aguarda o transporte e **nunca derruba a requisição**: em caso de falha registra `logger.error` e retorna `false` (o usuário pode reenviar).
- `templates.ts` (puro, PT-BR, `text` + `html` com escape de HTML): `activationEmail({ name, url })`, `preRegistrationEmail({ nickname, inviterName, groupName, url })`, `groupInvitationEmail({ name, inviterName, groupName, url })`. Todos com "se não foi você, ignore este e-mail".
- `MailModule` exporta `MailService`.
- `src/config/web-url.ts`: extrair `webUrlFrom(config)` (hoje dentro de `oauthConfigFactory` em `src/auth/oauth/oauth.config.ts`) e reutilizar nos links dos e-mails.

### 3. Tokens de ativação (`src/activation/`, `ActivationModule`, importa `PrismaModule`, `MailModule`)
- `ActivationTokenService`: `issue(userId)` → token em claro; `inspect(token)` → `{ user: { id, email, name, pending } }` ou `null` (inválido/expirado); `consume(tx, token)` (apaga e devolve o `userId`, ou `null`). TTL `ACTIVATION_TOKEN_TTL_HOURS` (padrão 72).
- `AccountMailer`: `sendActivation(user)` e `sendPreRegistration(user, { inviterName, groupName })` — emitem o token, montam `${WEB_URL}/ativar-conta?token=...` e enviam via `MailService`.
- Exporta os dois para `AuthModule` e `GroupsModule` (sem acoplar grupos ao módulo de auth).

### 4. Auth (`src/auth/`)
- **`POST /auth/register`**: cria a conta com `emailVerifiedAt: null`, **não abre sessão**, chama `sendActivation` e responde `201 { email }` (`RegisterResultDto`). Em `P2002`, `UserService.claimPending` passa a se chamar `claimUnverified` e assume tanto um pré-cadastro quanto uma conta **ainda não ativada** (sobrescreve senha/perfil, mantém o id e os grupos; o token antigo é invalidado) — evita que alguém "sequestre" um e-mail alheio com um cadastro nunca ativado. 409 só para conta ativada.
- **Login**: `validateCredentials` passa a devolver também `emailVerifiedAt`; senha válida + conta não ativada → **403** `Account not activated` (403, não 401, para o interceptor do web não tentar refresh; só acontece com a senha correta, então não vaza existência).
- **`POST /auth/activation/resend`** `{ email }` (`@Public`, throttle de credenciais): sempre **204**; envia `activationEmail` se a conta existe e não está ativada, ou o e-mail de pré-cadastro (sem dados de grupo) se `pending`.
- **`GET /auth/activation?token=`** (`@Public`): `{ email, name, kind: 'ACTIVATE' | 'COMPLETE_SIGNUP' }` (pré-cadastro → `COMPLETE_SIGNUP`); 404 `Invalid or expired activation link`.
- **`POST /auth/activation`** `{ token }` (`@Public`): conta não pendente → `emailVerifiedAt = now`, consome o token, `signIn` (cookies), devolve `SessionUser`. Token de pré-cadastro → 400 `Sign-up data required`. Inválido/expirado → 404.
- **`POST /auth/activation/signup`** `CompleteSignupDto` (= `OmitType(RegisterDto, ['email'])` + `token`): só para pré-cadastro (senão 400); `claimUnverified` com os dados + `emailVerifiedAt = now`, consome o token, `signIn`. 404 para inválido/expirado.
- **`UserService.findSessionUser`**: segue exigindo `pending: false`; sessão só é aberta após ativação, então não precisa filtrar por `emailVerifiedAt`.
- **OAuth** (`OAuthService.resolveUser`): o provedor provou o e-mail, então novo usuário nasce com `emailVerifiedAt = now`; ao assumir um pré-cadastro ou vincular uma conta não ativada, define `emailVerifiedAt` e, se a conta não estava ativada, **zera o `passwordHash`** (senha nunca provada não sobrevive).

### 5. Grupos (`src/groups/invitation.service.ts`)
- Injetar `AccountMailer` e `MailService`. Após o commit de `invite`:
  - convidado `pending` → `sendPreRegistration(invitee, { inviterName, groupName })` (inclusive quando já era pré-cadastro por outro grupo: novo token substitui o anterior);
  - convidado cadastrado → `groupInvitationEmail` com link `${WEB_URL}/grupos`.
- Buscar o nome do grupo/convidador no mesmo fluxo (já temos `inviter` no `groupInvitationSelect`; adicionar `group: { select: { name } }` só para o e-mail, sem mudar o DTO de resposta).

### 6. Env (`src/config/env.validation.ts`, `.env.example`, `vitest.config.e2e.ts`)
- `SMTP_PORT`, `ACTIVATION_TOKEN_TTL_HOURS` em `positiveIntegers`; `SMTP_SECURE` em `booleans`; par `SMTP_USER`/`SMTP_PASS`; `SMTP_HOST` obrigatório quando `NODE_ENV=production`.
- `.env.example`: bloco SMTP com sugestão do Mailpit para dev (`docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`, `SMTP_HOST=localhost SMTP_PORT=1025`).

### 7. Testes da API
- **E2E infra** (`test/utils.ts`, novo `test/mail.ts`): `createTestApp` sobrescreve `MAIL_TRANSPORT` com `MemoryMailTransport` (`outbox`, `lastTo(email)`, `tokenFrom(mail)`). `signUp` passa a: registrar → ler o token do outbox → `POST /auth/activation` → devolver o agent com cookies. Os demais specs continuam funcionando sem mudança.
- **Novo `test/activation.e2e-spec.ts`**: cadastro não abre sessão e envia e-mail; login antes de ativar → 403; ativar → cookies + `/auth/me`; token reutilizado/expirado/inválido → 404; reenvio sempre 204 (e-mail desconhecido não envia; novo token invalida o anterior); recadastro sobre conta não ativada substitui a senha; 409 sobre conta ativada; `GET /auth/activation` por tipo; pré-cadastro via convite recebe e-mail com link → `activation/signup` abre sessão e mantém o grupo; `activation/signup` com token de conta comum → 400; `activation` com token de pré-cadastro → 400; DTO rejeita campos desconhecidos/inválidos; falha do transporte não derruba o cadastro.
- Ajustar `auth.e2e-spec.ts` (register não seta mais cookies), `group-invitations.e2e-spec.ts` (e-mail para pré-cadastro e aviso para cadastrado; nenhum e-mail em 400/409) e `oauth.e2e-spec.ts` (OAuth ativa a conta e zera senha de conta não ativada).
- **Unit**: `templates.spec.ts` (escape/links), `mail.service.spec.ts` (escolha de transporte, falha engolida), `activation-token.service.spec.ts`, `auth.service.spec.ts`/`auth.controller.spec.ts` (register/login 403/activate/signup), `invitation.service.spec.ts` (envios), `env.validation.spec.ts` (novas regras), `oauth.service` onde houver spec.

## Web (`apps/web`)

- **API/tipos** (`src/features/auth/api.ts`, `types.ts`): `register` → `{ email }`; `resendActivation(email)`, `fetchActivation(token)`, `activate(token)`, `activateSignup(input)`; `activationQueries.byToken(token)` em `queries.ts`.
- **Cadastro**: `SignupForm` em sucesso navega para **`/verificar-email?email=`** (nova rota, `AuthLayout`): "Enviamos um link de ativação para X", botão **Reenviar e-mail** (toast; desabilita por alguns segundos), link para o login.
- **Login**: `getCredentialsErrorMessage` trata 403 `Account not activated` → "Sua conta ainda não foi ativada." e `LoginForm` mostra o botão **Reenviar e-mail de ativação** usando o e-mail digitado.
- **Nova rota `/ativar-conta?token=`** (fora de `_app`): loader `ensureQueryData(activationQueries.byToken)`;
  - `ACTIVATE` → card com botão **Ativar minha conta** (botão, não automático, para scanners de e-mail não consumirem o link) → `setQueryData(authQueries.me())` e navega para `/`;
  - `COMPLETE_SIGNUP` → organism `ActivateAccountCard`/`CompleteSignupForm`: nome (pré-preenchido com o apelido), e-mail só leitura, senha, nascimento e `AddressFields` + `useCepAddress`, validação com `validatePersonalData` + `validateNewPassword`; sucesso → `/grupos`;
  - erro 404 → "Link inválido ou expirado" com campo de e-mail para reenviar.
- **Grupos**: o toast do `InviteMemberDialog` informa "Enviamos um e-mail para X" (pré-cadastro: ativação; cadastrado: aviso do convite).
- **Testes** (Vitest + `renderRoute`, mockando `@/features/auth/api`): `signup.spec.tsx` (vai para `/verificar-email`), novo `verificar-email.spec.tsx` (reenvio), `login.spec.tsx` (403 + reenvio), novo `ativar-conta.spec.tsx` (os dois tipos, erros de validação, 404, sucesso), `errors.spec.ts`; ajuste no spec de convite de grupos.

## CI / docs
- CI (`.github/workflows/ci.yml`): nenhum serviço novo — o e2e usa o transporte em memória e o dev cai no `LogMailTransport`; só confirmar que `prisma migrate deploy` aplica a nova migração.
- `README.md` (PT-BR): linha "Ativação de conta por e-mail" na tabela de status, `nodemailer` na stack, variáveis SMTP/`MAIL_FROM`/`ACTIVATION_TOKEN_TTL_HOURS`, setup com Mailpit, fluxo de testes.
- `CLAUDE.md`: notas de arquitetura de `src/mail/`, `src/activation/`, o novo fluxo de registro/login e o helper `signUp` que ativa via outbox.

## Verificação
1. `cd apps/api && pnpm prisma generate --config prisma7.config.ts && pnpm lint && pnpm build && pnpm test`.
2. `DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm test:e2e`.
3. `cd apps/web && pnpm generate:routes && pnpm lint && pnpm test && pnpm build`.
4. Manual: Mailpit rodando, `SMTP_HOST=localhost SMTP_PORT=1025`; cadastrar → login bloqueado → abrir e-mail em http://localhost:8025 → ativar → dashboard. Convidar e-mail novo para um grupo → e-mail de pré-cadastro → completar cadastro → grupo aparece. Convidar usuário cadastrado → e-mail de aviso.

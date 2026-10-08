# Editar perfil (`/settings/profile`)

## Context
A rota `/settings/profile` (menu da conta → "Editar perfil") é hoje um placeholder "Em breve" e a API não tem endpoint de perfil. O objetivo é permitir que o usuário veja e altere os dados do cadastro: **nome, data de nascimento e endereço (CEP → cidade/UF via ViaCEP)**. O **e-mail fica só leitura** (decisão do usuário). Endpoints: **`GET /users/me` e `PATCH /users/me`** num novo `UserController` (`/auth/me` continua devolvendo só `id/email/name`). "Alterar senha" fica fora deste escopo.

Plano salvo também em `plans/editar-perfil.md`.

## API (`apps/api`)

**DTOs** (`src/user/dto/`)
- `profile.dto.ts` — `ProfileDto { id, email, name, birthDate: 'YYYY-MM-DD', cep, city, state }` com `@ApiProperty`.
- `update-profile.dto.ts` — `UpdateProfileDto = PartialType(PickType(RegisterDto, ['name','birthDate','cep','city','state']))` (de `@nestjs/swagger`, reaproveitando os validadores/transforms de `src/auth/dto/register.dto.ts`: trim, `@IsBirthDate`, CEP 8 dígitos, `@IsIn(BRAZILIAN_STATES)`). Endereço é um bloco: se qualquer um de `cep/city/state` vier, os três são obrigatórios (`@ValidateIf` nos três via um helper `hasAddress(o)`), para não deixar CEP e cidade inconsistentes. Campos desconhecidos (ex.: `email`, `password`, `id`) já caem no 400 do `forbidNonWhitelisted`. Body vazio `{}` é aceito e só devolve o perfil.

**`UserService`** (`src/user/user.service.ts`)
- `profileSelect` (`authUserSelect` + `birthDate/cep/city/state`) e `toProfile(row)` (formata `birthDate` como `YYYY-MM-DD` em UTC).
- `findProfile(id): Promise<ProfileDto | null>` e `updateProfile(id, data): Promise<ProfileDto | null>` — `update` com `where: { id, pending: false }` (via `updateMany` + `findUnique`, como `claimPending`), convertendo `birthDate` para `Date` meia-noite UTC igual a `AuthService.register`. Sempre escopado pelo id do token.

**`UserController`** (`src/user/user.controller.ts`, registrado em `UserModule`)
- `@ApiTags('users') @ApiCookieAuth() @Controller('users')`
- `GET me` → `findProfile(user.id)` via `@CurrentUser()`; `NotFoundException` se não existir.
- `PATCH me` (`UpdateProfileDto`) → `updateProfile`; 404 idem.

**Testes**
- Unit: `user.service.spec.ts` (novos métodos com `PrismaService` mockado, formatação da data, escopo por `pending: false`) e `user.controller.spec.ts`.
- E2E: `test/users.e2e-spec.ts` — 401 sem sessão; GET devolve os dados do cadastro (`userBody`); PATCH parcial (só nome) mantém o resto; PATCH endereço completo; 400 para endereço incompleto, CEP inválido, UF inválida, menor de 18, nome curto, campo extra `email`/`password`; isolamento: A altera e B continua com os próprios dados (cada um só alcança `/users/me` do próprio token); `/auth/me` reflete o novo nome; login continua funcionando após o PATCH.

## Web (`apps/web`)

**Feature** (`src/features/profile/`)
- `types.ts` (`Profile`, `UpdateProfileInput`), `api.ts` (`fetchProfile`, `updateProfile`), `queries.ts` (`profileQueries.me()` → `['profile']`), `hooks.ts` `useUpdateProfile()`: no sucesso faz `setQueryData` em `profileQueries.me()` e em `authQueries.me()` (`{ id, email, name }`, atualiza o `UserMenu`) e invalida `groupQueries.all()`, `['invitations']` e `budgetQueries.all()` (nomes aparecem em membros/acertos/extrato de grupos).
- `validation.ts` — `validateProfile(values, today)`; extrair de `features/auth/register-validation.ts` os validadores de nome, data de nascimento e endereço para funções reaproveitadas pelos dois (`validateRegister` passa a chamá-las; specs existentes continuam passando). `errors.ts` com `getProfileErrorMessage` (400 → "Confira os dados informados.", rede/5xx → `serverUnavailableMessage`).

**Endereço reaproveitável**
- Extrair do `SignupForm` a lógica CEP → cidade/UF para `useCepAddress(initial?)` em `src/features/address/hooks.ts` (estado do CEP mascarado, query `addressQueries.byCep`, `cepNotFound`, `lookupFailed`, cidade/UF manuais) e a UI para a molécula `AddressFields` (CEP + Cidade/UF read-only, editáveis só quando o ViaCEP falha). `SignupForm` passa a usar os dois sem mudar comportamento. No perfil, o valor inicial vem do servidor: enquanto o CEP for o salvo, cidade/UF usam os dados salvos sem consultar o ViaCEP; ao mudar o CEP, entra a consulta.

**Tela** (`src/routes/_app/settings/profile.tsx`)
- `loader`: `ensureQueryData(profileQueries.me())`.
- Organismo `ProfileForm` (`src/components/organisms/ProfileForm.tsx`): card com e-mail só leitura (com descrição "O e-mail não pode ser alterado"), Nome, Data de nascimento (`max={latestBirthDate}`), `AddressFields`, botão **Salvar alterações** (desabilitado sem mudanças/pendente, `Spinner`), `FormAlert` para erro, mensagem de sucesso "Perfil atualizado." (`role="status"`). Envia só os campos alterados (endereço como bloco).

**Testes** (`profile.spec.tsx`, reescrito; mock de `@/features/profile/api` e `@/features/address/api`)
- carrega com os dados atuais e e-mail desabilitado; salva nome → `updateProfile({ name })`, mostra sucesso e o nome muda no menu lateral; troca de CEP preenche cidade/UF e envia o bloco de endereço; CEP não encontrado bloqueia; ViaCEP fora libera cidade/UF manuais; erros de validação (nome vazio, menor de 18) sem chamar a API; 400 da API mostra o alerta; botão desabilitado sem alterações; redirect de deslogado para `/login` (teste atual mantido).
- Unit: `features/profile/validation.spec.ts`, `errors.spec.ts`; specs de `signup` continuam verdes após a extração.

## Docs / CI
- `README.md`: linha "Editar perfil" → ✅/✅ com descrição (nome, nascimento, endereço via CEP; e-mail fixo; `GET/PATCH /users/me`); mencionar na seção Autenticação.
- `CLAUDE.md`: breve nota do `UserController`/`/users/me` e do `features/profile` + `useCepAddress`/`AddressFields`.
- CI: sem novos passos (sem migration nem env var).

## Verificação
- `pnpm --filter api lint && pnpm --filter api test && pnpm --filter api build`
- `cd apps/api && DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm test:e2e`
- `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`
- Manual: subir API + web, editar nome/CEP em `/settings/profile`, conferir o menu lateral e `GET /users/me` no Swagger (`/docs`).

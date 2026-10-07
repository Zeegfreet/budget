# Tela de cadastro (web): nome, e-mail, senha, nascimento e endereço por CEP

## Context
A tela `/login` já existe (e-mail/senha + GitHub/Google, sessão por cookie httpOnly, API ainda pendente). Agora queremos uma tela de **cadastro de novos usuários** com o mesmo layout (`AuthLayout` + card). Os dados pedidos, para uso posterior em marketing:
- nome, e-mail, **senha + confirmação** (para o login por e-mail/senha funcionar);
- **data de nascimento** (a idade é derivada e não fica desatualizada);
- **CEP**, que preenche **cidade e UF** automaticamente via ViaCEP (API pública).

Escopo: **só web**, como foi o login. O front passa a depender de `POST /auth/register`, documentado no README; os testes mockam `features/auth/api.ts` e `features/address/api.ts`.

### Contrato esperado da API (README)
| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ name, email, password, birthDate: 'YYYY-MM-DD', cep: '01001000', city, state: 'SP' }` | 201 `AuthUser` + `Set-Cookie` da sessão (já entra logado); 400 validação; 409 e-mail já cadastrado; 429 rate limit |

## Changes

### Passo 0
- Copiar este plano para `plans/web-signup-screen.md` (preferência: planos ficam em `plans/`).

### Feature `address` (`src/features/address/`) — novo
- `types.ts`: `Address { cep; city; state }`.
- `cep.ts`: `normalizeCep` (só dígitos, máx. 8), `formatCep` (máscara `00000-000`), `isCompleteCep`, e `BRAZILIAN_STATES` (27 siglas, para validar UF no preenchimento manual).
- `api.ts`: instância axios **própria** (`axios.create({ baseURL: 'https://viacep.com.br/ws', timeout: 5000 })`, sem `withCredentials` e sem o cookie da app). `lookupCep(cep)` → `GET /{cep}/json/`. Resposta `{ erro: true }` vira `CepNotFoundError`, e falha de rede/5xx é relançada como erro de serviço. O mapeamento `localidade`/`uf` → `Address` fica numa função pura `parseViaCepResponse`.
- `queries.ts`: `addressQueries.byCep(cep)` (`queryKey ['address','cep',cep]`, `staleTime: Infinity`, `retry: false`).

### Feature `auth` — acréscimos
- `types.ts`: `RegisterInput` (contrato acima).
- `api.ts`: `register(input)` → `POST /auth/register`.
- `errors.ts`: `getRegisterErrorMessage(error)`: 409 → "Este e-mail já está cadastrado.", 400 → "Confira os dados informados.", 429 → `tooManyAttemptsMessage`, 0/404/5xx → `serverUnavailableMessage`, e o resto → "Não foi possível criar sua conta. Tente novamente."
- `register-validation.ts` (puro, recebe `today` para ser testável): `validateRegister(values, today)` retorna `FieldErrors` por campo:
  - nome obrigatório (após `trim`, 2–100 caracteres);
  - e-mail obrigatório e válido (reusar o `EMAIL_PATTERN`, movido do `LoginForm` para `features/auth/validation.ts`);
  - senha com mín. 8 caracteres; a confirmação precisa ser igual;
  - data de nascimento válida, não futura, **idade mínima 18** e máxima 120 (`MIN_AGE` é uma constante);
  - CEP com 8 dígitos; cidade obrigatória; UF em `BRAZILIAN_STATES`.
- `session.ts`: extrair `redirectIfSignedIn(queryClient, redirect)` do `beforeLoad` de `login.tsx`, para ser reusado por `/signup`.

### Componentes (Atomic Design)
- `atoms/FormAlert.tsx` (novo): o `<p role="alert">` vermelho hoje repetido em `LoginCard`/`LoginForm`. Os dois passam a usar o atom.
- `molecules/OAuthOptions.tsx` (novo): separador "ou" + lista de `OAuthButton`, extraído do `LoginCard` para os dois cards.
- `molecules/PasswordField.tsx`: sem mudança de código; o cadastro passa `autoComplete="new-password"` (o spread já sobrescreve).
- `organisms/SignupForm.tsx` (novo), mesmo padrão do `LoginForm` (`noValidate`, `method="post"`, `preventDefault`, estado controlado, `useMutation`):
  - Campos: Nome (`autoComplete="name"`), E-mail, Senha, Confirmar senha, Data de nascimento (`type="date"`, `max` = hoje − 18 anos, `autoComplete="bday"`), CEP (`inputMode="numeric"`, máscara, `autoComplete="postal-code"`), Cidade e UF lado a lado.
  - CEP: com 8 dígitos, `useQuery(addressQueries.byCep(cep))` com `enabled`. Na `description` do campo aparece "Buscando endereço…" durante a busca.
    - Sucesso: preenche cidade/UF, que ficam `readOnly`.
    - `CepNotFoundError`: erro no campo "CEP não encontrado." e cidade/UF limpas.
    - Serviço indisponível: aviso "Não foi possível consultar o CEP. Preencha cidade e UF." e os campos ficam editáveis (UF em maiúsculas, `maxLength 2`).
  - Submit: valida via `validateRegister`. Se o CEP ainda está sendo buscado, não envia. Chama `register` com e-mail e nome com `trim`, CEP normalizado e `birthDate` no formato ISO.
  - Sucesso: `setQueryData(authQueries.me().queryKey, user)` e `navigate({ href: safeRedirect(redirect), replace: true })`.
  - Erro: `FormAlert` com `getRegisterErrorMessage`, e senha + confirmação são limpas. No 409, o alerta inclui um link "Entrar" para `/login`.
  - Botão "Criar conta" com `Spinner` ("Criando conta") e `disabled` enquanto está pendente.
- `organisms/SignupCard.tsx` (novo): mesma estrutura do `LoginCard`, com título "Criar conta no Budget", descrição, `SignupForm`, `OAuthOptions` e rodapé com os termos + "Já tem conta? **Entrar**" (`Link` para `/login`, preservando `redirect`).
- `organisms/LoginCard.tsx`: usa `FormAlert`/`OAuthOptions` e ganha "Não tem conta? **Criar conta**" (`Link` para `/signup`, preservando `redirect`).
- `templates/AuthLayout.tsx`: o card do cadastro é mais alto. Manter `max-w-sm` e só garantir que a página role em telas baixas (`py-8`, sem cortar). Sem mudança se já rolar.
- Barrels de `atoms`, `molecules` e `organisms` atualizados.

### Rota
- `src/routes/signup.tsx`: `validateSearch` `{ redirect? }` (mesmo `nonEmptyString`), `beforeLoad` com `redirectIfSignedIn`, e renderiza `AuthLayout` + `SignupCard`.

### Testes
- `routes/signup.spec.tsx` (mock de `@/features/auth/api` e `@/features/address/api`):
  - layout: título, todos os campos com os `type`/`autocomplete` certos, links do OAuth, link "Entrar" para `/login`, sem `banner`;
  - validação: envio vazio mostra os erros por campo e não chama `register`; e-mail inválido; senhas diferentes; senha curta; menor de 18 anos; data futura;
  - CEP: digitar `01001000` mostra `01001-000`, chama `lookupCep('01001000')` e preenche "São Paulo"/"SP" como `readOnly`; CEP inexistente mostra o erro; serviço fora libera a edição manual e valida a UF;
  - sucesso: envia o payload exato (com `trim`, CEP só com dígitos, data ISO) e navega para `/` com o header mostrando o e-mail; `?redirect` interno é respeitado e `//evil.com` cai em `/`;
  - falhas: 409 mostra a mensagem + link para o login e limpa as senhas; 429; rede fora (status 0);
  - botão desabilitado enquanto está pendente; usuário já logado é redirecionado para `/`.
- `routes/login.spec.tsx`: atualizar a contagem de links (agora 3) e testar o link "Criar conta" → `/signup`.
- Unit:
  - `features/address/cep.spec.ts` (normalize/format/isComplete);
  - `features/address/api.spec.ts` (`parseViaCepResponse`, `{ erro: true }` → `CepNotFoundError`);
  - `features/auth/register-validation.spec.ts` (cada regra, incluindo a fronteira dos 18 anos com `today` fixo);
  - `errors.spec.ts` (`getRegisterErrorMessage`);
  - `atoms/FormAlert` e `molecules/OAuthOptions` com specs curtos.

### CI / README
- CI: sem mudança (o job web já roda routes → lint → test → build; a ViaCEP é mockada nos testes).
- README (pt-BR):
  - "Status dos recursos" → Autenticação (Web): incluir "cadastro com CEP (ViaCEP)";
  - em [Autenticação], adicionar a linha `POST /auth/register` e os requisitos para a API: validar de novo todos os campos, idade ≥ 18, hash da senha, 409 em e-mail duplicado, rate limit, sessão aberta no 201;
  - em Stack/Web, citar a ViaCEP como dependência externa (chamada direto do navegador). Se o Nginx/checklist de produção tiver CSP, incluir `connect-src https://viacep.com.br`.

## Verification
- `cd apps/web && pnpm generate:routes && pnpm lint && pnpm test && pnpm build`
- `pnpm start:dev`, em `/signup`:
  - o layout é igual ao do login;
  - o CEP `01001-000` preenche São Paulo/SP (ViaCEP real);
  - o CEP `99999999` mostra "CEP não encontrado.";
  - a validação aparece por campo;
  - os links Entrar/Criar conta alternam entre as telas;
  - sem a API, o envio mostra "Não foi possível conectar ao servidor…".

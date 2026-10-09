# Budget

SaaS de **gestão de finanças pessoais** com suporte a **finanças compartilhadas em grupo** (ex.: uma república que divide aluguel e contas).

> Este README acompanha a evolução do projeto: cada recurso entregue atualiza a seção [Status dos recursos](#status-dos-recursos) e, quando necessário, as seções de configuração e deploy.

## Sumário

- [Principais recursos](#principais-recursos)
- [Status dos recursos](#status-dos-recursos)
- [Stack](#stack)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Rodando localmente](#rodando-localmente)
- [Autenticação](#autenticação)
- [Dashboard](#dashboard)
- [Extrato](#extrato)
- [Grupos](#grupos)
- [Grupos no orçamento pessoal](#grupos-no-orçamento-pessoal)
- [Meios de pagamento](#meios-de-pagamento)
- [Testes](#testes)
- [CI/CD](#cicd)
- [Deploy](#deploy)

## Principais recursos

- **Isolamento total por usuário (multi-tenant)**: cada usuário vê e altera apenas as próprias finanças. O dono dos dados vem sempre do contexto de autenticação, nunca do corpo da requisição. Acesso a dados de outro usuário retorna `404`, para não revelar que o recurso existe.
- **Ativação de conta por e-mail**: o cadastro com e-mail e senha só entra depois de clicar no link enviado por e-mail (SMTP). Quem é adicionado a um grupo sem ter conta recebe um link para ativar a conta criando a senha.
- **Recuperação de senha**: em "Esqueci minha senha" o usuário recebe por e-mail um link de uso único (60 min) para criar uma nova senha; os outros aparelhos são desconectados.
- **Login com e-mail/senha, GitHub ou Google**: no primeiro acesso por GitHub/Google a conta é criada (ou vinculada pelo e-mail verificado) e o usuário completa o cadastro com nascimento e endereço.
- **Receitas e despesas pessoais**: valores guardados em centavos (inteiros), sem ponto flutuante, para que totais e divisões fiquem exatos.
- **Grupos de finanças**: um usuário cria um grupo com receitas e despesas próprias (ex.: aluguel). Só os membros enxergam os dados do grupo.
- **Convites**: um membro convida outro usuário, que só ganha acesso depois de aceitar. Quem ainda não tem conta é **pré-cadastrado** com um apelido e já entra no grupo; ao se cadastrar com o mesmo e-mail, assume o lugar. Quem sai ou é removido do grupo perde o acesso.
- **Métodos de divisão**: cada grupo define como dividir as receitas e despesas entre os membros (partes iguais, valores fixos, percentuais/pesos). A soma das partes sempre fecha com o total.

## Status dos recursos

| Recurso | API | Web | Observação |
| --- | :---: | :---: | --- |
| Fundação da API (NestJS, Prisma, Swagger, validação) | ✅ | — | |
| Fundação do frontend (Tailwind, shadcn/ui, Router, Query, Atomic Design) | — | ✅ | |
| Pipeline de CI (lint, build, testes unitários e e2e) | ✅ | ✅ | |
| Banco PostgreSQL | ✅ | — | Prisma 7 com `@prisma/adapter-pg`; Postgres local via `docker compose` (bancos `budget` e `budget_test`) e serviço Postgres no CI. Veja [Configurar e subir a API](#2-configurar-e-subir-a-api) |
| Autenticação por e-mail e senha | ✅ | ✅ | Cadastro com CEP (ViaCEP), login, logout, sessão em cookies httpOnly (JWT de acesso + refresh token com rotação), guard global com Passport. Veja [Autenticação](#autenticação) |
| Ativação de conta por e-mail (SMTP) | ✅ | ✅ | O cadastro não abre sessão: envia um link de ativação (`/ativar-conta`, 72 h, uso único) e o login fica bloqueado (`403`) até a ativação, com **Reenviar e-mail**. E-mail sem conta adicionado a um grupo recebe o link para concluir o cadastro; quem já tem conta recebe o aviso do convite. Veja [Ativação de conta e e-mails](#ativação-de-conta-e-e-mails) |
| Layout autenticado (menu lateral recolhível, conteúdo fluido) | — | ✅ | O conteúdo ocupa toda a largura disponível. Navegação em `src/lib/navigation.ts`; o menu recolhe para ícones (estado lembrado em cookie, atalho Ctrl/⌘+B) e vira gaveta no celular. No rodapé, avatar com o nome do usuário abre o menu da conta: Editar perfil, Alterar senha e Sair |
| Editar perfil | ✅ | ✅ | Tela `/settings/profile` (menu da conta, card centralizado): nome, data de nascimento e endereço (CEP → cidade/UF pela ViaCEP). O e-mail aparece só para leitura. API `GET/PATCH /users/me`. Veja [Perfil](#perfil) |
| Alterar senha | ✅ | ✅ | Tela `/settings/password` (menu da conta): senha atual, nova senha e repetição. A API confere a senha atual, grava a nova e encerra as outras sessões. Veja [Alterar senha](#alterar-senha) |
| Recuperação de senha (Esqueci minha senha) | ✅ | ✅ | Link **Esqueci minha senha** no login → `/esqueci-senha` (e-mail) → link por e-mail para `/redefinir-senha` (60 min, uso único) com nova senha e repetição. Sempre a mesma resposta, exista o e-mail ou não; ao redefinir, as sessões são encerradas, a conta entra logada e recebe um aviso por e-mail. Veja [Recuperação de senha](#recuperação-de-senha) |
| Login com GitHub e Google (OAuth) | ✅ | ✅ | Authorization Code + PKCE, vínculo automático por e-mail verificado e tela **Completar cadastro** no primeiro acesso |
| Dashboard (balanço + planejamento mensal) | ✅ | ✅ | Página inicial (`/`), com **filtro de período** no topo (calendário de meses com atalhos e **Redefinir**; padrão: mês atual + 11, até 24 meses) e abas **Planejamento** e **Análise**, com coluna de total do período. A tabela de planejamento é um **rascunho**: valores, tipos, categorias, lançamentos e metas só são gravados ao clicar em **Salvar**, tudo de uma vez (`PUT /budget/plan`, tudo ou nada), para testar cenários. Veja [Dashboard](#dashboard) |
| Categorias de receitas e despesas | ✅ | ✅ | Tipos e categorias padrão criados no primeiro acesso; criar, editar, inativar/reativar e excluir pela própria tabela do Dashboard ou pelo menu **Categorias** do Extrato |
| Análise do Dashboard (gráfico e despesas por categoria) | — | ✅ | Aba **Análise** (`/?tab=analise`): gráfico de linhas mês a mês com receitas, despesas, saldo do mês e saldo acumulado (com tabela dos números), e tabela de despesas por categoria com barras do primeiro mês e do período e o % de cada uma no período. Usa os dados já existentes de `GET /budget/entries` e `/budget/summary`. Veja [Dashboard](#dashboard) |
| Metas por tipo de despesa | ✅ | ✅ | Meta em % das receitas por tipo de despesa, com termômetro do mês atual e do período acima dos cards (valor gasto ao lado do **valor da meta**), mais o cartão **Sobra / Aporte** (o que sobra das receitas, com meta mínima de 100% − a soma das metas, também em reais) |
| Receitas e despesas pessoais (lançamentos) | ✅ | ✅ | Lançamentos por categoria e mês, com descrição, dia de vencimento, **link de pagamento** (boleto ou portal, aberto direto da lista), valor previsto e realizado. No Dashboard, cada categoria se expande nos seus lançamentos (uma linha por série recorrente ou lançamento avulso), editados direto na tabela e refletidos no Extrato; meses já realizados mostram o valor realizado |
| Recorrência sem término e reajuste automático | ✅ | ✅ | Lançamentos pessoais e de grupo podem se repetir **todo mês, sem data de término**: os meses futuros são criados sozinhos, sob demanda (sempre até 24 meses à frente, ou até o mês consultado, no máximo 10 anos). Reajuste **manual** editando o valor com "também os próximos" e **reajuste automático** em % a cada N meses (ex.: +5% todo março), composto mês a mês. Para encerrar, defina o último mês pelo selo **3/∞** ou exclua "também os próximos". Veja [Extrato](#extrato) |
| Extrato mensal (realização e recorrência) | ✅ | ✅ | Tela `/extrato`: lista do mês com navegação entre meses, marcar como realizado (com outro valor, se for o caso), lançar receitas e despesas com repetição por N meses, alterar/excluir "só este" ou "também os próximos" e estender ou encurtar a recorrência pelo selo **3/12**; ajustar o saldo inicial; chave **Somente pendentes** e **ordenação multinível** (vencimento, forma de pagamento, categoria, valor, situação), lembradas no navegador. Veja [Extrato](#extrato) |
| Grupos de finanças | ✅ | ✅ | Telas `/grupos` e `/grupos/:id` (abas Lançamentos, Balanço, Membros, Rateio e Categorias): criar, renomear, excluir e sair; **categorias do grupo** (um nível, por receita/despesa, geridas por qualquer membro); lançamentos do grupo com categoria, dia de vencimento, link de pagamento (boleto/portal, também visível no extrato e na fatura de cada membro), recorrência (estender ou encurtar pelo selo **3/12**), "pago por" e balanço mensal por membro com o acerto (quem paga quem) e os **recebimentos**: quem pagou marca a parte de cada um como recebida (botão ✓ verde) e ela sai do saldo. Veja [Grupos](#grupos) |
| Convites para grupos | ✅ | ✅ | Convite por e-mail (com aviso enviado por e-mail); quem tem conta aceita ou recusa em `/grupos`. E-mail sem conta vira **pré-cadastro** com apelido, que já entra no grupo e recebe por e-mail o link para ativar a conta (ou é assumido no cadastro com o mesmo e-mail). O dono remove membros; quem sai ou é removido perde o acesso (`404`) |
| Métodos de divisão (rateio) | ✅ | ✅ | Regras por grupo: igualitário (todos ou alguns membros), percentual (soma 100%), pesos e valores fixos. As cotas são calculadas em centavos e sempre somam o total. Os lançamentos **ainda não pagos** são recalculados quando alguém entra ou sai (do mês atual em diante) e quando a regra é editada |
| Grupos no extrato e no dashboard pessoais | ✅ | ✅ | Card **Grupos** no Dashboard e no Extrato com a sua parte, o que você pagou e o acerto de cada grupo. Vinculando o grupo ao orçamento, a sua parte já rateada entra no grid, nos cards e no extrato: numa categoria sua para tudo ou **categoria por categoria** (cada categoria do grupo numa categoria sua; as demais na padrão). Veja [Grupos no orçamento pessoal](#grupos-no-orçamento-pessoal) |
| Meios de pagamento (cartões e contas) | ✅ | ✅ | Tela `/meios-de-pagamento`: cartões e contas com dia de vencimento, que passa a valer para as despesas lançadas neles. Cada meio tem a fatura do mês (lançamentos pessoais + sua parte nos grupos), **Pagar fatura** de uma vez e histórico de 12 meses. Veja [Meios de pagamento](#meios-de-pagamento) |
| Docker / deploy em containers | ✅ | ✅ | Imagem única [`zeegfreet/budget`](https://hub.docker.com/r/zeegfreet/budget) (amd64 + arm64): a API sob `/api` serve também o build do web e aplica as migrations ao subir. Build com `scripts/docker-build.sh`, publicação no Docker Hub pelo CI a cada merge na `main` (`latest`) e em tags `v*` (versões fixas) e exemplo com Traefik + Let's Encrypt em `docker-compose.prod.yml`. Veja [Deploy](#deploy) |

Legenda: ✅ pronto · 🚧 em andamento · ⏳ planejado

## Stack

### API ([apps/api](apps/api))

- **[NestJS 12](https://nestjs.com/)** (TypeScript, ESM)
- **[Prisma 7](https://www.prisma.io/)** com **PostgreSQL** via driver adapter `@prisma/adapter-pg`
- **class-validator / class-transformer**: `ValidationPipe` global com `whitelist` e `forbidNonWhitelisted`
- **Swagger** (`@nestjs/swagger`), servido em `/docs`
- **Passport** (`@nestjs/passport`): estratégia `local` no login e `jwt` (token lido do cookie) no guard global
- **`@nestjs/jwt`** para o token de acesso, **argon2** (argon2id) para hash de senha, **cookie-parser**
- **`@nestjs/throttler`** para rate limit (`429`)
- **[Nodemailer](https://nodemailer.com/)** para enviar e-mails por SMTP (ativação de conta e convites)
- **Vitest** + **Supertest** para testes unitários e e2e
- **oxlint** (lint type-aware) e **Prettier**

### Web ([apps/web](apps/web))

- **[React 19](https://react.dev/)** + **[Vite 8](https://vite.dev/)**
- **Tailwind CSS v4** + **[shadcn/ui](https://ui.shadcn.com/)** (Radix)
- **[Recharts](https://recharts.org/)** pelo componente Chart do shadcn/ui (gráficos do Dashboard)
- **[TanStack Router](https://tanstack.com/router)** (rotas baseadas em arquivos) + **[TanStack Query](https://tanstack.com/query)**
- **Axios** para chamadas HTTP
- **[ViaCEP](https://viacep.com.br/)** (API pública, chamada direto do navegador) para preencher cidade e UF no cadastro
- **Vitest** + **Testing Library** (jsdom)
- **ESLint**

### Infra

- Monorepo **pnpm workspaces** (`pnpm@12`)
- **Node.js 24**
- **GitHub Actions** para CI e publicação da imagem
- **Docker** (imagem única multi-arch no Docker Hub) e **Traefik** como proxy de borda em produção

## Estrutura do repositório

```
.
├── apps/
│   ├── api/                 # Backend NestJS
│   │   ├── prisma/          # schema.prisma e migrations
│   │   ├── src/             # módulos (auth, activation, mail, budget, groups, payment-methods, user, prisma), app.setup.ts
│   │   └── test/            # testes e2e (*.e2e-spec.ts)
│   └── web/                 # Frontend React
│       └── src/
│           ├── components/  # ui → atoms → molecules → organisms → templates
│           ├── features/    # <feature>/{types,api,queries}.ts
│           ├── hooks/       # hooks compartilhados (ex.: useIsMobile)
│           ├── lib/         # cliente Axios, QueryClient, dinheiro, itens do menu lateral
│           └── routes/      # páginas (TanStack Router file-based)
├── docker/                  # init.sql do Postgres de dev e entrypoint.sh da imagem
├── scripts/docker-build.sh  # build (e push) da imagem Docker
├── Dockerfile               # imagem única (API + web)
├── docker-compose.yml       # PostgreSQL de desenvolvimento
├── docker-compose.prod.yml  # exemplo de produção (Traefik + app + PostgreSQL)
├── plans/                   # planos de implementação
└── .github/workflows/       # ci.yml (CI e publicação da imagem)
```

## Rodando localmente

### Pré-requisitos

- Node.js 24+
- pnpm 12 (`corepack enable` ou `npm i -g pnpm`)
- Docker (para o PostgreSQL local) ou um PostgreSQL 17 próprio

### 1. Instalar dependências

```bash
pnpm install
```

### 2. Configurar e subir a API

```bash
docker compose up -d    # na raiz: PostgreSQL em localhost:5432 (bancos budget e budget_test)

cd apps/api
cp .env.example .env    # depois troque JWT_ACCESS_SECRET por um valor aleatório

pnpm prisma generate --config prisma7.config.ts                 # gera o client em src/prisma/generated
pnpm prisma migrate dev --config prisma7.config.ts              # cria/atualiza o banco budget
pnpm start:dev                                                  # http://localhost:3000
```

A documentação da API (Swagger) fica em http://localhost:3000/docs.

> O arquivo de configuração do Prisma se chama `prisma7.config.ts`, então passe `--config prisma7.config.ts` em todo comando do Prisma.

> **Vindo do SQLite:** o banco passou a ser PostgreSQL e o histórico de migrations recomeçou numa migration inicial única. Os dados de um `dev.db` antigo não são migrados: troque a `DATABASE_URL` do seu `.env` pela do `.env.example`, suba o compose e rode `prisma migrate dev`. Os arquivos `dev.db`/`test.db` podem ser apagados. A API se recusa a subir com uma `DATABASE_URL` que não seja `postgresql://`.

### 3. Subir o frontend

```bash
cd apps/web
pnpm start:dev        # http://localhost:5173
```

Em desenvolvimento, o Vite encaminha `/api/*` para `http://localhost:3000` (removendo o prefixo `/api`) e reescreve o `Path` do cookie de refresh de `/auth` para `/api/auth`. Para apontar para outra API, defina `VITE_API_URL` (veja [apps/web/.env.example](apps/web/.env.example)).

As páginas internas exigem sessão: quem não está autenticado é redirecionado para `http://localhost:5173/login`. Crie uma conta em `/signup` (veja [Autenticação](#autenticação)) e ative-a pelo link do e-mail.

### 4. E-mails em desenvolvimento

Sem `SMTP_HOST`, a API **não envia** e-mails: ela escreve cada mensagem no log (destinatário, assunto e texto, com o link de ativação), então basta copiar o link do terminal da API. Para ver os e-mails de verdade, suba uma caixa de teste com o [Mailpit](https://mailpit.axllent.org/):

```bash
docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit
# em apps/api/.env
SMTP_HOST=localhost
SMTP_PORT=1025
```

e abra http://localhost:8025.

### Variáveis de ambiente

| App | Variável | Padrão | Descrição |
| --- | --- | --- | --- |
| api | `DATABASE_URL` | — (obrigatória) | Conexão do PostgreSQL, ex.: `postgresql://budget:budget@localhost:5432/budget` (precisa começar com `postgresql://` ou `postgres://`) |
| api | `JWT_ACCESS_SECRET` | — (obrigatória) | Segredo que assina o token de acesso. Use um valor longo e aleatório |
| api | `JWT_ACCESS_TTL_SECONDS` | `900` | Validade do token de acesso (15 min) |
| api | `REFRESH_TOKEN_TTL_DAYS` | `7` | Validade da sessão de refresh, renovada a cada uso |
| api | `COOKIE_SECURE` | `true` se `NODE_ENV=production` | Flag `Secure` dos cookies (só HTTPS) |
| api | `TRUST_PROXY` | — | Valor do `trust proxy` do Express (ex.: `1` atrás de um proxy reverso), para o rate limit enxergar o IP real |
| api | `PORT` | `3000` | Porta HTTP da API |
| api | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | Credenciais do OAuth App do GitHub. Sempre as duas juntas; sem elas o botão do GitHub volta ao login com aviso |
| api | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Credenciais do cliente OAuth do Google. Sempre as duas juntas |
| api | `WEB_URL` | `http://localhost:5173` | Endereço do web, para onde o callback do OAuth redireciona e base dos links nos e-mails (`/ativar-conta`, `/grupos`) |
| api | `SMTP_HOST` | — (obrigatória em produção) | Servidor SMTP. Sem ele, os e-mails só vão para o log da API |
| api | `SMTP_PORT` | `587` | Porta do SMTP (`1025` no Mailpit) |
| api | `SMTP_SECURE` | `false` | `true` para TLS desde a conexão (porta 465); com `false`, usa STARTTLS quando o servidor oferece |
| api | `SMTP_USER` / `SMTP_PASS` | — | Credenciais do SMTP. Sempre as duas juntas |
| api | `MAIL_FROM` | `Budget <no-reply@budget.local>` | Remetente dos e-mails |
| api | `ACTIVATION_TOKEN_TTL_HOURS` | `72` | Validade do link de ativação |
| api | `PASSWORD_RESET_TOKEN_TTL_MINUTES` | `60` | Validade do link de redefinição de senha |
| api | `OAUTH_CALLBACK_BASE_URL` | `${WEB_URL}/api` | Endereço da API **como o navegador a vê** (mesmo site do web, para os cookies de sessão chegarem ao web). O callback é `<base>/auth/oauth/<github\|google>/callback` |
| api | `API_PREFIX` | — (`api` na imagem) | Prefixo global das rotas (ex.: `api` → `/api/auth/login`, Swagger em `/api/docs`). Também muda o path do cookie de refresh para `/<prefixo>/auth`. Sem ele (dev e testes), as rotas ficam na raiz e o proxy do Vite tira o `/api` |
| api | `WEB_DIST_DIR` | — (`/app/web` na imagem) | Diretório do build do web, servido pela API em todos os caminhos fora do prefixo (SPA com fallback para `index.html`). Exige `API_PREFIX` |
| api | `SKIP_MIGRATIONS` | `false` | Só na imagem Docker: `true` não roda `prisma migrate deploy` ao iniciar o container |
| web | `VITE_API_URL` | `/api` | URL base da API, embutida no bundle no momento do build |

A API valida as variáveis no boot e não sobe se faltar alguma obrigatória. Modelo em [apps/api/.env.example](apps/api/.env.example).

## Autenticação

Entrada por **e-mail + senha**, **cadastro** em `/signup` ou **GitHub/Google** (veja [Login com GitHub e Google](#login-com-github-e-google)).

### Rotas da API

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | `{ name, email, password, birthDate, cep, city, state }` | `201` com `{ email }` e **sem sessão**: a conta nasce não ativada e o link de ativação vai por e-mail; `400` em dados inválidos; `409` se o e-mail já estiver cadastrado **e ativado**; `429` após 5 tentativas/min. Um e-mail **pré-cadastrado** por convite de grupo, ou um cadastro que ninguém ativou, é assumido (mesmo `id`, grupos mantidos, dados e link novos) em vez de dar `409` |
| `POST` | `/auth/login` | `{ email, password }` | `200` com o usuário e os cookies; `401` `Invalid credentials` (mesma resposta para e-mail inexistente e senha errada); `403` `Account not activated` (só com a senha certa); `429` após 5 tentativas/min |
| `GET` / `POST` | `/auth/activation...` | | Ativação pelo link do e-mail. Veja [Ativação de conta e e-mails](#ativação-de-conta-e-e-mails) |
| `POST` | `/auth/refresh` | — (cookie `refresh_token`) | `200` com o usuário e cookies novos; `401` (e cookies apagados) se o refresh estiver ausente, inválido, expirado ou revogado |
| `GET` | `/auth/me` | — | `200` com o usuário da sessão, ou `401` |
| `POST` | `/auth/logout` | — | `204`, revogando a sessão e apagando os cookies (idempotente) |
| `POST` | `/auth/password` | `{ currentPassword, newPassword }` | `200` com o usuário e cookies novos. Veja [Alterar senha](#alterar-senha) |
| `POST` / `GET` | `/auth/password/forgot`, `/auth/password/reset` | | Esqueci minha senha. Veja [Recuperação de senha](#recuperação-de-senha) |

O usuário retornado é sempre `{ id, email, name, needsProfile, hasPassword }`: hash de senha e demais dados nunca saem da API. `needsProfile` indica uma conta criada pelo GitHub/Google que ainda não informou nascimento e endereço; `hasPassword` é `false` para quem só entra pelo GitHub/Google.

### Como a sessão funciona

- **Token de acesso (stateless)**: JWT HS256 com `sub` = id do usuário, válido por 15 min, no cookie `access_token` (`Path=/`). O guard valida só a assinatura e a validade, sem consultar o banco.
- **Refresh token (stateful)**: valor opaco `<id da sessão>.<segredo>` no cookie `refresh_token`, com `Path=/auth`, então só vai para `/auth/refresh` e `/auth/logout`. No banco (tabela `Session`) fica apenas o SHA-256 do segredo. É o único ponto que consulta sessão.
- **Rotação com detecção de reuso**: cada `/auth/refresh` troca o segredo. Reapresentar um segredo antigo é tratado como roubo de token e **revoga a sessão inteira**. Exceção: o segredo imediatamente anterior é tolerado por 30 s (duas abas renovando ao mesmo tempo): responde `401` sem revogar.
- Cada login abre uma sessão independente (um dispositivo sair não derruba os outros). A validade do refresh é renovada a cada uso (`REFRESH_TOKEN_TTL_DAYS`).
- Cookies sempre `HttpOnly` e `SameSite=Lax`; `Secure` em produção.
- Senhas com **argon2id**. No login com e-mail inexistente a API ainda verifica um hash fictício, para o tempo de resposta não revelar quais e-mails existem.
- **Guard global**: toda rota exige token de acesso, exceto as marcadas com `@Public()`. Em rotas novas, o dono dos dados vem de `@CurrentUser()`, nunca do corpo ou dos parâmetros.
- Cadastro: a API valida de novo todos os campos (nome 2–100, e-mail, senha 8–128, data `YYYY-MM-DD` real com idade entre 18 e 120 anos, CEP com 8 dígitos, UF entre as 27 siglas) e rejeita campos desconhecidos. E-mail é salvo em minúsculas.

### Como o frontend usa a sessão

- O token nunca passa pelo JavaScript: os cookies são `httpOnly` e o Axios envia com `withCredentials`. Nada fica em `localStorage`.
- **Refresh transparente**: em um `401`, o cliente Axios chama `POST /auth/refresh` uma única vez (requisições simultâneas compartilham a mesma chamada) e repete a requisição original. Se o refresh falhar, o `401` segue adiante e o usuário vai para o login. Login, cadastro, refresh e logout nunca disparam refresh.
- As rotas internas (layout `_app`) checam `GET /auth/me` antes de renderizar e redirecionam para `/login?redirect=<página>` em caso de falha.
- O `?redirect=` só aceita caminhos internos, para evitar open redirect (`//site.com`, `https://...` caem em `/`).
- Credencial inválida sempre mostra "E-mail ou senha inválidos.", sem revelar se o e-mail existe. A senha é apagada do formulário após falha e nunca vai para a URL.
- Ao sair, todo o cache de dados do usuário é descartado, mesmo se a chamada de logout falhar.

Cadastro (`/signup`):

- Campos: nome, e-mail, senha + confirmação (mín. 8 caracteres), data de nascimento (idade mínima de 18 anos; a idade é derivada da data, para uso em marketing) e CEP.
- Ao completar o CEP, cidade e UF são preenchidas pela [ViaCEP](https://viacep.com.br/) e ficam somente leitura. CEP inexistente bloqueia o envio. Se a ViaCEP estiver fora do ar, cidade e UF podem ser digitadas (UF validada contra as 27 siglas).
- A ViaCEP usa um cliente HTTP próprio, sem o cookie de sessão da aplicação.
- Formato enviado: `birthDate` em `YYYY-MM-DD`, `cep` só com os 8 dígitos e `state` com a sigla da UF (ex.: `SP`).
- Depois do envio, a tela vai para `/verificar-email`: a conta só entra depois de ativada pelo link do e-mail.

### Ativação de conta e e-mails

O módulo `mail` da API envia os e-mails por SMTP (Nodemailer); o módulo `activation` cuida dos links. Uma falha no envio **não derruba** a requisição (fica no log da API) e a pessoa pode pedir o e-mail de novo.

| Quando | E-mail | Link |
| --- | --- | --- |
| Cadastro com e-mail e senha | **Ative sua conta no Budget** | `WEB_URL/ativar-conta?token=…` |
| E-mail sem conta adicionado a um grupo (pré-cadastro) | **<quem convidou> adicionou você ao grupo "<grupo>"** | `WEB_URL/ativar-conta?token=…` (concluir o cadastro) |
| Usuário cadastrado convidado a um grupo | **<quem convidou> convidou você para o grupo "<grupo>"** | `WEB_URL/grupos` (aceitar ou recusar) |
| Pedido de reenvio | o de ativação ou o de pré-cadastro (sem o grupo) | `WEB_URL/ativar-conta?token=…` |

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET` | `/auth/activation?token=` | — | `200` com `{ email, name, kind }`: `ACTIVATE` (cadastro) ou `COMPLETE_SIGNUP` (pré-cadastro; `name` é o apelido). Não consome o link. `404` `Invalid or expired activation link` |
| `POST` | `/auth/activation` | `{ token }` | Ativa um cadastro: `200` com o usuário e os cookies de sessão. `400` `Sign-up data required` para o link de um pré-cadastro; `404` para link inválido, expirado ou já usado |
| `POST` | `/auth/activation/signup` | `{ token, name, password, birthDate, cep, city, state }` | Conclui o pré-cadastro (mesmas regras do cadastro; o e-mail vem do link e não é aceito no corpo): a conta já nasce ativa, mantém os grupos e abre a sessão (`200`). `400` em dados inválidos ou `Account already registered` para o link de um cadastro; `404` para link inválido |
| `POST` | `/auth/activation/resend` | `{ email }` | Sempre `204`, para não revelar quais e-mails existem. Só envia se houver conta aguardando ativação. `429` após 5 pedidos/min |

- O link é um segredo aleatório de 32 bytes; o banco (tabela `ActivationToken`) guarda só o SHA-256. Vale por `ACTIVATION_TOKEN_TTL_HOURS` (72 h), serve **uma vez** e cada link novo invalida os anteriores do usuário.
- **Contas já existentes** antes desta mudança foram marcadas como ativadas pela migration. Contas criadas pelo GitHub/Google já nascem ativas (o provedor verificou o e-mail). Se o login pelo provedor encontrar um cadastro **não ativado** com o mesmo e-mail, ele é ativado e a senha digitada nesse cadastro é descartada (ninguém provou ser o dono do e-mail).
- **Web**: o cadastro leva a `/verificar-email` ("Confirme seu e-mail", com **Reenviar e-mail de ativação**). O login de uma conta não ativada mostra o aviso e o mesmo botão. `/ativar-conta` pede um clique em **Ativar minha conta** (nunca ativa ao abrir a página, para leitores de e-mail que abrem links não gastarem o link) e entra no Dashboard; para um pré-cadastro, mostra o formulário (e-mail só leitura, nome com o apelido, senha, nascimento e CEP) e entra em **Grupos**. Link inválido ou expirado oferece um novo.

### Login com GitHub e Google

| Método | Rota | Resposta |
| --- | --- | --- |
| `GET` | `/auth/oauth/github` ou `/auth/oauth/google` (`?redirect=<caminho>` opcional) | `302` para a tela de consentimento do provedor, guardando o fluxo no cookie `oauth_state` (`HttpOnly`, `SameSite=Lax`, `Path=/auth`, 10 min). Provedor sem credenciais: `302` para `/login?error=oauth_unavailable`. Provedor desconhecido: `404` |
| `GET` | `/auth/oauth/<provider>/callback` | Chamada pelo provedor. Sucesso: abre a sessão (mesmos cookies do login) e faz `302` para `WEB_URL` + o `redirect` guardado. Falha: `302` para `/login?error=<código>` (mantendo o `redirect`) |

- **Authorization Code + PKCE (S256)** e `state` aleatório, conferidos contra o cookie do navegador que começou o fluxo. O cookie é apagado no callback, então o mesmo retorno não serve duas vezes. A troca do código e a leitura da conta são feitas pela API (o segredo do cliente nunca vai ao navegador).
- **Quem entra**: a conta vinculada (`OAuthAccount`, pelo id estável do provedor, mesmo que o e-mail mude lá) → senão, o **e-mail verificado** pelo provedor: uma conta com senha recebe o vínculo (as duas formas de entrar continuam valendo) e um **pré-cadastro** de convite é assumido (mesmo `id`, grupos mantidos, o nome do provedor substitui o apelido) → senão, uma conta nova só com nome e e-mail. Sem e-mail verificado (GitHub: o primário verificado, ou outro verificado; Google: `email_verified`) não há vínculo nem conta nova.
- **Códigos de erro** (traduzidos na tela de login): `access_denied` (consentimento cancelado), `oauth_state` (fluxo expirado, adulterado ou de outro navegador), `oauth_email` (sem e-mail verificado), `oauth_failed` (falha no provedor), `oauth_unavailable` (provedor não configurado).
- **Completar cadastro**: no primeiro acesso pelo GitHub/Google faltam nascimento e endereço (`needsProfile: true`). O layout interno (`_app`) leva o usuário para `/completar-cadastro?redirect=<página>`, que mostra o e-mail, o nome vindo do provedor (editável), a data de nascimento e o CEP (ViaCEP), com as mesmas regras do cadastro, e salva com `PATCH /users/me`. Depois segue para a página pedida. A tela também tem **Sair**.
- Uma conta só com GitHub/Google **não tem senha**: o login por e-mail/senha responde `401`, `POST /auth/password` responde `404` e a tela **Alterar senha** explica isso em vez de mostrar o formulário. Para criar uma senha, use **Esqueci minha senha** (veja [Recuperação de senha](#recuperação-de-senha)).
- O `?redirect=` é saneado na API e no web (só caminhos internos; `//site.com` vira `/`).

#### Configurando os provedores

- **GitHub**: em *Settings → Developer settings → OAuth Apps → New OAuth App*, use *Homepage URL* `http://localhost:5173` e *Authorization callback URL* `http://localhost:5173/api/auth/oauth/github/callback`. Copie o *Client ID* e gere um *Client secret*.
- **Google**: no [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure a tela de consentimento (escopos `openid`, `email`, `profile`) e crie um *ID do cliente OAuth* do tipo **Aplicativo da Web** com o URI de redirecionamento `http://localhost:5173/api/auth/oauth/google/callback`.
- Preencha `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` e `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` em `apps/api/.env` e reinicie a API. Em produção, cadastre os callbacks com o domínio real (ex.: `https://budget.exemplo.com/api/auth/oauth/github/callback`).

### Perfil

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET` | `/users/me` | — | `200` com `{ id, email, name, birthDate, cep, city, state }` do usuário da sessão (`birthDate` em `YYYY-MM-DD`) |
| `PATCH` | `/users/me` | `{ name?, birthDate?, cep?, city?, state? }` | `200` com o perfil atualizado. Mesmas regras do cadastro; o endereço vai em bloco (mandou um de `cep`/`city`/`state`, os três são obrigatórios). `400` em dados inválidos, `null` ou campos fora da lista (o **e-mail e a senha não mudam por aqui**) |

Não existe rota para ler ou alterar outro usuário: o perfil é sempre o do token. No web, a tela **Editar perfil** (`/settings/profile`) mostra o e-mail desabilitado, envia só o que mudou e atualiza na hora o nome no menu lateral (e nos grupos). O CEP salvo não é consultado de novo; ao trocar o CEP, cidade e UF vêm da ViaCEP como no cadastro.

### Alterar senha

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST` | `/auth/password` | `{ currentPassword, newPassword }` | `200` com `{ id, email, name }` e cookies de sessão novos; `400` em corpo inválido (nova senha fora de 8–128 caracteres, campos fora da lista) ou `New password must differ from the current one`; `401` sem sessão; `403` `Current password is incorrect`; `429` após 5 tentativas/min |

- A conta é sempre a do token; não há como trocar a senha de outro usuário.
- A nova senha é gravada com argon2id e **todas as sessões do usuário são revogadas**; a resposta abre uma nova sessão para quem fez a troca. Nos outros aparelhos o refresh deixa de funcionar e o token de acesso só vale até expirar (no máximo 15 min).
- A senha atual errada responde `403` (e não `401`) para o cliente não confundir com sessão expirada e tentar um refresh.
- No web, a tela **Alterar senha** (`/settings/password`) pede senha atual, nova senha e repetição da nova; valida no navegador (mín. 8 caracteres, repetição igual, diferente da atual), mostra "Senha atual incorreta." no próprio campo e limpa os campos após cada resposta da API.
- Trocar a senha também invalida um link de **Esqueci minha senha** ainda não usado.

### Recuperação de senha

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST` | `/auth/password/forgot` | `{ email }` | Sempre `204`, para não revelar quais e-mails existem. E-mail desconhecido: nada é enviado; **pré-cadastro** de convite: recebe o link para concluir o cadastro (`/ativar-conta`); qualquer outra conta: link de redefinição. `400` em e-mail inválido; `429` após 5 pedidos/min |
| `GET` | `/auth/password/reset?token=` | — | `200` com `{ email, name }` (não usa o link); `404` `Invalid or expired password reset link` |
| `POST` | `/auth/password/reset` | `{ token, password }` | `200` com o usuário e cookies de sessão novos; `400` em corpo inválido (senha fora de 8–128 caracteres, campos fora da lista); `404` para link inválido, expirado, já usado ou substituído; `429` após 5 tentativas/min |

- O link (`<WEB_URL>/redefinir-senha?token=`) é um segredo aleatório de 32 bytes; o banco (tabela `PasswordResetToken`) guarda só o SHA-256. Vale por `PASSWORD_RESET_TOKEN_TTL_MINUTES` (60 min), serve **uma vez** e cada pedido novo invalida o link anterior. Pedir o link não muda nada na conta: a senha antiga continua valendo até o link ser usado.
- Ao redefinir: a nova senha é gravada com argon2id, **todas as sessões do usuário são revogadas**, quem usou o link entra logado e a conta recebe o e-mail "Sua senha do Budget foi alterada". Como o link prova o e-mail, uma conta ainda **não ativada** passa a ativada (e seus links de ativação deixam de valer), e uma conta só com GitHub/Google passa a ter senha.
- No web: o login tem o link **Esqueci minha senha** (leva o e-mail já digitado) para `/esqueci-senha`, que mostra sempre a mesma mensagem após o envio. `/redefinir-senha` confere o link ao abrir (sem usá-lo), mostra o e-mail da conta e pede a nova senha e a repetição; o link só é usado ao enviar o formulário. Link inválido ou expirado oferece **Pedir novo link**.

### Proxy reverso e cookies

A API define o cookie de refresh (e o `oauth_state` do login com GitHub/Google) com `Path=/auth`, ou `Path=/<API_PREFIX>/auth` quando roda com prefixo (caso da imagem Docker, que já responde em `/api` e não depende de reescrita no proxy). Sem prefixo, atrás de um proxy que publica a API sob `/api`, o navegador enxerga `/api/auth/refresh`, então o proxy precisa reescrever o path do cookie (o Vite já faz isso em dev; no Nginx, `proxy_cookie_path /auth /api/auth;`). Se o web for servido de outra origem (`VITE_API_URL` absoluto), será preciso habilitar CORS com `credentials: true` e origem explícita, nunca `*`.

## Dashboard

Página inicial do app (`/`), com o balanço das finanças pessoais.

**Período e abas**

- No topo, o botão do período (ex.: **out/26 – set/27**) abre um **calendário de meses** (dois anos lado a lado, com ‹ › para trocar de ano) e vale para todas as abas: um clique escolhe o primeiro mês e outro o último (em qualquer ordem, até 24 meses, o limite da API; os meses além disso ficam desabilitados). Atalhos **Próximos 12 meses**, **Últimos 12 meses** e **Ano atual**; ao lado, **Redefinir** volta ao padrão (o mês atual e os 11 seguintes). O primeiro mês do período é o **mês de referência** dos cards, das metas e da tabela de despesas. O período e a aba ficam na URL (`/?tab=analise&from=2026-10&to=2027-09`); valores inválidos voltam ao padrão.
- **Planejamento**: as metas, os cards, os grupos e a tabela de planejamento descritos abaixo.
- **Análise**: o gráfico **Evolução mensal** (uma linha por série: receitas, despesas, saldo do mês e saldo acumulado, este tracejado e partindo do saldo de abertura do primeiro mês; passe o mouse para ver os valores, ou **Ver tabela** para os números) e a tabela **Despesas por categoria** (só despesas, da maior para a menor no período): à esquerda a barra com o valor no mês de referência, à direita a barra com o total do período e o **%** que a categoria representa nele (os percentuais somam 100%). Os valores seguem os mesmos critérios dos cards (realizado quando houver, senão o previsto; rateios de grupos vinculados entram na categoria) e mostram só o que está **salvo**.
- Trocar de aba mantém o rascunho do planejamento; trocar o período com alterações não salvas pede confirmação e as descarta.

**Cards do mês atual**

| Card | Cálculo |
| --- | --- |
| Saldo de abertura | Saldo inicial + receitas − despesas de todos os meses anteriores |
| Receitas do mês | Soma das receitas do mês atual: valor realizado quando houver, senão o previsto |
| Despesas do mês | Soma das despesas do mês atual: valor realizado quando houver, senão o previsto |
| Saldo do mês | Receitas − despesas do mês atual |
| Saldo acumulado | Saldo de abertura + saldo do mês |

O **saldo inicial** (quanto o usuário tinha antes do primeiro mês lançado, podendo ser negativo) é ajustado pelo lápis no card de abertura (ou pelo botão **Saldo inicial** do [Extrato](#extrato)) e é gravado na hora. Receitas, despesas e saldos do mês são recalculados na hora, enquanto o usuário edita a tabela, mesmo antes de salvar. Os saldos usam o valor **realizado** dos lançamentos já marcados no [Extrato](#extrato) e o previsto dos demais.

**Metas por tipo de despesa (acima dos cards)**

- Cada tipo de despesa (2º nível, ex.: Despesas Básicas) pode ter uma meta em **% das receitas** (inteiro de 1 a 100), definida em **Definir metas** ou no menu **Editar** do tipo. Tipos de receita não têm meta.
- Para cada tipo com meta, um termômetro mostra quanto das receitas ele consome no **mês atual** e no **período** da tabela (12 meses), com um marcador na meta: verde abaixo de 90% da meta, amarelo de 90% até a meta e vermelho acima dela (ou com gastos sem receitas). Embaixo de cada termômetro, o valor gasto e o **valor da meta** (a meta % aplicada às receitas do mês ou do período; sem receitas, só o gasto). Abaixo, a soma das metas, o realizado total e a sobra do mês.
- Ao lado das metas, o cartão **Sobra / Aporte** mostra o que sobra das receitas depois de **todas** as despesas (com ou sem meta, rateios de grupo incluídos), para guardar ou investir. A meta dele é um **mínimo**: 100% menos a soma das metas (0% se elas passarem de 100%). Fica verde ao atingir o mínimo, amarelo abaixo dele e vermelho quando as despesas passam das receitas. Os cartões se ajustam à largura e sempre preenchem a linha.
- **Definir metas** muda as metas no rascunho da tabela (botão **Aplicar metas**); elas só são gravadas no **Salvar** da tabela. Os termômetros acompanham todo o rascunho (valores, lançamentos, tipos e metas). Tipos inativos ficam fora das metas.

**Planejamento mensal (tabela dinâmica)**

- Colunas: os meses do período (por padrão o mês atual e os 11 seguintes) e **Total** (fixa à direita), que soma o período em cada linha; no saldo acumulado, mostra o saldo projetado ao fim do período. Linhas: **Despesas** e depois **Receitas** (fixas, não editáveis), que se expandem em **tipos** (Despesas Básicas e Custos de Vida; Salário, Provento e Renda Extra), depois em **categorias** (Moradia, Alimentação, etc.) e, por fim, nos **lançamentos** de cada categoria. Categorias começam recolhidas e mostram a soma dos seus lançamentos (com o número deles); tipos e seções mostram as somas. No rodapé ficam o saldo de cada mês e o saldo acumulado projetado.
- Cada **linha de lançamento** é uma série recorrente (ex.: Netflix, 12 meses) ou um lançamento avulso, com a descrição (ou "Sem descrição") e o dia de vencimento. As células mostram o valor **previsto** de cada mês ou, quando o lançamento já foi realizado no Extrato, o valor **realizado** (marcado com ✓, somente leitura e com link para o Extrato do mês, onde ele é alterado); totais, metas e saldos da tabela seguem o mesmo valor. Editar uma célula pendente altera aquele mês, deixar vazia apaga o lançamento do mês e preencher um mês vazio cria um novo lançamento da mesma série (copiando descrição, vencimento, link de pagamento e meio de pagamento). Tudo aparece no Extrato.
- **+ Novo lançamento**, ao fim de cada categoria expandida (ou no menu da categoria), abre o mesmo formulário do Extrato, já com a categoria escolhida: descrição, valor, dia de vencimento, meio de pagamento e repetição. Entra no rascunho (aparece na tabela marcado como **Não salvo**) e só vai para o Extrato depois de salvar.
- Menu da linha de lançamento: **Editar** (descrição, valor, vencimento, meio de pagamento e categoria, do primeiro mês pendente da janela em diante; meses já realizados não mudam), **Ver no extrato** e **Excluir** (do primeiro mês pendente em diante, com confirmação).
- A **sua parte em um grupo** vinculado à categoria entra na soma da categoria e aparece numa linha somente leitura **Rateios de grupos**, com link para o Extrato do mês.
- Edição direto na célula: clique e digite (`1800`, `1.800,50`, `R$ 10`). Tab vai para a direita, Enter desce (Shift+Enter sobe), Esc desfaz a edição da célula e texto inválido é ignorado. Deixar a célula vazia zera o valor.
- Menu da célula (botão ⋮ ao passar o mouse, ou botão direito): **Replicar para os meses seguintes**, **Replicar até dezembro** e **Limpar valor**. Replicar não altera os meses já realizados.
- **Rascunho para testar cenários**: **qualquer** alteração da tabela (valores, lançamentos novos, editados ou excluídos, tipos e categorias criados, renomeados, inativados ou excluídos, e as metas) fica só no navegador, destacada (células alteradas e o selo **Não salvo** nas linhas), e é gravada ao clicar em **Salvar** na barra do rodapé, que mostra quantas alterações estão pendentes. **Descartar** desfaz tudo. O salvamento é **tudo ou nada**: se algo falhar (ex.: nome duplicado), nada é gravado e o rascunho continua na tela com o erro. Sair da página com alterações pendentes pede confirmação.
- Tipos e categorias padrão são criados uma única vez, no primeiro acesso (excluir todos não os recria).
- Menu de tipos e categorias (botão ⋯ ao passar o mouse sobre o nome, ou botão direito): **Editar** (nome; meta nos tipos de despesa), **Nova categoria** (tipos), **Novo lançamento** (categorias), **Inativar**/**Reativar** e **Excluir**.
- **+ Nova categoria**, ao fim de cada tipo, cria uma categoria pelo nome (no rascunho; já aceita lançamentos). Descrição e dia de vencimento ficam em cada lançamento. Nomes repetidos são recusados na hora. Tipos e categorias ainda não salvos só podem ser editados ou excluídos (não inativados).
- No cabeçalho da tabela: **Novo tipo** (de despesa ou de receita) e **Mostrar inativas**.
- **Inativar** mantém o histórico: os valores continuam nos totais e saldos, mas a linha some da tabela e não aceita valores. Com **Mostrar inativas**, ela aparece esmaecida e somente leitura, e pode ser reativada. Inativar um tipo inativa, na prática, todas as suas categorias.
- **Excluir** pede confirmação e, ao salvar, apaga os valores lançados (de um tipo, apaga também as categorias). Edições do rascunho dentro de uma categoria excluída são descartadas; as de uma categoria inativada são mantidas e gravadas antes da inativação.
- O menu **Categorias** do [Extrato](#extrato) continua gravando na hora.

**Rotas da API** (todas exigem sessão; tudo é do usuário logado)

| Método | Rota | Corpo / query | Resposta |
| --- | --- | --- | --- |
| `GET` | `/budget/categories` | — | `200` com a árvore de tipos (`active`, `goalPercent`) e categorias (`active`), incluindo inativos (cria os padrões no primeiro acesso) |
| `POST` | `/budget/groups` | `{ kind, name, goalPercent? }` | `201` com o tipo, no fim do seu `kind`. `goalPercent` (1–100) só em despesas; `409` se o nome já existir no mesmo `kind` |
| `PATCH` | `/budget/groups/:id` | `{ name?, active?, goalPercent? }` | `200` com o tipo. `goalPercent: null` remove a meta; `kind` não muda; `409` em nome duplicado |
| `DELETE` | `/budget/groups/:id` | — | `204`; apaga as categorias e os valores do tipo |
| `POST` | `/budget/groups/:id/categories` | `{ name }` | `201` com a categoria, no fim do tipo. `400` se o tipo estiver inativo; `409` em nome duplicado no tipo |
| `PATCH` | `/budget/categories/:id` | `{ name?, active? }` | `200` com a categoria |
| `DELETE` | `/budget/categories/:id` | — | `204`; apaga os valores da categoria |
| `GET` | `/budget/entries` | `?from=YYYY-MM&to=YYYY-MM` | `200` com `[{ categoryId, month, amountCents, count, groupCents }]`: soma dos previstos e número de lançamentos de cada célula não vazia, e a sua parte nos grupos vinculados à categoria (`groupCents`, fora de `amountCents`); `400` se o intervalo for inválido, invertido ou maior que 24 meses |
| `GET` | `/budget/lines` | `?from=YYYY-MM&to=YYYY-MM` | `200` com as linhas de lançamento do período: `[{ anchorId, categoryId, description, dueDay, paymentMethod, cells: [{ month, transactionId, plannedCents, realizedCents }] }]`, uma por série recorrente ou lançamento avulso, ordenadas por categoria, vencimento e descrição. `anchorId` identifica a linha ao salvar; `400` como em `/budget/entries` |
| `PUT` | `/budget/lines` | `{ cells: [{ anchorId, month, amountCents }] }` | `204`. Para cada mês da linha: altera o previsto do lançamento, apaga com `0`, ou cria um novo lançamento da série (cópia da linha) se o mês estiver vazio. Até 1000 células por chamada. `404` se algum lançamento não for do usuário, `400` ao gravar em categoria inativa (apagar continua permitido); nada é gravado |
| `PUT` | `/budget/plan` | `{ createGroups?, updateGroups?, deleteGroups?, createCategories?, updateCategories?, deleteCategories?, createLines?, updateLines?, deleteLines?, cells? }` | `204`. Grava o rascunho da tabela do Dashboard numa **única transação**: se algo falhar, nada é gravado. Itens criados recebem um `ref` negativo, usado pelos seguintes no lugar do id (ex.: `createCategories: [{ ref: -2, groupId: -1, name }]` num tipo criado com `ref: -1`; `cells` de um lançamento novo com `anchorId: -3`). Ordem: exclusões de categorias e tipos (o nome pode ser reaproveitado), tipos e categorias criados e alterados, lançamentos criados, alterados e excluídos (`updateLines`/`deleteLines` pelo `transactionId`, do mês em diante como `FOLLOWING`), as células (como em `PUT /budget/lines`) e, por último, as inativações. Até 200 itens de cada lista e 1000 células. `400` validação, `ref` desconhecido ou item inativo; `404` item de outro usuário; `409` nome duplicado |
| `GET` | `/budget/summary` | `?month=YYYY-MM` | `200` com `{ month, initialBalanceCents, openingBalanceCents, incomeCents, expenseCents, monthBalanceCents, closingBalanceCents }`, usando o valor realizado dos lançamentos realizados e somando a sua parte nos grupos vinculados. O mês vem do cliente, por causa do fuso horário |
| `PUT` | `/budget/initial-balance` | `{ amountCents }` | `200` com `{ amountCents }` (pode ser negativo) |

Os valores são sempre centavos inteiros. O sinal vem do tipo da categoria (receita ou despesa), nunca do valor. Tipos e categorias de outro usuário respondem `404` em todas as rotas.

## Extrato

Tela `/extrato` (menu lateral **Extrato**), com os lançamentos de um mês: abre no mês atual e navega com **‹ ›** (ou **Mês atual**). O mês fica na URL (`/extrato?month=2026-11`).

- **Resumo do mês**: um card compacto com o saldo final em destaque e, ao lado, receitas e despesas do mês (com o quanto já foi realizado e o quanto falta realizar), saldo de abertura e saldo do mês.
- **Lista**: Receitas em cima e Despesas embaixo, cada seção com o total e o quanto falta realizar, separada pelos **tipos** (na mesma ordem da tabela do painel), cada um com seu subtotal. Dentro do tipo, os lançamentos (e as suas partes de grupos vinculadas) seguem a ordenação escolhida; por padrão, o dia de vencimento. Cada linha mostra o vencimento (o do meio de pagamento, quando houver, ou o do próprio lançamento), a descrição (ou o nome da categoria, que aparece embaixo quando há descrição), o selo **3/12** quando o lançamento é recorrente, o selo do meio de pagamento (link para a fatura), o botão **Abrir link de pagamento** (quando há link: abre o boleto ou portal em nova aba) e o valor.
- **Somente pendentes**: a chave acima da lista esconde o que já foi pago ou recebido (lançamentos realizados e partes de grupos já acertadas); tipos sem nada pendente somem e o subtotal de cada tipo passa a somar só o que aparece. O **Resumo do mês** e os totais das seções continuam com o mês inteiro.
- **Ordenar**: o botão mostra a ordem atual (ex.: "Vencimento ↑, Valor ↓") e abre a escolha dos critérios em ordem de prioridade (os empates seguem o próximo): **Vencimento** (o efetivo, considerando o meio de pagamento; sem dia vão por último), **Forma de pagamento** (pelo nome; sem meio por último), **Categoria** (na ordem da árvore), **Valor** (o efetivo: realizado ou previsto) e **Situação** (pendentes ou pagos primeiro), cada um crescente ou decrescente. A ordenação vale dentro de cada tipo. A chave e a ordenação ficam guardadas neste navegador (`localStorage`).
- **Período da recorrência**: clicar no selo **3/12** (ou **3/∞**, sem término; a seta indica reajuste automático) abre o período da série. Com **‹ ›** escolha o novo último mês: estender cria lançamentos pendentes, cópias do último; encurtar apaga os pendentes depois do novo fim. Lançamentos já realizados nunca são apagados (o pedido é recusado). Uma série comum vai até 60 meses. A chave **Sem data de término** transforma a série em recorrência sem fim (ou, desligada, define o último mês), e **Reajuste automático** define, muda ou remove o reajuste: os lançamentos pendentes depois do mês atual são recalculados.
- **Recorrência sem término**: a regra fica guardada (`Recurrence`/`GroupRecurrence`) e os meses são criados quando alguém lê o orçamento: sempre até 24 meses à frente do mês atual, ou até o mês consultado (no máximo 120 meses à frente). Cada mês novo copia o último lançamento da série (pendente), então um valor alterado com **também os próximos** segue para os meses criados depois. Excluir um mês só remove aquele mês; **Excluir também os próximos** encerra a recorrência. Com a categoria (ou o tipo) inativa, a criação fica pausada até reativar.
- **Reajuste automático**: percentual (até 100%, com centavos de %) a cada N meses, a partir de um mês (padrão: um período depois do primeiro mês). O valor sobe de forma composta em cada aniversário, arredondado para o centavo. Alterar o valor de um mês com **também os próximos** vira a nova base: o valor digitado substitui o reajuste daquele mês, e os próximos reajustes incidem sobre ele.
- **Saldo inicial**: o botão **Saldo inicial** ajusta quanto o usuário tinha antes do primeiro mês lançado (o mesmo do Dashboard); o saldo de abertura de todos os meses é recalculado.
- **Categorias**: o botão **Categorias** abre um painel com os tipos e as categorias (inativos inclusive), para criar, editar, inativar/reativar e excluir sem sair do Extrato.
- **Celular**: a tela é de uma coluna só, com caixa de "realizado" fácil de tocar e o menu **⋯** de cada linha sempre visível em telas de toque.
- **Realizado**: marcar a caixa da linha registra o lançamento como realizado com o valor previsto; desmarcar volta para pendente. Para informar **outro valor**, use **Informar valor realizado** no menu da linha (⋯ ou botão direito) ou clique no valor realizado. Quando o realizado difere do previsto, a linha mostra os dois.
- **Nova receita / Nova despesa**: categoria (só as ativas do tipo escolhido), descrição opcional, valor previsto, **dia de vencimento** opcional (1 a 31), **link de pagamento** opcional (boleto ou portal; só `http`/`https`, e `https://` é acrescentado quando falta; repetido em toda a recorrência) e, nas despesas, o **meio de pagamento** (opcional; só os ativos; o vencimento dele tem prioridade). Em **Repetir**, escolha **Por alguns meses** (2 a 60, padrão 12, contando o mês atual; cada mês ganha um lançamento da mesma série) ou **Todo mês, sem data de término**; nos dois casos dá para ligar o **Reajuste automático** (percentual, a cada quantos meses e, opcionalmente, o mês do primeiro reajuste). O mesmo vale para um lançamento novo criado pelo Dashboard, que já mostra os valores reajustados no rascunho.
- **Editar / Excluir** um lançamento recorrente pergunta o que fazer com os próximos: **Manter os próximos** / **Excluir só este**, ou **Alterar também os próximos** / **Excluir também os próximos**. A opção "também os próximos" atinge os lançamentos da série deste mês em diante que ainda não foram realizados; meses anteriores e lançamentos já realizados não mudam. Lançamentos de categorias inativas podem ser realizados e excluídos, mas não editados.

**Rotas da API** (todas exigem sessão; lançamento de outro usuário responde `404`)

| Método | Rota | Corpo / query | Resposta |
| --- | --- | --- | --- |
| `GET` | `/budget/transactions` | `?month=YYYY-MM` | `200` com os lançamentos do mês (cria antes os meses que faltam das recorrências sem término): `{ id, month, description, plannedCents, realizedCents, series: { index, count, firstMonth, lastMonth, recurrence: { endMonth, adjustment: { percentBp, everyMonths, firstMonth } \| null } \| null } \| null, category: { id, name, active, group: { id, name, kind, active } }, paymentMethod: { id, name, type, dueDay, active } \| null, dueDay, ownDueDay, paymentUrl }` (`dueDay` é o vencimento efetivo: o do meio de pagamento ou, sem ele, o do lançamento, `ownDueDay`) |
| `POST` | `/budget/transactions` | `{ categoryId, month, description?, plannedCents, repeatMonths?, openEnded?, adjustment?: { percentBp, everyMonths, firstMonth? }, dueDay?, paymentUrl?, paymentMethodId? }` | `201` com os lançamentos criados (um por mês a partir de `month`; `repeatMonths` de 1 a 60; `openEnded: true` repete sem término, criando até 24 meses à frente; `adjustment` em pontos-base (500 = 5%, de 1 a 10000), só com `repeatMonths > 1` ou `openEnded`, e nunca os dois juntos, senão `400`; `paymentUrl`: URL `http(s)` de até 2000 caracteres, senão `400`). `404` se a categoria ou o meio de pagamento não for do usuário, `400` se estiver inativo ou se o meio for usado numa receita |
| `PATCH` | `/budget/transactions/:id` | `{ categoryId?, description?, plannedCents?, dueDay?, paymentUrl?, paymentMethodId?, scope? }` (`null` limpa `dueDay` e `paymentUrl` e tira o meio) | `200` com o lançamento. `scope` é `ONE` (padrão) ou `FOLLOWING` (também os próximos pendentes da série; com reajuste automático, o novo valor é a base dos próximos reajustes). O mês não é editável |
| `DELETE` | `/budget/transactions/:id` | `?scope=ONE\|FOLLOWING` | `204`. `FOLLOWING` numa recorrência sem término a encerra no último mês que sobrou |
| `PUT` | `/budget/transactions/:id/series` | `{ untilMonth: YYYY-MM \| null, adjustment?: { percentBp, everyMonths, firstMonth? } \| null }` | `200` com todos os lançamentos da série. Muda o último mês: cria cópias pendentes do último (com vencimento, link e meio) até `untilMonth`, ou apaga os pendentes depois dele (um lançamento avulso vira série). `untilMonth: null` deixa a série sem término; `adjustment` define (ou, com `null`, remove) o reajuste e recalcula os pendentes depois do mês atual. `400` se `untilMonth` for antes do primeiro mês, se uma série comum passar de 60 meses (com regra não há limite) ou se a categoria estiver inativa (ao estender); `409` se houver lançamento realizado depois do novo fim |
| `PUT` | `/budget/transactions/:id/realization` | `{ amountCents }` | `200`; marca como realizado com esse valor (inteiro ≥ 0) |
| `DELETE` | `/budget/transactions/:id/realization` | — | `200`; volta para pendente |

## Grupos

Menu lateral **Grupos** (`/grupos`): lista os grupos do usuário e, quando houver, os **convites recebidos**, com **Aceitar** e **Recusar**. **Novo grupo** cria o grupo (nome e descrição opcional). Quem cria vira o **dono**, e o grupo já vem com a regra **Igualitário**, que divide igualmente entre todos os membros.

A página do grupo (`/grupos/:id`) tem quatro abas. A aba aberta e o mês ficam na URL, por exemplo `/grupos/3?tab=balanco&month=2026-11`.

- **Lançamentos**: receitas e despesas do grupo no mês, ordenadas pelo dia de vencimento (os sem dia vêm por último). Cada linha mostra o vencimento, a regra usada, a cota de cada membro e quem pagou, ou o selo **A pagar** / **A receber**.
  - **Nova receita / Nova despesa** pede descrição, valor, regra de rateio, **dia de vencimento** opcional (1 a 31) e **link de pagamento** opcional (boleto ou portal), ambos repetidos em toda a recorrência, e mostra a prévia da divisão. Com link, a linha ganha o botão **Abrir link de pagamento**, que também aparece no item do grupo no extrato, no card **Grupos** e na fatura de cada membro.
  - É possível informar quem já pagou (ou recebeu) e repetir o lançamento por 2 a 60 meses. Na repetição, só o primeiro mês sai como pago.
  - **Marcar como pago** registra o membro que pagou; **Desfazer pagamento** volta para pendente.
  - Editar ou excluir um lançamento recorrente pergunta se vale **só este** ou **também os próximos**, como no extrato. Os já pagos não mudam.
  - O selo **3/12** abre o período da recorrência, como no extrato: estender cria cópias pendentes do último (com as mesmas cotas); encurtar apaga os pendentes depois do novo fim. Lançamentos já pagos nunca são apagados.
  - **Sem data de término** e **reajuste automático** funcionam como no extrato. Os meses criados depois são divididos pelos membros **do momento** (a regra do lançamento, ou as proporções do último mês quando ela não serve mais) e ficam sem pagador. Uma regra de **valores fixos** não aceita reajuste automático (`400`).
- **Balanço**: totais do mês e, por membro:
  - **cota**: parte nas despesas menos parte nas receitas;
  - quanto **pagou** e quanto **recebeu**;
  - **saldo**: a receber ou deve.

  O **Acerto do mês** lista as transferências que deixam todos em dia, por exemplo "Bruno paga R$ 1.400,00 para Ana". O saldo considera só o que já foi pago ou recebido e ainda não foi acertado; o que está em aberto aparece à parte.

  **Recebimentos** lista, por par ("Bruno deve a Ana (você)"), a parte de cada membro nos itens já pagos. Quem recebe o dinheiro marca a parte como recebida com o botão ✓ verde (clicar de novo desmarca), ou usa **Marcar tudo como recebido**: numa despesa, quem pagou; numa receita, o dono da parte (quem recebeu a receita repassa). Para os outros membros o botão só mostra o estado. Uma parte recebida sai do saldo e do acerto, e para quem devia ela passa a contar como paga no orçamento pessoal. Enquanto houver partes recebidas, trocar o pagador, desfazer o pagamento ou mudar o valor ou a regra do lançamento é bloqueado (`409`); desmarque-as antes.
- **Membros**: membros e convites pendentes.
  - **Convidar** envia um convite por e-mail. Quem já tem conta vê o convite em `/grupos` e entra ao aceitar.
  - Toda pessoa convidada recebe um e-mail: quem tem conta, o aviso do convite (com link para `/grupos`); o pré-cadastro, o link para ativar a conta.
  - Se o e-mail não tiver conta, informe um **apelido**: a pessoa é **pré-cadastrada** e já entra no grupo (rateios, balanço, "pago por"), com o selo **Pré-cadastro**. O pré-cadastro não faz login até ativar a conta pelo link do e-mail (criando a senha e completando o cadastro) ou se cadastrar com o mesmo e-mail; nos dois casos a conta assume o pré-cadastro (mesmos grupos e histórico) e o nome informado substitui o apelido. Outro grupo que convidar o mesmo e-mail usa o apelido já existente.
  - O convite pode ser cancelado enquanto estiver pendente.
  - O dono pode **remover** membros.
- **Rateio**: regras de divisão do grupo (criar, editar e excluir).
- **Categorias**: categorias próprias do grupo, de um nível só, separadas em despesas e receitas (ex.: Aluguel, Mercado, Sublocação). Qualquer membro cria, renomeia, inativa/reativa e exclui. O lançamento do grupo escolhe uma categoria do mesmo tipo (opcional); ela vai para todas as ocorrências da recorrência e muda com "também os próximos". Uma categoria inativa não é oferecida em novos lançamentos, mas continua nos que já a usam. Excluir a categoria deixa os lançamentos sem categoria.

O menu **⋯** do cabeçalho tem **Vincular ao orçamento** (veja [Grupos no orçamento pessoal](#grupos-no-orçamento-pessoal)), **Editar grupo** e **Excluir grupo** (só o dono) e **Sair do grupo**.

**Regras de rateio**

| Tipo | Como divide | Validação |
| --- | --- | --- |
| Igualitário | Partes iguais entre todos os membros ou entre os escolhidos (quem entrar no grupo passa a participar nos dois casos) | Ao menos um participante |
| Percentual | Cada participante paga um percentual (ex.: 30% / 70%; aceita `33,33`) | Soma de 100% |
| Pesos | Proporcional aos pesos (ex.: 2 para o quarto maior, 1 para os demais); quem entrar no grupo entra com peso 1 | Pesos inteiros de 1 a 1000 |
| Valores fixos | Cada participante paga um valor fixo | O lançamento precisa ter exatamente o total da regra |

- **Centavos que sobram:** na divisão proporcional, ficam com os maiores restos; no empate, com o membro mais antigo. Assim as cotas sempre somam o total.
- **Cotas gravadas:** as cotas ficam gravadas em cada lançamento. Os **já pagos** nunca mudam. Os **ainda não pagos** acompanham o grupo:
  - **editar uma regra** (tipo ou participantes) recalcula todos os pendentes que a usam, de qualquer mês; numa regra de valores fixos, o valor do lançamento passa a ser o novo total. Renomear ou excluir a regra não muda nada;
  - **entrada e saída de membro** recalculam os pendentes do mês atual em diante: quem entra não herda pendências antigas, e quem sai continua com as partes dos meses passados;
  - editar o valor ou a regra de um lançamento recalcula as cotas dele.
- **Entrada de membro:** entra nas regras igualitárias (as de "todos" já o incluem; nas com participantes escolhidos ele é adicionado) e nas de pesos, com peso 1. Regras percentuais e de valores fixos não mudam.
- **Saída de membro:** o histórico do membro é mantido, e ele continua aparecendo no balanço dos meses de que participou.
  - Regras igualitárias e de pesos apenas deixam de incluí-lo.
  - Regras percentuais e de valores fixos que o incluíam ficam **inativas** até serem ajustadas. Nos pendentes que as usam, a parte de quem saiu é redistribuída entre os demais participantes, na proporção das partes atuais.
  - Se o dono sai, o membro mais antigo vira dono. Se o último membro sai, o grupo é excluído.

**Rotas da API**

Todas as rotas exigem sessão. Quem não é membro ativo, incluindo convidados com convite ainda pendente e ex-membros, recebe `404` em todas as rotas do grupo.

| Método | Rota | Corpo / query | Resposta |
| --- | --- | --- | --- |
| `GET` | `/groups` | — | `200` com `[{ id, name, description, role, memberCount }]` dos grupos do usuário |
| `POST` | `/groups` | `{ name, description? }` | `201` com o grupo (`role`, `memberId` do usuário, `members`) |
| `GET` | `/groups/:id` | — | `200` com o grupo, os membros ativos `{ id, userId, name, email, pending, role, joinedAt }` (`pending`: pré-cadastro, `name` é o apelido) e o vínculo do usuário `link: { expenseCategoryId, incomeCategoryId, paymentMethodId, categoryLinks: [{ groupCategoryId, categoryId }] }` e as categorias do grupo `categories: [{ id, kind, name, active }]` |
| `PUT` | `/groups/:id/link` | `{ expenseCategoryId, incomeCategoryId, paymentMethodId?, categoryLinks? }` | `200` com o grupo. Categorias do próprio usuário onde entra a sua parte (`null` desvincula; os dois campos são obrigatórios). `categoryLinks` (opcional; omitido mantém, `[]` remove) leva cada categoria do grupo para uma categoria do usuário do mesmo tipo; os outros itens usam a padrão. `404` se a categoria não for do usuário ou a categoria do grupo for de outro grupo, `400` se for do tipo errado, estiver inativa (manter uma já vinculada que foi inativada é permitido) ou a categoria do grupo se repetir |
| `GET` | `/groups/:id/categories` | — | `200` com `[{ id, kind, name, active }]`, despesas primeiro e por nome |
| `POST` | `/groups/:id/categories` | `{ kind, name }` | `201`; qualquer membro. `409` se o nome já existir no mesmo tipo |
| `PATCH` | `/groups/:id/categories/:categoryId` | `{ name?, active? }` | `200` (o tipo não muda); `409` em nome duplicado |
| `DELETE` | `/groups/:id/categories/:categoryId` | — | `204`; os lançamentos ficam sem categoria e os vínculos com ela somem |
| `PATCH` | `/groups/:id` | `{ name?, description? }` | `200`; só o dono (`403` para os demais membros) |
| `DELETE` | `/groups/:id` | — | `204`; só o dono. Apaga lançamentos, regras e convites |
| `POST` | `/groups/:id/leave` | — | `204`; o acesso termina |
| `DELETE` | `/groups/:id/members/:memberId` | — | `204`; só o dono, e não para si mesmo (`400`) |
| `GET` | `/groups/:id/invitations` | — | `200` com os convites pendentes `{ id, status, invitee: { id, name, email, pending }, inviter, createdAt }` |
| `POST` | `/groups/:id/invitations` | `{ email, nickname? }` | `201` com o convite. Usuário cadastrado: `status: PENDING`. E-mail sem conta: cria o pré-cadastro com o `nickname` (2 a 100 caracteres) e já o adiciona como membro (`status: ACCEPTED`); um pré-cadastro existente entra do mesmo jeito, mantendo o apelido. `400` sem `nickname` para e-mail sem conta (`Nickname required for an unregistered e-mail`) ou para si mesmo, `409` se já for membro ou já tiver convite pendente |
| `DELETE` | `/groups/:id/invitations/:invId` | — | `204`; cancela um convite pendente |
| `GET` | `/invitations` | — | `200` com os convites pendentes recebidos `{ id, group, inviter, createdAt }` |
| `POST` | `/invitations/:id/accept` | — | `204`; entra no grupo (`404` se o convite não for do usuário ou não estiver pendente) |
| `POST` | `/invitations/:id/decline` | — | `204` |
| `GET` | `/groups/:id/split-methods` | — | `200` com `[{ id, name, type, active, shares: [{ memberId, value }] }]` |
| `POST` | `/groups/:id/split-methods` | `{ name, type, shares: [{ memberId, value? }] }` | `201`. `type`: `EQUAL`, `PERCENT` (`value` em centésimos de ponto percentual, 30% = `3000`), `WEIGHT` (peso) ou `FIXED` (centavos). `EQUAL` com `shares: []` divide entre todos. `400` se a regra não fechar ou citar quem não é membro ativo; `409` em nome duplicado |
| `PATCH` | `/groups/:id/split-methods/:methodId` | `{ name?, type?, shares? }` | `200`; mudar tipo ou participantes revalida a regra, a reativa e recalcula os lançamentos pendentes que a usam |
| `DELETE` | `/groups/:id/split-methods/:methodId` | — | `204`; os lançamentos que a usavam mantêm as cotas |
| `GET` | `/groups/:id/transactions` | `?month=YYYY-MM` | `200`, ordenado pelo vencimento, com `{ id, kind, description, month, amountCents, dueDay, paymentUrl, category: { id, name } \| null, splitMethod, paidBy: { memberId, name } \| null, series, shares: [{ memberId, name, amountCents, settled }] }` (`settled`: parte confirmada como recebida) |
| `POST` | `/groups/:id/transactions` | `{ kind, description, month, amountCents, splitMethodId, paidByMemberId?, repeatMonths?, openEnded?, adjustment?, dueDay?, paymentUrl?, categoryId? }` | `201` com os lançamentos criados (`openEnded`/`adjustment` como nos lançamentos pessoais; `400` com reajuste numa regra de valores fixos). `400` se a regra estiver inativa ou não dividir o valor (ex.: valores fixos com outro total), ou se a categoria do grupo for de outro tipo ou estiver inativa; `404` para categoria de outro grupo |
| `PATCH` | `/groups/:id/transactions/:txId` | `{ kind?, description?, amountCents?, splitMethodId?, dueDay?, paymentUrl?, categoryId?, scope? }` | `200`; novo valor ou regra recalcula as cotas (`409` se houver partes recebidas); `dueDay: null` remove o vencimento, `paymentUrl: null`, o link e `categoryId: null`, a categoria (trocar só o `kind` mantendo uma categoria do outro tipo é `400`). `scope` `FOLLOWING` atinge os próximos pendentes da série |
| `DELETE` | `/groups/:id/transactions/:txId` | `?scope=ONE\|FOLLOWING` | `204` |
| `PUT` | `/groups/:id/transactions/:txId/series` | `{ untilMonth: YYYY-MM \| null, adjustment? }` | `200` com todos os lançamentos da série; como no extrato (sem término, reajuste), mas `409` se houver lançamento pago depois do novo fim e `400` com reajuste numa regra de valores fixos |
| `PUT` | `/groups/:id/transactions/:txId/payment` | `{ memberId }` | `200`; registra quem pagou ou recebeu (membro ativo). `409` ao trocar o pagador com partes recebidas |
| `DELETE` | `/groups/:id/transactions/:txId/payment` | — | `200`; volta para pendente. `409` com partes recebidas |
| `POST` | `/groups/:id/settlements` | `{ items: [{ transactionId, memberId }], settled }` (1 a 100 itens) | `204`; confirma (`settled: true`) ou desfaz a confirmação de que as partes foram pagas a quem recebeu o dinheiro. Tudo ou nada: `404` parte fora do grupo, `400` lançamento pendente ou parte do próprio pagador, `403` se o usuário não for quem recebe (despesa: quem pagou; receita: o dono da parte) |
| `GET` | `/groups/:id/balance` | `?month=YYYY-MM` | `200` com `{ month, incomeCents, expenseCents, pendingCents, members: [{ memberId, name, active, shareCents, paidCents, receivedCents, netCents }], transfers: [{ fromMemberId, toMemberId, amountCents }], settlements: [{ transactionId, kind, description, memberId, payerMemberId, amountCents, settled, canSettle }] }`. A soma dos `netCents` é sempre zero; partes recebidas ficam fora deles. `settlements` traz as partes dos outros membros nos itens pagos; `canSettle` diz se o usuário é quem confirma |

## Grupos no orçamento pessoal

A sua parte nos grupos aparece no Dashboard e no Extrato.

- **Card Grupos** (Dashboard, mês atual; Extrato, mês escolhido): para cada grupo, a sua parte nas despesas e nas receitas (de quanto), o que você pagou ou recebeu, o saldo (**A pagar**, **A receber** ou **Em dia**) e o acerto que envolve você ("Pague R$ 1.000,00 a Bruno"). No Extrato, o card também lista cada lançamento do grupo com o vencimento, a sua parte e se já foi pago (nas despesas, vale o vencimento do meio de pagamento vinculado ao grupo, se houver).
- **Vínculo**: em **Vincular categorias** (no card) ou **Vincular ao orçamento** (menu do grupo), cada membro escolhe as próprias categorias, e o vínculo de um não afeta os outros. Sem vínculo, nada entra no seu orçamento; o grupo só aparece no card. Há dois modos:
  - **Uma categoria para tudo** (padrão): uma categoria **de despesa** e uma **de receita** suas recebem todas as suas partes no grupo.
  - **Categoria por categoria** (chave no diálogo, quando o grupo tem categorias): cada categoria do grupo vai para uma categoria sua do mesmo tipo (ex.: Aluguel → Moradia, Mercado → Alimentação). Lançamentos sem categoria ou de categorias não escolhidas ("Usar a padrão") caem na categoria padrão do tipo; sem padrão, ficam só no card. Voltar para "uma categoria para tudo" remove os vínculos por categoria.
- **O que entra no saldo**: só a **sua parte** já rateada (a cota gravada em cada lançamento), não importa quem pagou. O acerto entre os membros fica no grupo. A parte é calculada na leitura, então editar o valor, a regra, o pagamento ou excluir o lançamento do grupo reflete na hora.
- **Dashboard**: a parte soma no valor da categoria vinculada (a célula fica somente leitura, com link para o Extrato), nos totais, nas metas e nos cards de saldo.
- **Extrato**: a parte aparece no tipo da categoria vinculada, somente leitura, com o selo do grupo e o total do lançamento. Conta como **realizada** quando você mesmo pagou ou quando quem pagou confirmou que recebeu a sua parte; até lá, como **a realizar**, com "A acertar com Bruno". O menu da linha tem **Abrir no grupo**.
- **Meio de pagamento**: no mesmo vínculo, escolha um cartão ou conta para a sua parte das despesas do grupo entrar na fatura dele (veja [Meios de pagamento](#meios-de-pagamento)).
- **Histórico**: excluir a categoria vinculada desfaz o vínculo (no modo categoria por categoria, os itens daquela categoria voltam para a padrão). Quem sai do grupo mantém as partes dos meses em que participou (o saldo passado não muda), e o grupo aparece com o selo **Você saiu** nos meses em que você tem parte nele.

**Rotas da API**

| Método | Rota | Corpo / query | Resposta |
| --- | --- | --- | --- |
| `PUT` | `/groups/:id/link` | `{ expenseCategoryId, incomeCategoryId, paymentMethodId? }` | Veja [Grupos](#grupos). `paymentMethodId` é o meio de pagamento da sua parte nas despesas (omitido mantém o atual, `null` tira) |
| `GET` | `/budget/group-statements` | `?month=YYYY-MM` | `200` com os grupos do usuário no mês: `{ group, active, memberId, link: { expenseCategory, incomeCategory, paymentMethod, categoryLinks: [{ groupCategory, category }] }, groupCategories, expenseCents, incomeCents, pendingCents, expenseShareCents, incomeShareCents, paidCents, receivedCents, netCents, transfers: [{ fromMemberId, fromName, toMemberId, toName, amountCents }], items: [{ transactionId, kind, description, month, dueDay, paymentUrl, shareCents, totalCents, paid, groupPaid, paidByName, series, groupCategory, category }] }`. `paid`: a sua parte está quitada (você pagou ou quem pagou confirmou o recebimento); `groupPaid`: alguém pagou no grupo. `transfers` só traz as que envolvem o usuário; `category` é a categoria pessoal onde a parte entra (a vinculada à `groupCategory` do item, senão a padrão do tipo; `null` = fora do orçamento); `dueDay` é o vencimento efetivo (nas despesas, o do meio de pagamento vinculado ao grupo, se tiver, ou o do lançamento) e ordena os itens |

## Meios de pagamento

Tela `/meios-de-pagamento` (menu lateral **Meios de pagamento**), para cartões e contas onde as despesas são pagas, por exemplo "Cartão Americanas, vence todo dia 12".

- **Cadastro**: nome (único por usuário), tipo (**Cartão de crédito**, **Conta / débito** ou **Outro**) e dia de vencimento opcional (1 a 31). Pelo menu **⋯** do card dá para **Editar**, **Inativar/Reativar** e **Excluir**. Um meio inativo some das opções de novos lançamentos, mas os lançamentos que já usam ele continuam como estão. Excluir mantém os lançamentos, sem meio de pagamento.
- **Vencimento**: a despesa lançada num meio de pagamento vence no dia dele; sem meio (ou num meio sem dia), vale o vencimento do próprio lançamento. O extrato ordena e mostra os lançamentos pelo vencimento efetivo.
- **Fatura = mês do lançamento**: não há dia de fechamento; as despesas de outubro no cartão formam a fatura de outubro, com vencimento no dia do meio dentro do mês (dia 31 em fevereiro cai no último dia).
- **Lista**: cada card mostra o tipo, o vencimento, o total da fatura do mês escolhido e quanto falta pagar. Inativos ficam escondidos atrás de **Mostrar inativos**.
- **Fatura** (`/meios-de-pagamento/:id?month=YYYY-MM`): total, pago, a pagar e data de vencimento; os lançamentos do mês (dá para marcar como realizado, editar e excluir como no Extrato); a sua parte nas despesas dos grupos ligados a esse meio (somente leitura: fica paga quando você pagou no grupo ou quem pagou confirmou o recebimento da sua parte; até lá, "A acertar no grupo"); e o histórico de 12 meses (5 antes, 6 depois), clicável.
- **Pagar fatura**: realiza de uma vez todos os lançamentos pendentes do meio no mês, pelo valor previsto (os já realizados mantêm o valor). **Desfazer pagamento** volta todos os lançamentos do meio no mês para pendente. As partes de grupos não mudam.
- **Grupos**: em **Vincular ao orçamento**, escolha o meio de pagamento das suas partes nas despesas do grupo.
- **Isolamento**: meio de pagamento de outro usuário responde `404` (ler, alterar, pagar, usar num lançamento ou no vínculo de grupo).

**Rotas da API** (todas exigem sessão)

| Método | Rota | Corpo / query | Resposta |
| --- | --- | --- | --- |
| `GET` | `/payment-methods` | `?month=YYYY-MM` | `200` com todos os meios (inativos também), por nome: `{ id, name, type, dueDay, active, invoice: { plannedCents, realizedCents, pendingCents, effectiveCents, count } }` |
| `POST` | `/payment-methods` | `{ name, type: CREDIT_CARD\|ACCOUNT\|OTHER, dueDay? }` | `201`; `409` se o nome já existir |
| `PATCH` | `/payment-methods/:id` | `{ name?, type?, dueDay?, active? }` (`dueDay: null` tira o dia) | `200`; `409` em nome duplicado |
| `DELETE` | `/payment-methods/:id` | — | `204`; os lançamentos ficam sem meio |
| `GET` | `/payment-methods/:id/invoice` | `?month=YYYY-MM` | `200`: `{ paymentMethod, month, dueDate, plannedCents, realizedCents, pendingCents, effectiveCents, count, transactions: [lançamento], shares: [{ transactionId, group, description, paymentUrl, shareCents, paid, groupPaid }] }` (`paid`: a sua parte está quitada; `groupPaid`: alguém pagou no grupo) |
| `GET` | `/payment-methods/:id/invoices` | `?from=YYYY-MM&to=YYYY-MM` (até 24 meses) | `200` com os totais de cada mês: `[{ month, plannedCents, realizedCents, pendingCents, effectiveCents, count }]` |
| `PUT` | `/payment-methods/:id/invoice/payment` | `?month=YYYY-MM` | `200` com a fatura; realiza os pendentes pelo valor previsto |
| `DELETE` | `/payment-methods/:id/invoice/payment` | `?month=YYYY-MM` | `200` com a fatura; volta os lançamentos para pendente |

## Testes

Todo recurso só é considerado pronto com testes e2e e unitários (veja [CLAUDE.md](CLAUDE.md)).

```bash
# API
cd apps/api
pnpm test                                                      # unitários
DATABASE_URL=postgresql://budget:budget@localhost:5432/budget_test \
  pnpm prisma migrate deploy --config prisma7.config.ts        # prepara o banco budget_test do compose
pnpm test:e2e                                                  # e2e no budget_test (padrão de vitest.config.e2e.ts)
# Cada teste esvazia as tabelas (TRUNCATE ... RESTART IDENTITY); o reset se recusa a rodar
# em um banco cujo nome não termine em _test, então nunca apaga o banco de desenvolvimento.
# Os e2e usam JWT_ACCESS_SECRET=e2e-test-secret se a variável não estiver definida
# e credenciais OAuth falsas (vitest.config.e2e.ts); GitHub e Google são simulados com um mock de fetch.
# Os e-mails vão para uma caixa em memória (test/mail.ts): o helper signUp cadastra e ativa a conta pelo link

# Web
cd apps/web
pnpm test
```

## CI/CD

O workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) roda em todo push e pull request:

- **api**: instala dependências → `prisma generate` → lint → build → testes unitários → `prisma migrate deploy` no banco `budget_test` de um serviço PostgreSQL 17 do job → testes e2e (com `JWT_ACCESS_SECRET` de teste definido no workflow)
- **web**: instala dependências → gera a árvore de rotas → lint → testes → build
- **docker**: build da imagem (`linux/amd64`, sem push), para o `Dockerfile` não quebrar sem ninguém ver
- **publish**: só depois de `api`, `web` e `docker` passarem, e só em push na `main` (merge de PR) ou de uma tag `v*`. Pull requests e branches de feature nunca publicam. Faz o build multi-arch (`linux/amd64` e `linux/arm64`) e envia para o Docker Hub:

| Evento | Tags publicadas |
| --- | --- |
| merge na `main` | `latest` e `sha-<commit>` |
| tag `v1.2.3` | `1.2.3`, `1.2` e `sha-<commit>` (o `latest` não muda: ele sempre acompanha a `main`) |

O job usa os secrets do repositório (Settings → Secrets and variables → Actions → **Repository secrets**; secrets de Codespaces ou de conta não valem para o Actions) **`DOCKERHUB_USERNAME`** (`zeegfreet`) e **`DOCKERHUB_TOKEN`** (token criado em Docker Hub → Account settings → Personal access tokens, com Read & Write).

Para uma versão fixa (deploy e rollback), crie a tag **num commit da `main`** já mesclado:

```bash
git checkout main && git pull
git tag v1.1.0
git push origin v1.1.0   # publica zeegfreet/budget:1.1.0 e :1.1
```

## Deploy

### Visão geral

```
navegador ──► Traefik (HTTPS, Let's Encrypt)
               └── tudo → container zeegfreet/budget :3000
                           ├── /api/*  → API NestJS (prefixo global, Swagger em /api/docs)
                           └── /*      → build do web (SPA, fallback para index.html)
                                         └── PostgreSQL
```

A imagem é **única**: a API roda com `API_PREFIX=api` e serve o build do web (`WEB_DIST_DIR=/app/web`) em todos os outros caminhos. Como web e API ficam na mesma origem e o cookie de refresh já sai com `Path=/api/auth`, o proxy de borda (Traefik) só termina o TLS e encaminha tudo para a porta 3000, sem reescrever caminhos nem cookies. Ao iniciar, o container roda `prisma migrate deploy` (desligue com `SKIP_MIGRATIONS=true`) e depois `node dist/main.js`; o `HEALTHCHECK` consulta `GET /api`.

A imagem é baseada em `node:24-bookworm-slim`, roda como o usuário `node` e já define `NODE_ENV=production` (cookies `Secure` e `SMTP_HOST` obrigatório), `PORT=3000`, `API_PREFIX=api` e `WEB_DIST_DIR=/app/web`. O `prisma` (CLI) é dependência de produção da API por causa das migrations no start.

### Build da imagem

[scripts/docker-build.sh](scripts/docker-build.sh):

```bash
./scripts/docker-build.sh                # build local (plataforma da máquina), tag = git describe
./scripts/docker-build.sh dev            # build local com a tag zeegfreet/budget:dev

docker login                             # uma vez, com o usuário zeegfreet
./scripts/docker-build.sh 1.0.0 --push   # amd64 + arm64, publica só :1.0.0
```

Sem `--push`, a imagem é carregada no Docker local (só a plataforma da máquina, pois imagens multi-plataforma não podem ser carregadas). Com `--push`, o script cria (uma vez) o builder `budget-builder` do buildx e publica as duas arquiteturas. `IMAGE` e `PLATFORMS` sobrescrevem os padrões. O script nunca publica o `latest` (ele vem sempre do CI na `main`); use o `--push` só para builds manuais ou emergências e, no dia a dia, publique pelo merge na `main` ou por uma tag `v*`.

Para testar a imagem localmente contra o Postgres do `docker compose` e o Mailpit:

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://budget:budget@host.docker.internal:5432/budget \
  -e JWT_ACCESS_SECRET=dev-secret \
  -e SMTP_HOST=host.docker.internal -e SMTP_PORT=1025 \
  -e COOKIE_SECURE=false -e WEB_URL=http://localhost:3000 \
  zeegfreet/budget:dev
# http://localhost:3000 (web) e http://localhost:3000/api/docs (Swagger)
```

### Produção com Traefik

[docker-compose.prod.yml](docker-compose.prod.yml) é um exemplo completo: Traefik v3 (HTTP → HTTPS e certificado Let's Encrypt), a imagem `zeegfreet/budget` e um PostgreSQL 17 com volume. No servidor (com o DNS do domínio apontando para ele e as portas 80/443 abertas):

```bash
cp .env.prod.example .env.prod     # preencha DOMAIN, ACME_EMAIL, senhas, JWT_ACCESS_SECRET, SMTP...
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

O compose define `TRUST_PROXY=1` e `WEB_URL=https://$DOMAIN`. Para atualizar, troque `BUDGET_TAG` (ou use `latest`) e rode `docker compose -f docker-compose.prod.yml --env-file .env.prod pull app && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d`. Se o Traefik já existir no servidor, aproveite só o serviço `app` e as labels `traefik.http.routers.budget.*` (ajustando o nome do entrypoint e do certresolver).

### Sem Docker

Também é possível rodar sem a imagem: `prisma generate`, `pnpm build` nos dois apps e, na API, `prisma migrate deploy` e `node dist/main.js` com `API_PREFIX=api` e `WEB_DIST_DIR` apontando para `apps/web/dist` (mesmo esquema da imagem). Com um proxy que tire o `/api` (sem `API_PREFIX`), lembre de reescrever o path do cookie, veja [Proxy reverso e cookies](#proxy-reverso-e-cookies).

### Checklist de produção

- [ ] `DATABASE_URL` apontando para um PostgreSQL de produção (gerenciado ou com volume persistente), com backup (`pg_dump` agendado ou o backup do serviço) e usuário com senha forte
- [ ] Migrations: rodam no start do container; com várias réplicas, deixe só uma rodar (ou `SKIP_MIGRATIONS=true` e um job separado)
- [ ] Credenciais reais do `@nestjs/observe` em `app.module.ts` (hoje estão com placeholders), de preferência lidas de variáveis de ambiente
- [ ] HTTPS no Traefik (obrigatório para o cookie de sessão `Secure`)
- [ ] `JWT_ACCESS_SECRET` forte e fora do repositório (`.env.prod` nunca vai para o Git); `TRUST_PROXY` definido
- [ ] `WEB_URL` com o domínio real e os callbacks `https://<domínio>/api/auth/oauth/{github,google}/callback` cadastrados no GitHub e no Google; segredos OAuth fora do repositório
- [ ] SMTP configurado (`SMTP_HOST`, credenciais, `MAIL_FROM` de um domínio com SPF/DKIM), pois os links dos e-mails usam `WEB_URL`
- [ ] Secrets `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN` cadastrados como **Repository secrets** do GitHub Actions para a publicação no merge da `main` e nas tags `v*`
- [ ] Avaliar se o Swagger (`/api/docs`) deve ficar exposto em produção

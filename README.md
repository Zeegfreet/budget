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
- [Testes](#testes)
- [CI/CD](#cicd)
- [Deploy](#deploy)

## Principais recursos

- **Isolamento total por usuário (multi-tenant)**: cada usuário vê e altera apenas as próprias finanças. O dono dos dados vem sempre do contexto de autenticação, nunca do corpo da requisição. Acesso a dados de outro usuário retorna `404`, para não revelar que o recurso existe.
- **Receitas e despesas pessoais**: valores guardados em centavos (inteiros), sem ponto flutuante, para que totais e divisões fiquem exatos.
- **Grupos de finanças**: um usuário cria um grupo com receitas e despesas próprias (ex.: aluguel). Só os membros enxergam os dados do grupo.
- **Convites**: um membro convida outro usuário, que só ganha acesso depois de aceitar. Quem sai ou é removido do grupo perde o acesso.
- **Métodos de divisão**: cada grupo define como dividir as receitas e despesas entre os membros (partes iguais, valores fixos, percentuais/pesos). A soma das partes sempre fecha com o total.

## Status dos recursos

| Recurso | API | Web | Observação |
| --- | :---: | :---: | --- |
| Fundação da API (NestJS, Prisma, Swagger, validação) | ✅ | — | |
| Fundação do frontend (Tailwind, shadcn/ui, Router, Query, Atomic Design) | — | ✅ | |
| Pipeline de CI (lint, build, testes unitários e e2e) | ✅ | ✅ | |
| Autenticação por e-mail e senha | ✅ | ✅ | Cadastro com CEP (ViaCEP), login, logout, sessão em cookies httpOnly (JWT de acesso + refresh token com rotação), guard global com Passport. Veja [Autenticação](#autenticação) |
| Login com GitHub e Google (OAuth) | ⏳ | 🚧 | Web já tem os botões; a API ainda não implementa `/auth/github` e `/auth/google` |
| Receitas e despesas pessoais | ⏳ | ⏳ | |
| Grupos de finanças | ⏳ | ⏳ | |
| Convites para grupos | ⏳ | ⏳ | |
| Métodos de divisão | ⏳ | ⏳ | |
| Docker / deploy em containers | ⏳ | ⏳ | Próximo passo, veja [Deploy](#deploy) |

Legenda: ✅ pronto · 🚧 em andamento · ⏳ planejado

## Stack

### API ([apps/api](apps/api))

- **[NestJS 12](https://nestjs.com/)** (TypeScript, ESM)
- **[Prisma 7](https://www.prisma.io/)** com **SQLite** via driver adapter `better-sqlite3`
- **class-validator / class-transformer**: `ValidationPipe` global com `whitelist` e `forbidNonWhitelisted`
- **Swagger** (`@nestjs/swagger`), servido em `/docs`
- **Passport** (`@nestjs/passport`): estratégia `local` no login e `jwt` (token lido do cookie) no guard global
- **`@nestjs/jwt`** para o token de acesso, **argon2** (argon2id) para hash de senha, **cookie-parser**
- **`@nestjs/throttler`** para rate limit (`429`)
- **Vitest** + **Supertest** para testes unitários e e2e
- **oxlint** (lint type-aware) e **Prettier**

### Web ([apps/web](apps/web))

- **[React 19](https://react.dev/)** + **[Vite 8](https://vite.dev/)**
- **Tailwind CSS v4** + **[shadcn/ui](https://ui.shadcn.com/)** (Radix)
- **[TanStack Router](https://tanstack.com/router)** (rotas baseadas em arquivos) + **[TanStack Query](https://tanstack.com/query)**
- **Axios** para chamadas HTTP
- **[ViaCEP](https://viacep.com.br/)** (API pública, chamada direto do navegador) para preencher cidade e UF no cadastro
- **Vitest** + **Testing Library** (jsdom)
- **ESLint**

### Infra

- Monorepo **pnpm workspaces** (`pnpm@12`)
- **Node.js 24**
- **GitHub Actions** para CI

## Estrutura do repositório

```
.
├── apps/
│   ├── api/                 # Backend NestJS
│   │   ├── prisma/          # schema.prisma e migrations
│   │   ├── src/             # módulos (auth, user, prisma), app.setup.ts
│   │   └── test/            # testes e2e (*.e2e-spec.ts)
│   └── web/                 # Frontend React
│       └── src/
│           ├── components/  # ui → atoms → molecules → organisms → templates
│           ├── features/    # <feature>/{types,api,queries}.ts
│           ├── lib/         # cliente Axios, QueryClient, formatação de dinheiro
│           └── routes/      # páginas (TanStack Router file-based)
├── plans/                   # planos de implementação
└── .github/workflows/ci.yml # pipeline de CI
```

## Rodando localmente

### Pré-requisitos

- Node.js 24+
- pnpm 12 (`corepack enable` ou `npm i -g pnpm`)

### 1. Instalar dependências

```bash
pnpm install
```

### 2. Configurar e subir a API

```bash
cd apps/api
cp .env.example .env    # depois troque JWT_ACCESS_SECRET por um valor aleatório

pnpm prisma generate --config prisma7.config.ts                 # gera o client em src/prisma/generated
pnpm prisma migrate dev --config prisma7.config.ts              # cria/atualiza o dev.db
pnpm start:dev                                                  # http://localhost:3000
```

A documentação da API (Swagger) fica em http://localhost:3000/docs.

> O arquivo de configuração do Prisma se chama `prisma7.config.ts`, então passe `--config prisma7.config.ts` em todo comando do Prisma.

> **Atualizando um `dev.db` antigo:** a migration `auth_users` remove a tabela `Post` do scaffold e torna obrigatórios os novos campos de `User` (senha, data de nascimento, CEP...). Ela só é aplicada se a tabela `User` estiver vazia. Se você tiver usuários de teste antigos, recrie o banco com `pnpm prisma migrate reset --config prisma7.config.ts` (isso **apaga** os dados do `dev.db`).

### 3. Subir o frontend

```bash
cd apps/web
pnpm start:dev        # http://localhost:5173
```

Em desenvolvimento, o Vite encaminha `/api/*` para `http://localhost:3000` (removendo o prefixo `/api`) e reescreve o `Path` do cookie de refresh de `/auth` para `/api/auth`. Para apontar para outra API, defina `VITE_API_URL` (veja [apps/web/.env.example](apps/web/.env.example)).

As páginas internas exigem sessão: quem não está autenticado é redirecionado para `http://localhost:5173/login`. Crie uma conta em `/signup` (veja [Autenticação](#autenticação)).

### Variáveis de ambiente

| App | Variável | Padrão | Descrição |
| --- | --- | --- | --- |
| api | `DATABASE_URL` | — (obrigatória) | Conexão do SQLite, ex.: `file:./dev.db` |
| api | `JWT_ACCESS_SECRET` | — (obrigatória) | Segredo que assina o token de acesso. Use um valor longo e aleatório |
| api | `JWT_ACCESS_TTL_SECONDS` | `900` | Validade do token de acesso (15 min) |
| api | `REFRESH_TOKEN_TTL_DAYS` | `7` | Validade da sessão de refresh, renovada a cada uso |
| api | `COOKIE_SECURE` | `true` se `NODE_ENV=production` | Flag `Secure` dos cookies (só HTTPS) |
| api | `TRUST_PROXY` | — | Valor do `trust proxy` do Express (ex.: `1` atrás de um proxy reverso), para o rate limit enxergar o IP real |
| api | `PORT` | `3000` | Porta HTTP da API |
| web | `VITE_API_URL` | `/api` | URL base da API, embutida no bundle no momento do build |

A API valida as variáveis no boot e não sobe se faltar alguma obrigatória. Modelo em [apps/api/.env.example](apps/api/.env.example).

## Autenticação

Entrada por **e-mail + senha** e **cadastro** em `/signup`. Os botões de **GitHub** e **Google** já existem no web, mas o OAuth ainda não está implementado na API.

### Rotas da API

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | `{ name, email, password, birthDate, cep, city, state }` | `201` com o usuário e os cookies de sessão (já entra logado); `400` em dados inválidos; `409` se o e-mail já estiver cadastrado; `429` após 5 tentativas/min |
| `POST` | `/auth/login` | `{ email, password }` | `200` com o usuário e os cookies; `401` `Invalid credentials` (mesma resposta para e-mail inexistente e senha errada); `429` após 5 tentativas/min |
| `POST` | `/auth/refresh` | — (cookie `refresh_token`) | `200` com o usuário e cookies novos; `401` (e cookies apagados) se o refresh estiver ausente, inválido, expirado ou revogado |
| `GET` | `/auth/me` | — | `200` com o usuário da sessão, ou `401` |
| `POST` | `/auth/logout` | — | `204`, revogando a sessão e apagando os cookies (idempotente) |

O usuário retornado é sempre `{ id, email, name }`: hash de senha e demais dados nunca saem da API.

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

### Proxy reverso e cookies

A API define o cookie de refresh com `Path=/auth`. Atrás de um proxy que publica a API sob `/api`, o navegador enxerga `/api/auth/refresh`, então o proxy precisa reescrever o path do cookie (o Vite já faz isso em dev; no Nginx, `proxy_cookie_path /auth /api/auth;`). Se o web for servido de outra origem (`VITE_API_URL` absoluto), será preciso habilitar CORS com `credentials: true` e origem explícita, nunca `*`.

## Testes

Todo recurso só é considerado pronto com testes e2e e unitários (veja [CLAUDE.md](CLAUDE.md)).

```bash
# API
cd apps/api
pnpm test                                                      # unitários
DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts
DATABASE_URL=file:./test.db pnpm test:e2e                      # e2e em banco isolado (nunca o dev.db)
# Os e2e usam JWT_ACCESS_SECRET=e2e-test-secret se a variável não estiver definida

# Web
cd apps/web
pnpm test
```

## CI/CD

O workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) roda em todo push e pull request:

- **api**: instala dependências → `prisma generate` → lint → build → testes unitários → `prisma migrate deploy` em `test.db` → testes e2e (com `JWT_ACCESS_SECRET` de teste definido no workflow)
- **web**: instala dependências → gera a árvore de rotas → lint → testes → build

Ainda não há etapa de deploy automático. Ela entra junto com os arquivos Docker.

## Deploy

> **Status:** os arquivos Docker (`Dockerfile` da API e do web, `docker-compose.yml`) ainda não existem. Esta seção descreve o deploy manual atual e será substituída pelo fluxo com containers quando eles forem criados.

### Visão geral da arquitetura de produção

```
navegador ──► proxy reverso (ex.: Nginx)
               ├── /        → arquivos estáticos do web (apps/web/dist)
               └── /api/*   → API NestJS :3000 (removendo o prefixo /api)
                               └── SQLite (arquivo em volume persistente)
```

A API ainda **não tem CORS habilitado nem prefixo global**. Por isso, em produção o frontend e a API devem ficar sob o mesmo domínio, com um proxy reverso que remove o `/api`, igual ao proxy do Vite em desenvolvimento.

### API

```bash
pnpm install --frozen-lockfile
cd apps/api
pnpm prisma generate --config prisma7.config.ts
pnpm build

export DATABASE_URL="file:/var/lib/budget/prod.db"   # caminho em disco persistente
export JWT_ACCESS_SECRET="<valor longo e aleatório>" # trocar invalida todas as sessões de acesso
export NODE_ENV=production                           # cookies com Secure
export TRUST_PROXY=1                                 # atrás do Nginx: rate limit por IP real
export PORT=3000
pnpm prisma migrate deploy --config prisma7.config.ts  # aplica migrations pendentes (rode a cada deploy)
pnpm start:prod                                        # node dist/main
```

### Web

```bash
cd apps/web
pnpm build            # gera apps/web/dist
```

Sirva `apps/web/dist` como site estático. Como é uma SPA, configure o fallback para `index.html` (no Nginx: `try_files $uri /index.html;`).

### Exemplo de Nginx

```nginx
server {
  listen 80;
  root /srv/budget/web;            # conteúdo de apps/web/dist

  location /api/ {
    proxy_pass http://127.0.0.1:3000/;   # a barra final remove o prefixo /api
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_cookie_path /auth /api/auth;   # o cookie de refresh vem com Path=/auth
  }

  location / {
    try_files $uri /index.html;
  }
}
```

### Checklist de produção

- [ ] `DATABASE_URL` apontando para um arquivo em volume persistente, com backup
- [ ] `prisma migrate deploy` executado a cada deploy, antes de iniciar a API
- [ ] Credenciais reais do `@nestjs/observe` em `app.module.ts` (hoje estão com placeholders), de preferência lidas de variáveis de ambiente
- [ ] HTTPS no proxy reverso (obrigatório para o cookie de sessão `Secure`)
- [ ] `JWT_ACCESS_SECRET` forte e fora do repositório; `NODE_ENV=production` e `TRUST_PROXY` definidos
- [ ] `proxy_cookie_path /auth /api/auth;` no Nginx (senão o refresh não recebe o cookie)
- [ ] Avaliar se o Swagger (`/docs`) deve ficar exposto em produção

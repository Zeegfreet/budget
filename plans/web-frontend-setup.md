# Setup do frontend: Tailwind + shadcn + Atomic Design + TanStack Router/Query + Axios

## Context
`apps/web` ainda é o template padrão do Vite (React 19, Vite 8, TS 6, ESLint). Antes de construir telas do Budget precisamos da fundação: estilização (Tailwind v4 + shadcn/ui), estrutura de componentes reutilizáveis (Atomic Design), roteamento type-safe (TanStack Router file-based), camada de dados (TanStack Query + Axios) e — por exigência do CLAUDE.md — runner de testes no web e pipeline de CI.

Decisões confirmadas: shadcn em `components/ui` com camadas atômicas por cima; rotas file-based; incluir Vitest + RTL e `.github/workflows/ci.yml`.

## 0. Salvar o plano no projeto
Criar a pasta `plans/` na raiz do repositório e salvar este plano como `plans/web-frontend-setup.md` (primeiro passo da execução).

## 1. Dependências (`apps/web`)
- Runtime: `tailwindcss @tailwindcss/vite @tanstack/react-router @tanstack/react-query axios` + as que o `shadcn init` instala (`class-variance-authority clsx tailwind-merge lucide-react tw-animate-css`, radix por componente).
- Dev: `@tanstack/router-plugin @tanstack/react-router-devtools @tanstack/react-query-devtools @tanstack/eslint-plugin-query vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`.

## 2. Tailwind v4 + alias `@/`
- `vite.config.ts`: plugins em ordem `tanstackRouter({ target: 'react', autoCodeSplitting: true })`, `react()`, `tailwindcss()`; `resolve.alias['@'] = path.resolve(import.meta.dirname, 'src')`; `server.proxy['/api'] → http://localhost:3000` com rewrite removendo `/api` (API não tem CORS nem global prefix — evita mexer na API agora).
- `tsconfig.json` e `tsconfig.app.json`: `baseUrl: "."`, `paths: { "@/*": ["./src/*"] }` (o shadcn CLI lê do tsconfig raiz).
- `src/index.css`: substituir o CSS do template por `@import "tailwindcss";` + tokens do shadcn (gerados no init). Remover `App.css`, `App.tsx`, assets do template.

## 3. shadcn
- `pnpm dlx shadcn@latest init` (style new-york, base color neutral, CSS variables). `components.json` com aliases: `components: @/components`, `ui: @/components/ui`, `utils: @/lib/utils`, `hooks: @/hooks`.
- Adicionar o conjunto inicial: `button input label card form sonner skeleton`.

## 4. Estrutura Atomic Design (`src/`)
```
components/
  ui/          # shadcn (vendorizado, não editar à mão além de ajustes de tema)
  atoms/       # wrappers finos/específicos do domínio: MoneyText (formata centavos→BRL), Spinner, Logo
  molecules/   # FormField (Label+Input+mensagem de erro), EmptyState
  organisms/   # AppHeader (logo + navegação)
  templates/   # AppLayout (header + <Outlet/>), AuthLayout
lib/
  utils.ts         # cn() (gerado pelo shadcn)
  api/client.ts    # instância axios
  query-client.ts  # QueryClient com defaults
  money.ts         # formatCents(cents: number, locale='pt-BR', currency='BRL') via Intl
features/<feature>/{api.ts,queries.ts,types.ts}  # padrão para futuros recursos (user, groups…)
routes/
  __root.tsx   # createRootRouteWithContext<{ queryClient }>() + AppLayout + devtools em DEV
  index.tsx    # página inicial placeholder usando átomos/moléculas
routeTree.gen.ts   # gerado (ignorar no ESLint e commitar)
main.tsx
```
Cada camada tem `index.ts` com barrel exports. Regra: uma camada só importa das camadas abaixo (ui → atoms → molecules → organisms → templates → routes). Páginas = arquivos em `routes/`.

## 5. Dados: Axios + TanStack Query
- `lib/api/client.ts`: `axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' })`, interceptor de response normalizando erro para `ApiError { status, message }` (Nest retorna `message` string|string[] do ValidationPipe). Ponto preparado para injetar header de auth futuramente.
- `lib/query-client.ts`: `staleTime: 30s`, `retry` que não refaz em 4xx.
- `features/user/{api.ts,queries.ts}`: exemplo do padrão com `queryOptions()` (`userQueries.all()`) consumindo `GET /user` existente — serve de referência para os próximos módulos e para `loader: ({ context }) => context.queryClient.ensureQueryData(...)`.
- `src/vite-env.d.ts`: tipar `VITE_API_URL`; criar `.env.example`.

## 6. main.tsx
`createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent' })`, declaração `Register` do módulo, render com `<QueryClientProvider><RouterProvider/></QueryClientProvider>` + `<Toaster/>`.

## 7. ESLint
Adicionar `@tanstack/eslint-plugin-query` (flat recommended), ignorar `src/routeTree.gen.ts` e `src/components/ui/**` para a regra `react-refresh/only-export-components` (shadcn exporta variants junto).

## 8. Testes (Vitest + RTL)
- `vitest.config.ts` (ou bloco `test` no vite config): `environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']` (jest-dom), alias `@`.
- `src/test/render.tsx`: helper `renderWithProviders` (QueryClient novo por teste, retry off) e `renderRoute(path)` com `createRouter` + `createMemoryHistory`.
- Testes iniciais: `lib/money.spec.ts`, `atoms/MoneyText.spec.tsx`, `molecules/FormField.spec.tsx` (label associada, erro exibido), `lib/api/client.spec.ts` (normalização de erro, axios mockado), `routes/index.spec.tsx` (fluxo: navegar para `/` renderiza layout + página).
- Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`; `tsconfig.app.json` types inclui `vitest/globals` se usar globals.

## 9. CI (`.github/workflows/ci.yml`)
- Trigger: push e pull_request. Node 24, `pnpm/action-setup` (versão do `packageManager`), cache pnpm, `pnpm install --frozen-lockfile`.
- Job `web`: `pnpm --filter web lint`, `test`, `build`.
- Job `api`: `prisma generate --config prisma7.config.ts`, `lint`, `build`, `test`, `test:e2e` com `DATABASE_URL=file:./test.db` + `prisma migrate deploy`.
- Pré-requisito para o CI ficar verde: corrigir `user.service.spec.ts` / `user.controller.spec.ts` fornecendo mock de `PrismaService` (falha conhecida no CLAUDE.md). Verificar se `app.e2e-spec.ts` passa; se não, ajustar o mínimo.
- Adicionar `"packageManager": "pnpm@12.9.1"` no `package.json` raiz se ausente.

## 10. Documentação
Atualizar CLAUDE.md: seção Web (stack, estrutura atômica e regra de imports, `shadcn add`, padrão `features/` + `queryOptions`, proxy `/api`, comando `pnpm test`), seção CI, e remover "There is no pipeline yet" / atualizar "Known state of tests".

## Verificação
1. `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build` — tudo verde, `routeTree.gen.ts` gerado.
2. `pnpm --filter api start:dev` + `pnpm --filter web start:dev`: abrir `http://localhost:5173`, ver layout com estilos Tailwind/shadcn, devtools do Router/Query, e requisição `GET /api/user` passando pelo proxy na aba Network.
3. `pnpm --filter api test && pnpm --filter api test:e2e` verdes.
4. Validar o workflow localmente com `act` se disponível, ou revisar e confirmar no primeiro push.

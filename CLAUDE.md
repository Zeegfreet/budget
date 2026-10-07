# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product overview

Budget is a **personal finance management SaaS**. Core requirements that shape every feature:

- **Strict per-user isolation (multi-tenant)**: each user can only see and change their own finances. Every query for user-owned data must be scoped to the authenticated user (or to a group they belong to). Never trust an owner/user id sent in the request body or params; derive it from the auth context. Cross-tenant access must return `404` (not `403`) so resource existence isn't leaked, and e2e tests must cover "user A cannot read/update/delete user B's data".
- **Finance groups (shared finances)**: besides personal finances, a user can create a group (e.g. a shared house/"república") that has its own incomes and expenses (e.g. rent). Group data is visible only to its members.
- **Invitations**: a group member invites another user to join; the invitee must accept before gaining access. Membership can end (leave/removal), which revokes access.
- **Split methods**: a group defines methods for dividing its incomes/expenses among its members (e.g. equal split, fixed amounts, percentages/weights). Each group income/expense uses a split method, and the resulting shares per member must add up to the total.

Money values should be stored as integer minor units (cents) or decimals, never floats, so splits and totals stay exact.

## Definition of done: tests and CI/CD are mandatory

Every resource/feature we create (API module, endpoint, frontend page/component, etc.) is only complete when it ships with:

1. **End-to-end tests (top priority)** covering the real usage flows of the feature, not just the happy path: success cases, validation errors (the global `ValidationPipe` rejects unknown/invalid fields), not-found, and other relevant error responses.
   - API: `apps/api/test/<feature>.e2e-spec.ts`, run with `pnpm test:e2e`, booting the real `AppModule` via Supertest against an isolated test database (never `dev.db`).
   - Web: user-flow tests for each screen with Vitest + Testing Library, rendering the real route tree via `renderRoute(path)` from `src/test/render.tsx` and mocking the feature's `api.ts` (see `src/routes/index.spec.tsx`).
2. **Unit tests** (`*.spec.ts` next to the source) for services, controllers and non-trivial logic, mocking `PrismaService` where needed.
3. **CI/CD coverage**: the CI pipeline (`.github/workflows/ci.yml`) runs lint, build, unit tests and e2e tests for every app on each push/PR. When a feature needs a new step (migrations, env vars, seed data, a new app/package), update the workflow in the same change. The `api` job generates the Prisma client and runs e2e against `DATABASE_URL=file:./test.db` after `prisma migrate deploy`; the `web` job generates the route tree, then lints, tests and builds.

4. **README update**: the root `README.md` (written in Portuguese) must reflect the change in the same task: update the "Status dos recursos" table, and the stack, setup, env vars, testing, CI/CD or deploy sections whenever the feature touches them (e.g. new env var, new dependency/service, Docker files, deploy steps).

Don't consider a task done, or open a PR, while tests are missing or failing.

## Repository layout

pnpm workspace monorepo (`pnpm@12`, see `pnpm-workspace.yaml`) with two apps and no shared packages yet:

- `apps/api` — NestJS 12 backend, Prisma 7 + SQLite, Vitest, oxlint. ESM (`"type": "module"`).
- `apps/web` — React 19 + Vite 8 frontend: Tailwind CSS v4, shadcn/ui (Radix, `radix-nova` style), TanStack Router (file-based) + TanStack Query, Axios, Vitest + Testing Library, ESLint.

The root `package.json` has no useful scripts; run commands per app with `pnpm --filter <api|web> <script>` or from inside the app directory.

## Commands

### API (`apps/api`)

```bash
pnpm start:dev                  # watch mode, http://localhost:3000 (PORT overrides)
pnpm build                      # nest build -> dist/
pnpm lint                       # oxlint --type-aware src/ test/
pnpm format                     # prettier
pnpm test                       # unit tests (**/*.spec.ts)
pnpm test src/user/user.service.spec.ts   # single test file
pnpm test -t "should be defined"          # filter by test name
pnpm test:e2e                   # e2e tests (**/*.e2e-spec.ts, vitest.config.e2e.ts)
```

Swagger UI is served at `/docs`.

### Prisma (`apps/api`)

The Prisma config file is named `prisma7.config.ts` (not the default `prisma.config.ts`), so pass it explicitly:

```bash
pnpm prisma generate --config prisma7.config.ts
pnpm prisma migrate dev --name <name> --config prisma7.config.ts
```

`DATABASE_URL` comes from `apps/api/.env` (SQLite file `dev.db`).

### Web (`apps/web`)

```bash
pnpm start:dev        # vite dev server, http://localhost:5173 (proxies /api/* -> http://localhost:3000)
pnpm build            # tsr generate && tsc -b && vite build
pnpm lint
pnpm test             # vitest run (src/**/*.spec.{ts,tsx}, jsdom)
pnpm generate:routes  # regenerate src/routeTree.gen.ts (the Vite plugin also does it in dev)
pnpm dlx shadcn@latest add <component>   # adds to src/components/ui
```

## API architecture

- **ESM + nodenext resolution**: all relative imports must use the `.js` extension (e.g. `import { UserService } from './user.service.js'`), even from `.ts` files.
- **Prisma client is generated into the source tree** at `src/prisma/generated` (gitignored, `moduleFormat = "cjs"`). Import `PrismaClient` from `./generated/client.js`, not `@prisma/client`. Re-run `prisma generate` after any `schema.prisma` change.
- **Prisma 7 driver adapter**: `PrismaService` (`src/prisma/prisma.service.ts`) extends `PrismaClient` and builds a `PrismaBetterSqlite3` adapter from `DATABASE_URL` via `ConfigService`. The datasource URL in `schema.prisma` is intentionally absent; it lives in `prisma7.config.ts` for the CLI.
- **Module wiring**: `ConfigModule` is global and validates the env on boot (`src/config/env.validation.ts`; `DATABASE_URL` and `JWT_ACCESS_SECRET` are required). Feature modules import `PrismaModule` for `PrismaService` (never register `PrismaService` directly).
- **HTTP setup**: `src/app.setup.ts` (`configureApp`) applies `cookie-parser`, the global `ValidationPipe` and `trust proxy`. Both `main.ts` and the e2e helper `test/utils.ts` (`createTestApp`, `resetDatabase`) use it, so e2e tests run with the production pipes.
- **Validation**: the global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted`, and `transform`, so DTOs must declare every accepted field with `class-validator` decorators or requests will be rejected. Swagger metadata comes from `@ApiProperty` plus the `@nestjs/swagger` CLI plugin (enabled in `nest-cli.json`).
- **Auth** (`src/auth/`): Passport `local` (login) + `jwt` (access token read from the `access_token` httpOnly cookie, validated without DB). Refresh tokens are opaque, rotated on every `/auth/refresh`, and stored hashed in the `Session` table (`SessionService` is the only stateful part). `JwtAuthGuard` and `ThrottlerGuard` are global `APP_GUARD`s: **every route requires auth unless marked `@Public()`**. In user-owned features, take the owner from `@CurrentUser()` (`{ id }`) and scope every query by it. `UserService` returns the public `AuthUser` shape (`authUserSelect`); only `findByEmail` exposes `passwordHash`, for credential checks.
- **Observability**: `@nestjs/observe` is set up in `app.module.ts` with placeholder credentials (`YOUR_APP_KEY`/`YOUR_APP_SECRET`) and passed as `instrument` to `NestFactory.create`.
- **Budget** (`src/budget/`): `CategoryGroup` (type, with `kind` INCOME/EXPENSE; optional `goalPercent` 1–100, expense only) → `Category` (optional `description`, `dueDay` 1–31) → `MonthlyEntry` (one `amountCents >= 0` per category and `YYYY-MM` month; zero is not stored). The INCOME/EXPENSE level is the fixed enum, never editable. User-owned tables carry a denormalized `userId` so every query is scoped by it. `User.initialBalanceCents` feeds the opening balance. Default categories are created once, lazily on the first `GET /budget/categories`, guarded by `User.budgetSeeded` (deleting every type must not recreate them). `BudgetService` handles the tree read, entries and summary; `CategoryService`/`CategoryController` create/edit/delete types and categories (409 on duplicate names). Types and categories have `active`: inactive ones keep counting in totals (history kept) but `PUT /budget/entries` rejects them with 400. Deletes cascade to values. Pure balance math lives in `balance.ts`. `isUniqueViolation` (`src/prisma/errors.ts`) detects Prisma `P2002`.
- Feature modules follow the Nest CLI resource layout (`<feature>/{module,controller,service}.ts`, `dto/`, `entities/`); generate new ones with `nest g resource`.

## Web architecture

- **Imports**: use the `@/` alias for `src/` (no `.js` extensions; bundler resolution).
- **Atomic design** under `src/components/`, each layer with an `index.ts` barrel. A layer may only import from layers below it: `ui` → `atoms` → `molecules` → `organisms` → `templates` → `routes`.
  - `ui/`: shadcn components, vendored via the CLI. Don't hand-edit beyond theming; build on top of them instead. They import `cn` from the `cn` package (shadcn's clsx + tailwind-merge replacement); app code uses `@/lib/utils`.
  - `atoms/` (e.g. `MoneyText`, `Spinner`, `Logo`), `molecules/` (`FormField`, `EmptyState`), `organisms/` (`AppSidebar`), `templates/` (`AppLayout`, `AuthLayout`).
  - The authenticated shell (`AppLayout`) is fluid (no max-width container; `SidebarInset` has `min-w-0` so wide content such as the budget grid scrolls inside instead of widening the page) with a collapsible shadcn `Sidebar` (`collapsible="icon"`, state kept in the `sidebar_state` cookie) with a `UserMenu` (Editar perfil / Alterar senha / Sair) in its footer. Register new top-level pages in the side menu via `appNavItems` in `src/lib/navigation.ts`. Sign-out logic lives in `useSignOut()` (`src/features/auth/hooks.ts`).
  - `src/hooks/` holds shared hooks (`useIsMobile`, adapted from shadcn to `useSyncExternalStore`). `src/test/setup.ts` polyfills `matchMedia`, pointer capture and `scrollIntoView` for the sidebar and Radix menus in jsdom.
  - Pages are route files in `src/routes/`. Spec files there are excluded from the route tree via `tsr.config.json`. `src/routeTree.gen.ts` is generated.
- **Data**: `src/lib/api/client.ts` exports the `api` Axios instance (`baseURL` = `VITE_API_URL` or `/api`, `withCredentials`). Its interceptor refreshes the session once on a `401` (single-flight `POST /auth/refresh`, then replays the request) and rejects with `ApiError { status, messages }`, which normalizes Nest's `message: string | string[]`. Auth state comes from `authQueries.me()` (`src/features/auth/`); the `_app` layout route guards internal pages. Each resource lives in `src/features/<feature>/{types,api,queries}.ts`; `queries.ts` exposes `queryOptions` factories (e.g. `userQueries.all()`) shared by `useQuery` and route loaders (`context.queryClient.ensureQueryData(...)`; the router context carries `queryClient`).
- **Money**: render cents with `formatCents` / `<MoneyText cents={...} />`; never convert to floats for math. Parse user input with `parseMoneyInput` (`src/lib/money.ts`, string-based, returns cents or `null`) and show it in inputs with `formatAmount`; `<MoneyInput>` (atom) wires this up.
- **Budget / dashboard** (`src/features/budget/`, route `src/routes/_app/index.tsx`): months are `YYYY-MM` strings (`months.ts`). The grid edits a local draft (`draft.ts` reducer over cell keys `categoryId:month`, `useBudgetDraft`), sends only real changes via `PUT /budget/entries`, and blocks navigation while dirty (`useUnsavedChangesGuard`); the `forget` action drops edits of categories that were inactivated or deleted. Pivot rows, per-row window `total`s and the Total column come from `buildBudgetTable` (`rows.ts`), which keeps inactive rows (they count); `BudgetGrid` hides them unless "Mostrar inativas". Row menus emit a `GridAction`; the page maps it to `useCategoryActions` (`hooks.ts`, invalidates the tree, or all budget queries on delete) or to a `BudgetDialog` rendered by the `BudgetDialogs` organism. Goals per expense type come from `buildGoalsOverview` (`goals.ts`, integer math, `GoalsPanel`). Specs that land on `/` must `vi.mock('@/features/budget/api')` and call `stubBudgetApi()` from `src/test/budget.ts` (use `makeGroup`/`makeCategory` for fixtures); category and goal flows live in `index.categories.spec.tsx` and `index.goals.spec.tsx`.
- Router and Query devtools load lazily in dev only (`src/lib/devtools.tsx`).

## Known state of tests

All API unit and e2e tests and all web tests pass. The API e2e config reads `DATABASE_URL` from the environment, so set `DATABASE_URL=file:./test.db` (and run `prisma migrate deploy`) when running `pnpm test:e2e` locally to avoid touching `dev.db`. It defaults `JWT_ACCESS_SECRET` to a test value and runs files sequentially (shared SQLite file).

## Agent skills

`apps/api/.agents/skills/` contains vendored Prisma skills (CLI, client API, Prisma 7 upgrade, driver adapters, etc.; locked in `skills-lock.json`). Consult them for Prisma 7–specific APIs, which differ from older Prisma versions.

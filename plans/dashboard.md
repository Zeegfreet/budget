# Layout fluido + Dashboard (balanço e planilha mensal editável)

## Context
O shell autenticado (`AppLayout`) prende o conteúdo em `mx-auto max-w-5xl`. Queremos layout fluido e a primeira tela real: o **Dashboard** em `/`, com
- 5 cards: **Saldo de abertura** (saldo inicial + acumulado dos meses anteriores), **Receitas do mês**, **Despesas do mês**, **Saldo do mês** (receitas − despesas) e **Saldo acumulado** (abertura + saldo do mês);
- uma **tabela dinâmica editável** do mês atual + 11 meses: `Despesas` e `Receitas` (expansíveis) → **Tipo** → **Categoria**. Valores ficam nas categorias; tipos e grupos são somas. Edição por célula com rascunho local, botão **Salvar**, e menu por célula para **replicar para os meses seguintes**.

Decisões do usuário: hierarquia de 3 níveis (com categorias padrão criadas automaticamente); saldo de abertura = **saldo inicial informado pelo usuário** + receitas − despesas de todos os meses anteriores; um **valor único por categoria/mês** (previsto × realizado fica para depois); **commitar o menu lateral pendente antes** e fazer o dashboard em commit separado.

Escopo: finanças pessoais (grupos depois). Tela de edição de categorias fica para outra tarefa — aqui só a API de leitura + padrões.

## 0. Plano e Git
Primeiro passo após aprovação: copiar este plano para `plans/dashboard.md` na raiz do projeto (mesmo padrão de `plans/web-app-sidebar.md`) e incluí-lo no commit do dashboard.

Commit só do trabalho pendente do menu lateral (`git status` atual: sidebar, UserMenu, settings, README/CLAUDE.md) com `feat(web): collapsible app sidebar`, depois de rodar lint/test/build do web. Dashboard em commit próprio no fim.

## 1. API — modelo (`apps/api/prisma/schema.prisma`)
Migration `budget` (`prisma migrate dev --name budget --config prisma7.config.ts`):
- `enum EntryKind { INCOME EXPENSE }` (Prisma 7 suporta enum no SQLite; confirmar nas skills vendored, senão `String` validado).
- `CategoryGroup` (o "Tipo"): `id, userId → User (Cascade), kind, name, position, createdAt`; `@@unique([userId, kind, name])`.
- `Category`: `id, userId, groupId → CategoryGroup (Cascade), name, position`; `@@unique([groupId, name])`, `@@index([userId])`. `userId` desnormalizado para escopar toda query pelo dono.
- `MonthlyEntry`: `id, userId, categoryId → Category (Cascade), month String ("YYYY-MM", ordena lexicograficamente), amountCents Int (≥ 0; o sinal vem do kind)`; `@@unique([categoryId, month])`, `@@index([userId, month])`.
- `User.initialBalanceCents Int @default(0)` (pode ser negativo).
- `test/utils.ts#resetDatabase`: apagar `monthlyEntry`, `category`, `categoryGroup` antes de `user`.

## 2. API — módulo `budget` (`src/budget/`, `nest g resource` → module/controller/service/dto, importa `PrismaModule`, registrado em `app.module.ts`)
Todas as rotas autenticadas, dono via `@CurrentUser()`.
- `GET /budget/categories` → árvore `[{ id, kind, name, position, categories: [{ id, name, position }] }]`. Chama `ensureDefaults(userId)`: se o usuário não tem grupos, cria os padrões numa transação (ignora `P2002` de corrida). Padrões (`src/budget/default-categories.ts`):
  - EXPENSE — *Despesas Básicas*: Moradia, Alimentação, Transporte, Saúde · *Custos de Vida*: Lazer, Educação, Assinaturas, Outros
  - INCOME — *Salário*: Salário · *Provento*: Proventos · *Renda Extra*: Renda extra
- `GET /budget/entries?from=YYYY-MM&to=YYYY-MM` → `[{ categoryId, month, amountCents }]` (só valores ≠ 0). DTO de query: regex de mês, `from ≤ to`, janela ≤ 24 meses (400).
- `PUT /budget/entries` body `{ entries: [{ categoryId, month, amountCents }] }` (`@ArrayMaxSize(1000)`, `@IsInt @Min(0)`, `@ValidateNested`). Confere que **todos** os `categoryId` são do usuário (senão **404**), depois upsert em transação; `amountCents = 0` apaga a linha. Retorna `204`.
- `GET /budget/summary?month=YYYY-MM` (mês vem do cliente por causa do fuso) → `{ month, initialBalanceCents, openingBalanceCents, incomeCents, expenseCents, monthBalanceCents, closingBalanceCents }`. Somas com `monthlyEntry.groupBy({ by: ['categoryId'], _sum })` + mapa categoria→kind; tudo inteiro.
- `PUT /budget/initial-balance` `{ amountCents }` (`@IsInt`, aceita negativo) → summary-less `{ initialBalanceCents }`.
- Lógica de soma pura em `src/budget/balance.ts` (`sumByKind`, `computeSummary`) para teste unitário fácil.

## 3. Web — layout e navegação
- `AppLayout.tsx`: trocar `mx-auto w-full max-w-5xl px-4` por `w-full flex-1 px-4 py-4 md:px-6 lg:px-8` (fluido, sem max-width).
- `src/lib/navigation.ts`: item `/` vira **Dashboard** (`LayoutDashboardIcon`).
- `src/routes/_app/index.tsx`: substitui o `HomePage` pelo Dashboard; loader faz `ensureQueryData` de categorias, entries (janela) e summary.
- shadcn via CLI: `table`, `dialog`, `context-menu` (e `popover` se preciso).

## 4. Web — feature `src/features/budget/`
- `types.ts`, `api.ts` (`fetchCategories`, `fetchEntries`, `saveEntries`, `fetchSummary`, `updateInitialBalance`), `queries.ts` (`budgetQueries.categories()`, `.entries(from,to)`, `.summary(month)`).
- `months.ts` (puro): `currentMonth(date = new Date())`, `addMonths('2026-10', 1)`, `monthWindow(start, 12)`, `formatMonthLabel('2026-10') → 'out/26'`.
- `draft.ts` (puro, reducer): estado `{ saved: Map<key,cents>, edits: Map<key,cents> }`, `key = "categoryId:month"`; ações `set`, `replicate(categoryId, fromMonth, toMonth)`, `clear`, `discard`, `reset(saved)`; seletores `valueOf`, `isDirty(key)`, `dirtyCount`, `toPayload()` (só células alteradas; editar de volta ao valor salvo remove do rascunho).
- `rows.ts` (puro): `buildBudgetRows(groups, valueOf, months)` → linhas com nível/totais por mês; `monthTotals` → receitas, despesas, saldo do mês e **saldo acumulado projetado** por coluna (abertura do summary + saldos sucessivos).
- `src/lib/money.ts`: `parseMoneyInput('1.234,56') → 123456` por manipulação de string (sem float); `null` para inválido; aceita `1234`, `1234,5`, `R$ 10`.
- Hook `useBudgetDraft` (`hooks.ts`) com `useReducer` + `useBlocker` (TanStack Router) e `beforeunload` quando há alterações não salvas; mutation `saveEntries` → invalida `entries` e `summary`, toast (sonner) de sucesso/erro.

## 5. Web — componentes (atomic)
- **atom** `MoneyInput`: input com `inputMode="decimal"`, usa `parseMoneyInput`, `aria-invalid`.
- **molecule** `StatCard` (título, `MoneyText signed` opcional, ícone, descrição). Reusa `Card` e `MoneyText`.
- **molecule** `BudgetCell`: mostra `MoneyText`; clique/Enter/F2 edita (`MoneyInput`), Enter confirma e desce, Tab vai à direita, Esc cancela; célula alterada com destaque; botão "⋯" (visível em hover/foco) e clique‑direito (`ContextMenu`) com: **Replicar para os meses seguintes** (até o fim da janela), **Replicar até dezembro**, **Zerar**.
- **organism** `BalanceSummary`: os 5 cards em grid responsivo (`sm:grid-cols-2 xl:grid-cols-5`). Receitas/despesas/saldo do mês calculados **ao vivo do rascunho** do mês atual; abertura vem do summary. Card de abertura tem ação "Ajustar saldo inicial" (`Dialog` + `MoneyInput`, permite negativo).
- **organism** `BudgetGrid`: `Table` com scroll horizontal, 1ª coluna sticky, mês atual destacado; ordem **Despesas** depois **Receitas** (expansíveis, `aria-expanded`, iniciam expandidos nos tipos); rodapé com **Saldo do mês** e **Saldo acumulado** por mês (negativo em vermelho).
- **organism** `SaveBar`: barra sticky no rodapé quando `dirtyCount > 0`: "N alterações não salvas" · Descartar · Salvar (spinner enquanto salva).
- Barrels `index.ts` atualizados.

## 6. Testes
**API**
- Unit: `balance.spec.ts`, `budget.service.spec.ts` (Prisma mockado: defaults idempotentes, 404 de categoria alheia, upsert/delete com 0, summary), `budget.controller.spec.ts`.
- E2E `test/budget.e2e-spec.ts`: 401 sem sessão; categorias padrão criadas uma vez só; PUT/GET entries (upsert, 0 apaga, janela); validação 400 (mês inválido, `from > to`, janela > 24, valor negativo/float, campo desconhecido, array vazio/grande); summary com meses anteriores + saldo inicial (negativo incluso); **usuário A não lê/grava categorias ou valores de B** (PUT com categoria de B → 404, GET não vaza).

**Web**
- Unit: `months.spec.ts`, `draft.spec.ts`, `rows.spec.ts`, `money.spec.ts` (`parseMoneyInput`), `StatCard`, `MoneyInput`.
- Fluxo `src/routes/_app/index.spec.tsx` (reescrito, `renderRoute('/')`, mock de `@/features/budget/api` + auth; `vi.setSystemTime` para fixar o mês): mostra 5 cards com valores; tabela com 12 meses a partir do atual; expandir/recolher; editar célula → cards e totais mudam ao vivo → Salvar envia só as alterações; Descartar volta; replicar pelo menu preenche os meses seguintes; Esc cancela; valor inválido não é aceito; erro ao salvar mostra alerta e mantém rascunho; ajustar saldo inicial; nav "Dashboard" ativo; manter os testes de logout/redirect existentes.

## 7. CI, README, CLAUDE.md
- CI: nada novo (o job `api` já faz `migrate deploy` + e2e; o `web` já cobre lint/test/build). Confirmar após a migration.
- README: linha **Dashboard (balanço + planilha mensal)** ✅/✅; "Categorias (edição)" API 🚧 (leitura + padrões) / Web ⏳; "Receitas e despesas pessoais" 🚧 com observação (valores mensais por categoria; lançamentos/realizado ⏳); mencionar layout fluido.
- CLAUDE.md: layout fluido, feature `budget` (formato `YYYY-MM`, rascunho/`draft.ts`, `parseMoneyInput`).

## Arquivos críticos
- API: `prisma/schema.prisma`, `src/budget/**`, `src/app.module.ts`, `test/utils.ts`, `test/budget.e2e-spec.ts`
- Web: `components/templates/AppLayout.tsx`, `lib/navigation.ts`, `lib/money.ts`, `routes/_app/index.tsx` + spec, `features/budget/**`, novos atoms/molecules/organisms, `components/ui/{table,dialog,context-menu}.tsx` (CLI)
- Reusar: `MoneyText`/`formatCents`, `Card`, `DropdownMenu`, `EmptyState`, `Spinner`, `FormAlert`, `renderRoute`, `createTestApp`/`resetDatabase`, `@CurrentUser()`

## Verificação
- API (`apps/api`): `prisma generate`, `pnpm lint && pnpm build && pnpm test`; `DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm test:e2e`.
- Web (`apps/web`): `pnpm generate:routes && pnpm lint && pnpm test && pnpm build`.
- Manual com `start:dev` nos dois apps: conteúdo ocupa a largura toda; editar células, replicar, salvar, recarregar e ver persistido; saldo inicial reflete nos cards e no acumulado; aviso ao sair com alterações pendentes; mobile com scroll horizontal da tabela.

## Ideias para próximas etapas (fora deste escopo)
- Previsto × realizado com lançamentos individuais; colar bloco de valores do Excel/Sheets; nota por célula; gráfico de projeção do saldo acumulado com alerta do primeiro mês negativo; navegar a janela (meses anteriores/próximos); integrar grupos (aluguel da república entrando como despesa pela sua parte do split).

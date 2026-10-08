# Ajustes: valor realizado no Planejamento + saldo inicial no Extrato

## Context

1. A tabela "Planejamento mensal" do dashboard só mostra `plannedCents`: o draft
   (`savedValues` em `apps/web/src/features/budget/draft.ts`) lê `c.plannedCents` de cada
   célula de `GET /budget/lines`, então realizar um lançamento com outro valor não muda a
   grade, os totais, as metas nem o saldo acumulado. O resumo (`summary`) já usa o valor
   efetivo (`realizedCents ?? plannedCents`); a grade tem de seguir a mesma regra.
2. O saldo inicial só pode ser ajustado no dashboard (lápis do card "Saldo de abertura",
   `BalanceSummary` → `InitialBalanceDialog`). O Extrato precisa de um botão para isso.

Primeiro passo da implementação: copiar este plano para `plans/` na raiz do projeto
(preferência registrada na memória).

## 1. Planejamento usa o valor efetivo

**Regra:** cada célula de lançamento mostra `realizedCents ?? plannedCents`. Uma célula
**realizada fica somente leitura** na grade (editar ali mudaria o previsto, que não
aparece mais): mostra o valor com um ✓/estilo de "realizado" e link para o Extrato do mês,
como já acontece na linha "Rateios de grupos". Para mudar o valor realizado, o usuário
usa o Extrato (ou desmarca a realização).

Web (`apps/web/src`):
- `features/budget/draft.ts`: `savedValues` passa a usar `c.realizedCents ?? c.plannedCents`;
  nova função `realizedKeys(lines)` (Set de `cellKey` das células com `realizedCents !== null`).
- `features/budget/hooks.ts` (`useBudgetDraft`): expõe `isRealized(anchorId, month)`.
  `value`/`savedValue` já ficam efetivos via `savedValues`, então `buildBudgetTable`,
  `buildGoalsOverview`, saldo acumulado e os cards do dashboard (delta `table − saved`)
  passam a refletir o realizado sem mais mudanças.
- `routes/_app/index.tsx`: `onFill` filtra os meses realizados
  (`months.filter((m) => m > start && m <= until && !draft.isRealized(anchorId, m))`) para
  "replicar" não sobrescrever um mês realizado; passa `isRealized` ao `BudgetGrid`; ajusta o
  texto do `CardDescription` (valores realizados aparecem marcados e são editados no Extrato).
- `components/organisms/BudgetGrid.tsx` (`lineRow`): se `isRealized(anchorId, month)`,
  renderiza `Link` para `/extrato?month=` com `MoneyText` + ícone ✓ (cor `--success`),
  `aria-label` "`<linha>` em `<mês>`, realizado, ver no extrato", em vez do `BudgetCell`;
  não consome índice de navegação de célula (Enter/Shift+Enter continuam pulando só
  células editáveis — conferir `row`/`col` em `data-cell`).
- `lineTarget` (`rows.ts`) não muda.

API (`apps/api`), para manter o contrato coerente com a grade e o resumo:
- `BudgetService.entries` (`src/budget/budget.service.ts:81`): `amountCents` vira a soma
  efetiva. Reaproveitar o padrão de `sumsByCategory` (dois `groupBy` por
  `month, categoryId`: realizados somando `realizedCents`, pendentes somando
  `plannedCents`, mais `_count`) e juntar por chave. Atualizar o JSDoc e o comentário de
  `MonthlyEntry.amountCents` no web (`features/budget/types.ts`).
- `PUT /budget/lines` continua escrevendo `plannedCents` (sem mudança).

## 2. Botão de saldo inicial no Extrato

- `features/budget/hooks.ts`: novo `useInitialBalance()` → `save(cents)` chama
  `updateInitialBalance` (`features/budget/api.ts:49`) e invalida
  `[...budgetQueries.all(), 'summary']` (o saldo de abertura de **todos** os meses muda;
  hoje o dashboard só invalida o mês atual). O dashboard (`saveInitialBalance` em
  `routes/_app/index.tsx:132`) passa a usá-lo.
- `routes/_app/extrato.tsx`: botão `variant="ghost"` "Saldo inicial" (ícone `WalletIcon`)
  ao lado de "Categorias", abrindo o `InitialBalanceDialog` (molecule existente) com
  `summary.initialBalanceCents` e `onSubmit={initialBalance.save}`; toast de sucesso igual
  ao padrão das outras ações.

## Testes

API:
- `test/budget.e2e-spec.ts` (bloco `entries`): lançamento realizado com valor diferente do
  previsto → `amountCents` = realizado; pendente continua com o previsto; mistura na mesma
  célula soma ambos.
- `src/budget/budget.service.spec.ts`: ajustar o mock de `transaction.groupBy` de `entries`.
- Conferir `test/group-budget.e2e-spec.ts` (usa `entries`) continua passando.

Web:
- `features/budget/draft.spec.ts`: `savedValues` usa o realizado; `realizedKeys`.
- `routes/_app/index.spec.tsx`: linha com célula realizada mostra o valor realizado, não
  tem campo editável (link para o extrato), totais da categoria/tipo/saldo usam o
  realizado; "replicar" a partir de um mês pendente não altera o mês realizado.
  Fixture: `makeLine` com `realizedCents` em `src/test/budget.ts`.
- `routes/_app/extrato.spec.tsx`: botão "Saldo inicial" abre o diálogo com o valor atual,
  salva chamando `updateInitialBalance` com centavos e o resumo é recarregado
  (`stubBudgetApi` já mocka `updateInitialBalance`).
- `routes/_app/index.spec.tsx`: fluxo existente do saldo inicial segue passando com o hook.

## Docs

- `README.md`: atualizar a tabela "Status dos recursos" (Planejamento usa o realizado;
  saldo inicial também no Extrato).
- `CLAUDE.md`: na seção Budget/dashboard, `savedValues` efetivo, células realizadas
  somente leitura e `useInitialBalance`; na API, `entries.amountCents` efetivo.
- CI: nenhuma etapa nova.

## Verificação

```bash
pnpm --filter api lint && pnpm --filter api test
cd apps/api && DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts \
  && DATABASE_URL=file:./test.db pnpm test:e2e
pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build
```

Manual: no Extrato, realizar um lançamento com valor diferente → dashboard mostra o
realizado marcado, totais/metas/saldo acompanham; no Extrato, "Saldo inicial" altera o
saldo de abertura do mês e do dashboard.

# Dashboard: aba "Análise" (gráfico de 12 meses + despesas por categoria) e filtro de período

## Context
O Dashboard hoje é uma página única (metas, saldo, grupos e a tabela de planejamento) com janela fixa de 12 meses a partir do mês atual. O usuário quer:
1. Uma nova aba com **gráfico de linhas** mês a mês: Total de despesas, Total de receitas, Saldo do mês e Saldo acumulado.
2. Uma **tabela de despesas por categoria**: à esquerda uma barra com o valor no mês de referência, à direita uma barra com o total do período e o **% de representação** no período.
3. **Filtro de período no topo**, valendo para todas as abas, padrão = mês atual + 11 à frente.

Decisões tomadas: padrão `currentMonth()` → `+11`; o "mês atual" da tabela é o **primeiro mês do filtro** (o mesmo mês de referência dos cards/metas da aba Planejamento); gráfico com o **Chart do shadcn + recharts**.

**Sem mudanças na API**: `GET /budget/entries?from&to` (até `MAX_MONTH_SPAN = 24` meses) já devolve por categoria/mês o valor efetivo (`amountCents` = realizado ?? previsto) e `groupCents` (rateios de grupos vinculados), e `GET /budget/summary?month=from` dá o `openingBalanceCents`. Tudo isso já é carregado pelo loader do Dashboard.

> **As implemented:** colors `--chart-income` (blue), `--chart-expense` (orange), `--chart-balance` (aqua), `--chart-accumulated` (yellow, dashed) from the reference categorical slots 1–4, all passing in both modes; two light-mode colors are under 3:1, so the chart's table is visible on **Ver tabela** (otherwise `sr-only`). Y axis uses the new `formatCentsCompact` (`src/lib/money.ts`). `login.spec.tsx` now redirects to `/?tab=analise` (the dashboard drops unknown tabs).

> **Superseded:** the two-select `MonthRangeFilter` became the calendar `MonthRangePicker` with a **Redefinir** button, see `plans/dashboard-filtro-calendario.md`.

---

## 1. Período (web)
- [months.ts](apps/web/src/features/budget/months.ts): `MAX_RANGE_MONTHS = 24` (espelha a API), `defaultRange(today?)` → `{ from: currentMonth(), to: +11 }`, `parseRange(search)` (ambos `YYYY-MM` válidos, `from <= to`, `monthSpan <= 24`; senão o padrão) e `monthsBetween(from, to)` (via `monthWindow` + `monthSpan`).
- Molecule `MonthRangeFilter` (`{ from, to, onChange }`): dois `NativeSelect` ("De" / "Até", rótulos `formatMonthLabel`); "De" oferece de −24 a +24 meses do atual, "Até" só `from..from+23`; ao mudar "De" para depois de "Até" (ou além de 24 meses), "Até" é ajustado. Botão "Próximos 12 meses" quando fora do padrão. `role="group" aria-label="Período"`.

## 2. Rota do Dashboard ([index.tsx](apps/web/src/routes/_app/index.tsx))
- `validateSearch`: `tab?: 'planejamento' | 'analise'` (padrão planejamento), `from?`, `to?` (via `parseRange`). `loaderDeps` = `{ from, to }` (trocar de aba não recarrega); o loader usa o intervalo no lugar de `monthWindow(currentMonth(), 12)`; `month` = `from`.
- Cabeçalho ("Dashboard", saudação) + `MonthRangeFilter` no topo + `Tabs` (Planejamento | Análise), aba no search param (padrão do `grupos/$groupId.tsx`).
- O corpo (rascunho `useBudgetPlan` + abas) vira um componente com `key={from:to}`: mudar o período remonta e descarta o rascunho; trocar de aba **mantém** o rascunho. O `TabsContent` do planejamento usa `forceMount` + `data-[state=inactive]:hidden` para não perder categorias expandidas.
- `useUnsavedChangesGuard(dirty, allow?)` ([hooks.ts](apps/web/src/features/budget/hooks.ts)): `shouldBlockFn({ current, next })` não bloqueia quando `allow` aceita; o Dashboard permite mesma rota com o mesmo `from`/`to` (troca de aba). Mudar o período com alterações pendentes continua pedindo confirmação.
- O texto "Este é o seu balanço de …" e o `GoalsPanel` já usam `month`/`months`, então seguem o filtro.

## 3. Cálculos puros — `features/budget/analytics.ts`
Valor efetivo de uma célula = `amountCents + groupCents` (igual ao resumo/grade). Só aritmética inteira; categorias inativas contam (histórico).
- `buildMonthlyTrend(groups, entries, months, openingCents)` → `{ month, incomeCents, expenseCents, balanceCents, accumulatedCents }[]`; `accumulatedCents` = saldo de abertura de `from` (`summary.openingBalanceCents`) + soma corrida dos saldos (bate com `closingBalanceCents` do resumo).
- `buildExpenseBreakdown(groups, entries, months)` → `{ rows: { categoryId, name, groupName, monthCents, periodCents, shareBasisPoints }[], monthTotalCents, periodTotalCents }`: só despesas, linhas com tudo zero omitidas, ordenadas por `periodCents` desc (empate por tipo/categoria); `%` em pontos-base via maior resto (somam 10000), formatado com `formatPercent` ([split.ts](apps/web/src/features/groups/split.ts) — mover para `src/lib` se a camada de imports pedir).

## 4. Componentes
- `pnpm dlx shadcn@latest add chart` → `ui/chart.tsx` + dependência `recharts`.
- Cores: os `--chart-1..5` atuais são cinzas. Definir tokens `--chart-income`, `--chart-expense`, `--chart-balance`, `--chart-accumulated` (claro/escuro em `index.css`) a partir da paleta categórica de referência do skill dataviz e **validar** com `validate_palette.js` nos dois modos (incluindo o par receita × despesa). Linhas 2px, legenda sempre visível; o Saldo acumulado tracejado como codificação secundária.
- Organism `MonthlyTrendChart` (`{ data }`): `ChartContainer` + `LineChart` (X = `formatMonthLabel`, Y em reais compactos, linha de referência no zero), `ChartTooltip` com `formatCents` dos 4 valores do mês, `ChartLegend`. Uma `<table className="sr-only">` com os mesmos números (acessibilidade e testes; o recharts não desenha no jsdom).
- Organism `ExpenseBreakdownTable` (`{ breakdown, monthLabel, periodLabel }`): `ui/table` com Categoria (tipo como subtítulo) | "{mês}" barra + valor | "{período}" barra + valor + %; barras = `div` com largura relativa ao maior valor da coluna (`role="img"` com `aria-label`), linha de Total. Vazio → `EmptyState`. Rola de lado no celular.
- Aba Análise: dois `Card`s (gráfico; despesas por categoria). Com rascunho pendente, aviso "A análise mostra apenas valores salvos".
- Exportar nos barrels `molecules/index.ts` e `organisms/index.ts`.

## 5. Testes
- `analytics.spec.ts`: somas por tipo com `groupCents`, saldo e acumulado a partir da abertura, meses sem dados = 0, inativas contam, receitas fora da tabela, ordenação, % somando 100%, total zero.
- `months.spec.ts`: `defaultRange`, `parseRange` (inválido, invertido, > 24 meses), `monthsBetween`.
- `src/test/setup.ts`: polyfill de `ResizeObserver` se faltar (recharts).
- Novo `routes/_app/index.analytics.spec.tsx` (com `stubBudgetApi`): abre na aba Planejamento; período padrão out/26–set/27 e `fetchEntries` chamado com ele; trocar o período refaz as consultas com o novo intervalo (e a grade mostra os novos meses); `?from&to` inválidos caem no padrão; aba Análise mostra a tabela do gráfico (receitas/despesas/saldo/acumulado) e as despesas por categoria com valores do mês, do período e %; trocar de aba com alterações pendentes **não** pede confirmação e mantém o rascunho; mudar o período com pendências pede confirmação; estado vazio.
- Rodar os specs existentes do Dashboard (`index*.spec.tsx`) — devem continuar passando sem mudar (aba padrão = Planejamento).

## 6. Documentação
- `README.md`: tabela "Status dos recursos" (aba Análise + filtro de período) e stack (recharts / shadcn Chart).
- `CLAUDE.md`: na seção Budget/dashboard, o search `?tab&from&to`, `analytics.ts`, os novos componentes e o guard com `allow`.
- CI: nada muda (sem migração, env ou app novo).
- Cópia deste plano em `plans/dashboard-analise.md`.

## Verificação
- `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
- `pnpm --filter api test` e `test:e2e` não são afetados (API intacta), mas rodar `test` para confirmar.
- Manual: `docker compose up -d`, `pnpm --filter api start:dev`, `pnpm --filter web start:dev`; abrir `/`, trocar de aba e de período, conferir no tooltip que o Saldo acumulado do último mês bate com o fechamento do resumo e que os % somam 100%; verificar tema escuro e largura de celular.

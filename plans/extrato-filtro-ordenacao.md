# Extrato: filtro "Somente pendentes" + ordenação multinível

## Context
A tela de extrato (`apps/web/src/routes/_app/extrato.tsx`) mostra Receitas/Despesas agrupadas por tipo, com os itens na ordem do servidor (vencimento efetivo = dia do meio de pagamento ou do lançamento; cotas de grupo vêm depois dos lançamentos). O usuário quer:
1. Um interruptor que esconde o que já foi pago/recebido, mostrando só o pendente.
2. Ordenação multinível escolhida pelo usuário: categoria, valor, pago/pendente, além das existentes ligadas à forma de pagamento (vencimento efetivo e o próprio meio de pagamento).

Decisões do usuário: a ordenação vale **dentro de cada tipo** (blocos e subtotais por tipo continuam); filtro e ordenação ficam **lembrados no navegador** (localStorage).

Tudo é client-side (os dados do mês já estão carregados); **nenhuma mudança na API**.

## Design

### Lógica pura — `src/features/transactions/statement.ts`
- `StatementShare` ganha `paymentMethod: { id; name } | null` (de `link.paymentMethod` do `GroupStatement`, só para cotas de despesa) em `linkedShares`.
- Novo `StatementItem = { kind: 'transaction'; transaction } | { kind: 'share'; share }`. `StatementGroup` troca `transactions`/`shares` por `items: StatementItem[]` (transações e depois cotas, como hoje). `section.transactions`/`section.shares` continuam (usados por `hasShares`).
- Novo módulo `src/features/transactions/view.ts` (puro):
  - `SortKey = 'dueDay' | 'paymentMethod' | 'category' | 'amount' | 'status'`, `SortLevel = { key; direction: 'asc' | 'desc' }`, `DEFAULT_SORT = [{ key: 'dueDay', direction: 'asc' }]` (= comportamento atual), `SORT_LABELS` em PT-BR (Vencimento, Forma de pagamento, Categoria, Valor, Situação).
  - Comparadores por chave: vencimento efetivo (`dueDay`, sem dia sempre por último); forma de pagamento (nome com `localeCompare('pt-BR')`, sem meio por último); categoria (posição na árvore via `categoryOrder: number[]` tirado de `budgetQueries.categories()`, fallback nome); valor (efetivo: `effectiveCents` / `shareCents`); situação (asc = pendentes primeiro; pago = `realizedCents !== null` / `item.paid`).
  - `compareItems(levels, categoryOrder)` encadeia os níveis; empate final = ordem original (sort estável → ordem do servidor).
  - `normalizeSort(raw)`: valida o que vem do localStorage (chaves conhecidas, sem repetição, direção válida; inválido → `DEFAULT_SORT`).
- (em `view.ts`) `viewStatement(statement, { pendingOnly, sort, categoryOrder })`: retorna nova `Statement` com cada grupo filtrado (pendentes = transação sem `realizedCents`, cota com `paid === false`) e ordenado; grupos vazios saem; o subtotal do tipo passa a ser a soma dos itens visíveis. **Totais das seções e o `StatementSummary` continuam calculados sobre o mês inteiro** (o resumo usa a `Statement` completa).

### Preferência — `src/features/transactions/preferences.ts`
- Hook `useStatementView()` → `{ pendingOnly, setPendingOnly, sort, setSort }`, estado React inicializado do localStorage (`budget:statement-view`), gravando a cada mudança; todo acesso em `try/catch` com fallback ao padrão.

### UI
- **Molecule `StatementToolbar`** (`components/molecules/`): `Switch` + `Label` "Somente pendentes" (mesmo padrão de `BudgetGridToolbar`) e botão outline "Ordenar" (ícone `ArrowUpDownIcon`) com o resumo da ordem atual (ex.: "Vencimento ↑, Valor ↓"), que abre o diálogo.
- **Molecule `StatementSortDialog`** (usa `FormDialogContent size="sm"`): lista de níveis ("1º", "2º"…), cada um com `NativeSelect` da chave (só chaves ainda não usadas + a própria), botão de direção (Crescente/Decrescente; para Situação os rótulos viram "Pendentes primeiro/Pagos primeiro"), mover acima/abaixo e remover (mínimo 1 nível); "Adicionar nível" (até 5); "Restaurar padrão"; Aplicar/Cancelar.
- **`StatementList`**: `StatementGroupList` renderiza `group.items` (switch em `kind` → `TransactionRow` / `ShareRow`). Nova prop `emptyLabel?` ou derivação: com filtro ativo, seção sem itens mostra "Nenhuma receita/despesa pendente neste mês." (recebe `pendingOnly`).
- **`extrato.tsx`**: monta `statement` (completo, para o resumo e para `hasShares`), `view = viewStatement(statement, …)` para a lista; `categoryOrder = groups.flatMap(g => g.categories.map(c => c.id))`; toolbar entre `StatementSummary` e a lista (só quando há lançamentos). Exportar as molecules no barrel `components/molecules/index.ts`.
- `PaymentMethodInvoice` não é afetado (usa `invoice.transactions`).

## Testes
- `src/features/transactions/view.spec.ts`: cada chave nas duas direções, nulos por último, multinível com desempate no 2º nível, estabilidade, `normalizeSort` com entradas inválidas.
- `statement.spec.ts`: ajustar para `group.items`; `viewStatement` (filtro pendentes inclui cota "a acertar", remove tipos vazios, subtotais visíveis, totais da seção intactos); `linkedShares` com `paymentMethod`.
- Novo `src/routes/_app/extrato.view.spec.tsx` (Vitest + Testing Library, `renderRoute('/extrato')`, mocks como em `extrato.spec.tsx`): ligar "Somente pendentes" esconde realizados e cotas pagas e mantém o resumo; mensagem de seção vazia; abrir "Ordenar", escolher Valor ↓ + Situação e verificar a ordem das linhas (`within(list).getAllByRole('listitem')`); remover/adicionar/restaurar nível; preferência persistida (re-render lê do localStorage; `localStorage.clear()` no `beforeEach`).
- Garantir que `extrato.spec.tsx`, `extrato.groups.spec.tsx`, `extrato.payment-methods.spec.tsx` continuam passando (ordem padrão inalterada).

## Docs
- `README.md` (PT-BR): atualizar a linha do Extrato na tabela "Status dos recursos".
- `CLAUDE.md`: na seção **Statement**, mencionar `viewStatement`/`view.ts`, `useStatementView` (localStorage) e as novas molecules.
- CI: sem mudanças (só web, coberto pelo job existente).

## Verificação
```bash
cd apps/web && pnpm lint && pnpm test && pnpm build
```
Manual: `pnpm --filter api start:dev` + `pnpm --filter web start:dev`, abrir `/extrato`, ligar o filtro, configurar 2–3 níveis de ordenação, trocar de mês e recarregar a página para confirmar que a preferência persiste.

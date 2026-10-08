# Extrato: layout limpo, agrupado por tipo e responsivo

## Context
A lógica do extrato (`/extrato`) está aprovada, mas o visual não: hoje são dois cards lado a lado (`xl:grid-cols-2`), cada linha repete "Categoria · Tipo", 5 StatCards empilham numa coluna enorme no celular e o menu "⋯" das linhas só aparece no hover (invisível no toque). Objetivo: Receitas em cima, Despesas embaixo, cada seção separada por **título do tipo** (CategoryGroup, ex. "Despesas Básicas") com subtotal, visual mais leve e bom uso em mobile. Decisão do usuário: agrupar por **tipo**, nas **duas** seções. Sem mudança na API.

## Mudanças

### 1. Modelo — `apps/web/src/features/transactions/statement.ts`
- Novo `StatementGroup { id, name, active, transactions, effectiveCents }`; `StatementSection` ganha `groups: StatementGroup[]` (mantém `transactions` e os totais atuais).
- `buildStatement(transactions, groupOrder: number[] = [])`: dentro de cada seção agrupa por `category.group.id`, mantendo a ordem do servidor (dia de vencimento) dentro do grupo; grupos ordenados pela posição do id em `groupOrder` (ordem da árvore/grade), desconhecidos ao fim por ordem de aparição. Subtotal efetivo em centavos inteiros (reusa `effectiveCents`).
- Página passa `groups.map((g) => g.id)` de `budgetQueries.categories()` (já carregado no loader de `extrato.tsx`).
- Atualizar `statement.spec.ts`: agrupamento, ordem pelo `groupOrder`, fallback sem ordem, subtotais.

### 2. Lista — `apps/web/src/components/organisms/StatementList.tsx`
- Uma coluna (`flex flex-col gap-8`), Receitas e depois Despesas. Cada seção: `<section role="region" aria-label="Receitas">` com cabeçalho leve (h2 + total efetivo à direita e linha muted "a realizar R$ X"), sem card pesado em volta.
- Cada tipo: título pequeno (`text-sm font-medium text-muted-foreground`, badge "Inativo" se inativo) + subtotal à direita, e um card arredondado (`rounded-xl border bg-card divide-y`) com `<ul aria-label={tipo}>` das linhas.
- Linha (`StatementRow`) mais limpa e touch-friendly:
  - Checkbox dentro de área de toque ≥ 40px (`<label>`/padding) — mantém `aria-label="Realizado: …"`.
  - Dia de vencimento como chip compacto (`10`, `sr-only` "Vence dia").
  - Título truncado + badge de recorrência `1/12`; sublinha só com o nome da categoria quando há descrição (o tipo já está no título do grupo).
  - Realizado: título com `text-muted-foreground`, valor realizado clicável (botão existente), "Previsto X" quando difere (âmbar mantido).
  - Valores `tabular-nums`, `shrink-0`; nada estoura a 360px.
- Seção vazia mantém "Nenhuma receita/despesa neste mês.".

### 3. Menu da linha no toque — `apps/web/src/components/molecules/RowActions.tsx`
- Adicionar `pointer-coarse:opacity-100` ao botão "⋯" (Tailwind v4) para ficar visível em telas touch; beneficia também a grade. Sem mudança de API do componente.

### 4. Resumo — `apps/web/src/components/organisms/StatementSummary.tsx`
- Trocar os 5 StatCards por um único card "Resumo do mês" compacto: **Saldo final** em destaque no topo (signed), e abaixo Abertura · Receitas · Despesas · Saldo do mês em `grid grid-cols-2 md:grid-cols-4` (cada item `role="group" aria-label` com o título atual, valor e, em Receitas/Despesas, "Realizado X · a realizar Y" em `text-xs`). No celular ocupa ~1/3 da altura atual.

### 5. Página — `apps/web/src/routes/_app/extrato.tsx`
- Cabeçalho responsivo: título + subtítulo; abaixo, `MonthSwitcher` centralizado/largura total no mobile (`justify-between`), e botões "Nova receita"/"Nova despesa" em `grid grid-cols-2` no mobile, `flex` a partir de `sm`.
- Passar `groupOrder` ao `buildStatement`.
- `MonthSwitcher` (`molecules/MonthSwitcher.tsx`): `min-w-40` → `flex-1 sm:flex-none sm:min-w-40` para caber no celular.

### 6. Testes, docs
- `apps/web/src/routes/_app/extrato.spec.tsx`: ajustar para a nova estrutura — regiões "Receitas"/"Despesas" continuam; checar listas por tipo (`getByRole('list', { name: 'Despesas Básicas' })`), subtotal do tipo, sublinha "Moradia" (antes "Moradia · Despesas Básicas"), itens do resumo via `getByRole('group', { name: 'Despesas do mês' })`. Adicionar caso com dois tipos de despesa (fixture extra em `src/test/transactions.ts`, ex. categoria de "Lazer" id 11 alinhada a `src/test/budget.ts`) verificando a ordem dos grupos conforme a árvore. Demais fluxos (realizar, editar, excluir, escopo de recorrência) devem passar sem mudança de lógica.
- `CLAUDE.md` (seção Statement): `buildStatement` agrupa por tipo na ordem da árvore. `README.md`: ajustar a linha do extrato no "Status dos recursos" se descrever o layout.

## Verificação
- `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
- Visual: `pnpm --filter api start:dev` + `pnpm --filter web start:dev`, abrir `/extrato` em desktop e em largura 360–390px (DevTools mobile): sem scroll horizontal, "⋯" visível no modo touch, checkbox fácil de tocar, Receitas acima de Despesas com títulos por tipo e subtotais.

# Dashboard: filtro de período com calendário de meses + botão Redefinir

## Context
A aba Análise e o filtro de período já estão implementados (plano anterior em `plans/dashboard-analise.md`). O filtro atual (`MonthRangeFilter`) usa dois `<select>` nativos com até 49 e 24 opções: abrem listas enormes, ruins de percorrer. O usuário pediu:
1. Trocar por uma seleção em **calendário**.
2. Um botão ao lado para **redefinir** o filtro.

Como o período é sempre de meses inteiros, o calendário é uma **grade de meses** (12 por ano), não de dias. Um calendário de dias (react-day-picker) obrigaria a escolher dias que seriam descartados.

---

## 1. Componente `MonthRangePicker` (molecule, substitui `MonthRangeFilter`)
- `pnpm dlx shadcn@latest add popover` → `ui/popover.tsx` (Radix, já incluso em `radix-ui`).
- **Gatilho**: `Button variant="outline"` com `CalendarIcon` + "out/26 – set/27" (`formatMonthLabel`), `aria-label="Período: outubro de 2026 a setembro de 2027"`. Largura do texto, sem lista gigante.
- **Popover** (`align="end"`, cabe no celular: `w-[min(100vw-2rem,34rem)]`):
  - Cabeçalho com ‹ › que avançam/voltam **um ano**; mostra **dois anos lado a lado** (`sm:grid-cols-2`; no celular, empilhados), porque o período padrão cruza a virada do ano. Abre nos anos de `from`.
  - Cada ano = grade 3×4 de botões curtos ("jan" … "dez", `aria-label` = `formatMonthLong`). Os meses do período ficam destacados (`bg-accent`), início e fim em `bg-primary` (`aria-pressed`); o mês atual tem um contorno.
  - **Seleção em dois cliques**: o 1º clique marca o início (texto de ajuda: "Escolha o último mês (até 24 meses)"); passar o mouse pré-visualiza a faixa; o 2º clique fecha a faixa (se for antes do início, os dois trocam de lugar), aplica `onChange` e fecha o popover. Enquanto se escolhe o fim, meses que passariam de `MAX_RANGE_MONTHS` ficam `disabled`. Fechar (Esc/clique fora) no meio da escolha descarta o pendente.
  - **Atalhos** no rodapé: "Próximos 12 meses" (`defaultRange()`), "Últimos 12 meses" (atual −11 → atual) e "Ano atual" (jan → dez); cada um aplica e fecha.
- Lógica pura em [months.ts](apps/web/src/features/budget/months.ts): `orderedRange(a, b)` (ordena dois meses) e `isWithinReach(start, month)` (`monthSpan` em ambos os sentidos ≤ 24), `yearMonths(year)`, `lastMonths(count)`, `yearRange(month)`.

## 2. Botão Redefinir
- Ao lado do gatilho, sempre visível: `Button variant="ghost" size="sm"` com `RotateCcwIcon` + "Redefinir" (no celular só o ícone, com `aria-label`), **desabilitado** quando o período já é o padrão. Volta a `defaultRange()`.
- Os dois ficam num `role="group" aria-label="Período"` no topo do Dashboard (mesmo lugar de hoje, em [index.tsx](apps/web/src/routes/_app/index.tsx): só troca o componente).

## 3. Limpeza
- Remover `MonthRangeFilter.tsx` e a exportação no barrel `molecules/index.ts`; exportar `MonthRangePicker`.

## 4. Testes
- `months.spec.ts`: `orderedRange`, `isWithinReach` (limite de 24, ambos os sentidos), `lastMonths`, `yearRange`.
- Novo `components/molecules/MonthRangePicker.spec.tsx`: mostra a faixa no gatilho; dois cliques aplicam (inclusive invertidos, que trocam de lugar); meses além de 24 ficam desabilitados após o 1º clique; navegação de ano; Esc descarta a seleção pendente sem chamar `onChange`; atalhos; Redefinir desabilitado no padrão e restaurando o padrão fora dele.
- [index.analytics.spec.tsx](apps/web/src/routes/_app/index.analytics.spec.tsx): trocar os helpers `startSelect`/`endSelect` por `pickPeriod(from, to)` (abre o popover e clica os dois meses pelo nome longo) e conferir o período pelo texto do gatilho; manter os casos (mudar período refaz consultas, encurtar, URL, fallback, confirmação com rascunho), e trocar "Próximos 12 meses" por **Redefinir**.

## 5. Documentação
- `README.md` (seção Dashboard → Período e abas) e `CLAUDE.md` (Budget/dashboard): `MonthRangePicker` com calendário de meses, atalhos e **Redefinir**.
- Atualizar `plans/dashboard-analise.md` com uma nota "Filtro com calendário" (ou salvar este plano como `plans/dashboard-filtro-calendario.md`).

## Verificação
- `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
- Manual (`pnpm --filter web start:dev` com a API): abrir o calendário, escolher uma faixa que cruze o ano, conferir o limite de 24 meses, os atalhos, Redefinir, tema escuro e largura de celular.

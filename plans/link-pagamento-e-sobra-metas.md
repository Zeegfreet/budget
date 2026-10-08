# Ajustes finais: link de pagamento + cartão "Sobra / Aporte" nas metas

## Context
1. O usuário quer guardar, em cada lançamento, um link para o boleto ou o portal onde paga a conta e abri-lo direto da lista. Isso vale para lançamentos pessoais e de grupo (ex.: boleto do aluguel da república).
2. No dashboard, o `GoalsPanel` usa uma grade `sm:grid-cols-2 xl:grid-cols-3`. Com duas metas sobra um espaço vazio. Decisão: incluir um cartão automático **"Sobra / Aporte"** (sem mudar o banco). A meta dele é 100% − a soma das metas, e o realizado é receitas − todas as despesas. A grade passa a se ajustar à quantidade de cartões.

## Parte 1: link de pagamento (`paymentUrl`)

### API
- **Schema** (`apps/api/prisma/schema.prisma`): `paymentUrl String?` em `Transaction` e em `GroupTransaction`. Migration `prisma migrate dev --name payment-url --config prisma7.config.ts`.
- **DTOs**: no create e no update, campo opcional `paymentUrl?: string | null` com `@Transform(trimToNull)`, `@IsUrl({ protocols: ['http','https'], require_protocol: true })` e `@MaxLength(2000)` (constante `MAX_PAYMENT_URL_LENGTH`). No update, `null` limpa o link. Assim, `javascript:` e textos que não são URL voltam 400. Os arquivos são:
  - `src/budget/dto/transaction.dto.ts` (Create/Update + `TransactionDto.paymentUrl`)
  - `src/groups/dto/group-transaction.dto.ts` (idem)
  - `src/budget/dto/group-statement.dto.ts` (item: `paymentUrl` do lançamento do grupo)
  - `src/payment-methods/dto/payment-method.dto.ts` (`InvoiceShare.paymentUrl`)
  - `src/budget/dto/budget-responses.dto.ts` (`BudgetLineDto.paymentUrl`, se o diálogo de edição da linha usar esse campo)
- **Services**: seguem o mesmo caminho do `dueDay`.
  - `src/budget/transaction.service.ts`: incluir no `transactionSelect`. No `create`, copiar para todas as ocorrências de `repeatMonths`. No `update`, entra no `data`, então `FOLLOWING` já propaga. No `setSeriesEnd`, a extensão copia o `template.paymentUrl`.
  - `src/budget/budget.service.ts`: em `saveLines`, a nova ocorrência copia o `paymentUrl` da âncora (select + create). Também entra no select de `lines`.
  - `src/groups/group-transaction.service.ts`: mesmo tratamento (select, create/repeat, update/FOLLOWING, extensão da série).
  - `src/budget/group-statement.service.ts` e `src/payment-methods/payment-method.service.ts` (shares da fatura): selecionar e expor `paymentUrl`.
- **Testes**:
  - Unit: ajustar os specs dos services que verificam `data`/select exatos.
  - E2E em `test/transactions.e2e-spec.ts`: criar com link; link inválido ou `javascript:` → 400; `null` limpa; `repeatMonths` copia; `FOLLOWING` propaga; extensão da série copia; o link aparece na fatura do meio de pagamento.
  - E2E em `test/group-transactions.e2e-spec.ts`: o equivalente no grupo, mais o link no `GET /budget/group-statements` (`test/group-budget.e2e-spec.ts`).
  - Isolamento: não muda, porque as rotas já existentes cobrem 404 entre usuários.

### Web
- **Types**: `paymentUrl: string | null` em `features/transactions/types.ts`, `features/groups/types.ts` (transação, `GroupStatementItem`), `features/payment-methods/types.ts` (`InvoiceShare`) e `features/budget/types.ts` (linha, se aplicável). Atualizar as fixtures `makeTransaction`, `makeGroupTransaction`, `makeStatementItem` e `makeInvoice`/shares (`src/test/*.ts`) com `paymentUrl: null`.
- **Validação**: `src/lib/payment-url.ts` com `parsePaymentUrl(text)` → `string | null | undefined` (inválido), compartilhado por pessoais e grupos. A função usa `new URL` e aceita só http/https. Se o usuário digitar `www.x.com`, prefixa `https://`. Tem unit spec.
- **Atom `PaymentLinkButton`** (`components/atoms/`): ícone `ExternalLinkIcon`, `<a href target="_blank" rel="noopener noreferrer" aria-label="Abrir link de pagamento: {título}">`, com tamanho de dedo como o `CheckButton`. É exportado no barrel.
- **Formulários**:
  - `TransactionFormDialog` e `GroupTransactionFormDialog` ganham o campo "Link do boleto / portal" (`type="url"`, `FormField`, erro local).
  - `TransactionDialogs`, `BudgetLineDialogs` e `GroupTransactionDialogs` enviam o link no create só quando preenchido e no edit só quando mudou (mesma regra do `dueDay`/`paymentMethodId`).
  - Mensagens da API em `features/transactions/errors.ts` e `features/groups/errors.ts` (`paymentUrl must be a URL address` → "Informe um link válido (http ou https)").
- **Listas**: mostrar o `PaymentLinkButton` quando houver link, ao lado dos valores. Ficam no `TransactionRow` (extrato + fatura), no `GroupTransactionList`, no `GroupStatementsCard` (itens do grupo no dashboard/extrato), no `StatementList` (shares de grupo, se renderizados à parte) e nas shares do `PaymentMethodInvoice`.
- **Specs**:
  - `extrato.spec.tsx`: criar com link (payload); link inválido mostra erro no campo; abrir o link (`href`/`target`); editar e limpar envia `null`.
  - `grupos/$groupId.spec.tsx` (ou um spec de lançamentos do grupo): o mesmo fluxo.
  - `index.groups.spec.tsx` / `meios-de-pagamento/$methodId.spec.tsx`: o link aparece no item da share.

## Parte 2: cartão "Sobra / Aporte" nas metas

- **`features/budget/goals.ts`**:
  - Novo `leftoverUsage(savedCents, incomeCents, targetPercent): GoalUsage`, com status invertido: `over` se a sobra < 0; `warning` se 0 ≤ sobra < meta (comparação exata em centavos: `saved*100 < income*target`); `ok` se atingir a meta. Sem receitas: `over` com sobra negativa, senão `ok`. `permille` é calculado como no `goalUsage` (pode ser negativo).
  - `GoalsOverview` ganha `leftover: { targetPercent, month, period }`, com `targetPercent = max(0, 100 − totalGoalPercent)`, `month` sobre `table.balances[0]` / `table.incomes[0]` e `period` sobre `table.balanceTotal` / `table.incomeTotal`. Esses valores já incluem as despesas sem meta e os rateios de grupo.
  - Specs em `goals.spec.ts`: meta atingida, abaixo, negativa, sem receitas e soma das metas ≥ 100 (meta 0).
- **`GoalMeter`** (molecule): nova prop opcional `mode: 'max' | 'min'` (padrão `max`). No `min`, o `aria-valuetext` vira "…, meta mínima X%". A barra é limitada a 0–100 (sobra negativa = barra vazia e texto vermelho). O valor é renderizado com `MoneyText`, que já mostra negativos.
- **`GoalsPanel`**:
  - Depois dos cartões das metas, um `<li aria-label="Sobra / Aporte">` com estilo de destaque (borda tracejada/`bg-muted/40`). Tem o título "Sobra / Aporte", "Meta mín. {target}%" e os dois `GoalMeter mode="min"` ("Mês atual" / "Período"), mais uma linha curta: "O que sobra das receitas para guardar ou investir".
  - A grade troca para `grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]`, então os cartões preenchem a linha qualquer que seja a quantidade.
  - O rodapé ganha "· sobra no mês: X".
  - Com nenhuma meta definida, continua o `EmptyState` atual (sem o cartão).
- **Specs** `routes/_app/index.goals.spec.tsx`: o cartão aparece com a meta 100 − soma e o meter com o `data-status` correto para sobra positiva acima da meta, abaixo da meta e negativa.

## README / CLAUDE.md / CI
- `README.md` (PT): na tabela "Status dos recursos", link de pagamento nos lançamentos (pessoais e de grupo) e cartão Sobra/Aporte nas metas.
- `CLAUDE.md`: mencionar `paymentUrl` nas seções Budget/Groups (API e web) e `leftover` em `goals.ts`.
- CI: nada novo (a migration roda via `prisma migrate deploy`, que já existe).

## Verificação
- `pnpm --filter api prisma generate --config prisma7.config.ts`, depois `pnpm --filter api lint && pnpm --filter api test`.
- `DATABASE_URL=file:./test.db pnpm --filter api prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm --filter api test:e2e`.
- `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
- Manual (skill `run`): criar um lançamento recorrente com link no extrato, abrir o link e estender a série; criar um lançamento de grupo com link e ver no dashboard; com duas metas, conferir o terceiro cartão Sobra/Aporte preenchendo a linha.

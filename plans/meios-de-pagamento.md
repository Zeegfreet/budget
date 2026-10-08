# Meios de pagamento (cartões, contas) com fatura e "pagar fatura"

## Context

Hoje um lançamento pessoal (`Transaction`) herda o vencimento da categoria (`Category.dueDay`). O usuário quer registrar em qual **meio de pagamento** a despesa é paga (ex.: "Cartão Americanas", vence todo dia 12): o meio padroniza o dia de vencimento dos lançamentos ligados a ele, e cada meio tem uma tela própria de extrato (fatura) que consolida suas contas.

Decisões tomadas com o usuário:
- **Fatura = mês do lançamento** (sem dia de fechamento/data de compra; o modelo mensal continua igual).
- **Tela do meio**: fatura do mês com previsto/realizado/pendente + botão **Pagar fatura** (realiza de uma vez os pendentes pelo valor previsto, com desfazer) + histórico de meses.
- **Escopo**: despesas pessoais **e a sua parte de despesas de grupos**. Receitas ficam de fora (meio de pagamento só em EXPENSE; API responde 400 em receita).
- **Atributos**: nome, tipo (`CREDIT_CARD` | `ACCOUNT` | `OTHER`), dia de vencimento opcional (1–31), `active`.

Regra de vencimento ("régua normal"): `dueDay efetivo = paymentMethod.dueDay ?? category.dueDay`.

## API (`apps/api`)

### Schema + migração (`prisma migrate dev --name payment_methods --config prisma7.config.ts`)
- `enum PaymentMethodType { CREDIT_CARD ACCOUNT OTHER }`
- `model PaymentMethod { id, userId (cascade), name, type, dueDay Int?, active Boolean @default(true), position Int @default(0), createdAt; transactions Transaction[]; groupMembers GroupMember[]; @@unique([userId, name]) }` + `User.paymentMethods`.
- `Transaction.paymentMethodId Int?` → `onDelete: SetNull` (excluir o meio devolve o vencimento da categoria; histórico preservado) + `@@index([paymentMethodId, month])`.
- `GroupMember.paymentMethodId Int?` (`SetNull`): o meio onde **as suas partes de despesas do grupo** caem — mesmo padrão do vínculo de categoria (`expenseCategoryId`), lido **em tempo de leitura**, nada copiado.

### Novo módulo `src/payment-methods/` (`nest g resource`, importa `PrismaModule`)
Tudo escopado por `@CurrentUser()`; meio de outro usuário → **404**.
- `payment-method-access.ts`: `assertUsablePaymentMethod(prisma, userId, id)` → 404 se não é do usuário, 400 se inativo (espelha `assertWritableCategories` em `src/budget/category-access.ts`). Reutilizado por `TransactionService` e `GroupService.setLink`.
- `PaymentMethodController` (`/payment-methods`):
  - `GET /payment-methods?month=YYYY-MM` → lista com `invoice` resumida do mês (`totalCents`, `realizedCents`, `pendingCents`, `count`) para a tela geral.
  - `POST`, `PATCH /:id`, `DELETE /:id` (409 em nome duplicado via `isUniqueViolation` de `src/prisma/errors.ts`; `active` editável no PATCH).
  - `GET /:id/invoice?month=` → `{ paymentMethod, month, dueDate (YYYY-MM-DD, dia limitado ao último dia do mês), transactions: TransactionDto[], shares: [{ group, transactionId, description, shareCents, paid, series }], plannedCents, realizedCents, pendingCents, effectiveCents }`. Shares = `GroupTransactionShare` com `member.userId = me`, `member.paymentMethodId = id`, `transaction.kind = EXPENSE`, `transaction.month = month` (ex-membros contam, como em `group-shares.ts`).
  - `GET /:id/invoices?from=&to=` (reusa `dto/month-range-query.dto.ts`) → totais por mês para o histórico.
  - `PUT /:id/invoice/:month/payment` → realiza todos os lançamentos pessoais **pendentes** do meio no mês com `realizedCents = plannedCents` (um `updateMany`); `DELETE` desfaz (limpa `realizedCents` de todos os lançamentos do meio no mês). Partes de grupo não mudam (o "pago" delas vem do grupo); aparecem como somente leitura.
- Lógica pura de totais em `invoice.ts` (soma inteira em centavos; effective = `realizedCents ?? plannedCents`; parte paga = realizada) + `dueDate`.

### Ajustes em `src/budget/`
- `dto/transaction.dto.ts`: `paymentMethodId?: number | null` em `CreateTransactionDto`/`UpdateTransactionDto` (`null` limpa); `TransactionDto` ganha `paymentMethod: { id, name, type, dueDay } | null` e `dueDay` (efetivo).
- `transaction.service.ts`: `transactionSelect` inclui `paymentMethod`; `create`/`update` validam com `assertUsablePaymentMethod` e rejeitam (400) meio em categoria INCOME (inclusive ao trocar a categoria de um lançamento com meio para receita); `FOLLOWING` propaga o meio junto com os outros campos (já acontece via `data`); `byStatementOrder` usa o vencimento efetivo; `present` calcula `dueDay`.
- `group-statement.service.ts` / `dto/group-statement.dto.ts`: `link.paymentMethod` (ref) e, nos itens de despesa, `paymentMethod` + `dueDay`.

### Ajustes em `src/groups/`
- `GroupLinkDto` ganha `paymentMethodId: number | null` (obrigatório como os outros dois, PUT substitui); `GroupService.setLink` valida com `assertUsablePaymentMethod` (só quando muda, como faz com categorias); `FinanceGroupDto.link` retorna o campo.

## Web (`apps/web`)

### Feature `src/features/payment-methods/`
`types.ts`, `api.ts`, `queries.ts` (chaves **sob `budgetQueries.all()`**: `[...budget, 'payment-methods', ...]`, para que qualquer mudança de lançamento/grupo já invalide as faturas), `hooks.ts` (`usePaymentMethodActions`: create/update/remove/pay/unpay, invalidam `budgetQueries.all()`), `errors.ts` (409 nome duplicado, 400 inativo), `invoice.ts` (rótulo do tipo, `formatDueDay`, data de vencimento).

### Rotas
- `src/routes/_app/meios-de-pagamento/index.tsx` (`?month=`): cards por meio (ícone por tipo, "vence dia 12", total/pendente da fatura do mês, inativos ocultos atrás de "Mostrar inativos"), `MonthSwitcher`, botão "Novo meio de pagamento", menu ⋯ (editar, inativar/reativar, excluir com `ConfirmDialog`), card leva ao detalhe.
- `src/routes/_app/meios-de-pagamento/$methodId.tsx` (`?month=`): cabeçalho com nome/tipo/vencimento, resumo (previsto, pago, pendente, vencimento em DD/MM), lista dos lançamentos (reusa linhas/ações do extrato: realizar, editar, excluir via `TransactionDialogs`) + partes de grupos somente leitura, botão **Pagar fatura** / **Desfazer pagamento** (com `ConfirmDialog`), histórico de 12 meses (lista compacta clicável que troca o `month`). 404 da API → `EmptyState` "Meio de pagamento não encontrado".
- `src/lib/navigation.ts`: item "Meios de pagamento" (`CreditCardIcon`).

### Componentes (respeitando as camadas)
- molecules: `PaymentMethodFormDialog` (nome, tipo `NativeSelect`, vencimento opcional), `PaymentMethodSelect` (select de meios ativos + "Nenhum", com dica "Vencimento: dia 12 pelo meio de pagamento").
- organisms: `PaymentMethodList`, `PaymentMethodInvoice` (resumo + lista + histórico), `PaymentMethodDialogs`.
- `TransactionFormDialog`: campo "Meio de pagamento" só para despesas (recebe `paymentMethods`); `TransactionFormValues.paymentMethodId`. `TransactionDialogs`/`extrato.tsx`/dashboard passam a carregar `paymentMethodQueries.list()`.
- `StatementList`: mostra o vencimento efetivo (`t.dueDay`) e um badge com o nome do meio (link para a fatura).
- `GroupLinkDialog` + `features/groups/link.ts` (`statementLink`) + `GroupLink` type: terceiro campo "Meio de pagamento das despesas".

## Testes (definição de pronto)

- **API unit**: `invoice.spec.ts` (totais, `dueDate` em fevereiro/dia 31), `payment-method.service.spec.ts`, `payment-method.controller.spec.ts`; atualizar `transaction.service.spec.ts` (meio inativo/alheio/receita, ordem por vencimento efetivo) e `group.service.spec.ts`/`group-statement.service.spec.ts`.
- **API e2e** `test/payment-methods.e2e-spec.ts`: CRUD + validações (campos desconhecidos, `dueDay` fora de 1–31, tipo inválido, nome duplicado 409), lançamento com meio (vencimento efetivo, recorrência + FOLLOWING, 400 em receita/inativo), fatura do mês com lançamentos + partes de grupo vinculadas, histórico, pagar/desfazer fatura, excluir meio → lançamentos voltam ao vencimento da categoria, **isolamento**: usuário B recebe 404 ao ler/editar/excluir/pagar o meio de A e 404 ao usar o meio de A num lançamento ou no vínculo de grupo. Atualizar `group-budget.e2e-spec.ts` para o novo campo do vínculo. Helper `createPaymentMethod` em `test/utils.ts`.
- **Web**: `src/test/payment-methods.ts` (`stubPaymentMethodsApi`, `makePaymentMethod`, `makeInvoice`); specs `meios-de-pagamento/index.spec.tsx` (lista, criar, editar, inativar, excluir, erro 409), `$methodId.spec.tsx` (fatura, pagar/desfazer, realizar item, partes de grupo, 404); `extrato.payment-methods.spec.tsx` (lançar despesa com meio, campo ausente em receita, badge e vencimento); atualizar `grupos/$groupId.link.spec.tsx` e `stubTransactionsApi`/`makeTransaction` (`paymentMethod: null`, `dueDay`). Specs que caem em `/` e `/extrato` passam a stubar a lista de meios.
- **CI**: nenhum passo novo (a migração entra no `prisma migrate deploy` existente) — conferir `.github/workflows/ci.yml`.
- **Docs**: README (tabela "Status dos recursos" + nova seção "Meios de pagamento" no sumário) e `CLAUDE.md` (arquitetura API/Web).

## Verificação

```bash
cd apps/api && pnpm prisma generate --config prisma7.config.ts && pnpm lint && pnpm build && pnpm test
DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm test:e2e
cd ../web && pnpm generate:routes && pnpm lint && pnpm test && pnpm build
```
Manual: subir API + web, criar "Cartão Americanas" (vence 12), lançar despesas recorrentes nele, vincular o meio a um grupo, abrir `/meios-de-pagamento/:id`, pagar a fatura e conferir extrato/dashboard atualizados.

# Grupos: recalcular rateios pendentes e confirmar recebimento das partes

## Context

Dois bugs nos grupos (o item "duplicação no extrato/dashboard" foi descartado: era um lançamento pessoal manual):

1. **Rateios pendentes desatualizados.** As partes (`GroupTransactionShare`) são um snapshot gravado na criação. Quando um membro entra/sai ou uma regra é editada, os lançamentos ainda não pagos continuam com as partes antigas (no `dev.db`, Felipe entrou depois do aluguel e os pendentes seguem só Wesley/Munique).
2. **Sem como registrar que os outros pagaram a parte deles.** Quando Wesley paga R$ 1.500 de aluguel, o saldo mostra Munique devendo, mas não há como marcar a parte dela como recebida.

Decisões do usuário:
- Recebimento **por parte**: só quem recebe o dinheiro confirma (despesa → quem pagou; receita → o dono da parte). Partes recebidas saem do saldo; para o devedor, a parte só fica "paga" no orçamento pessoal quando confirmada.
- Na **saída** de um membro, regras Percentual/Fixa ficam inativas (como hoje) e, nos pendentes, a parte de quem saiu é **redistribuída proporcionalmente** entre os demais participantes do item.
- Na **entrada**, o membro entra automaticamente nas regras **Igualitárias (também com participantes fixos) e de Pesos (peso 1)**; Percentual/Fixa não mudam.
- Entrada/saída recalcula pendentes **do mês atual em diante**; editar uma regra recalcula **todos** os pendentes dela.

## API (`apps/api`)

### Schema + migração
- `GroupTransactionShare.settledAt DateTime?` — quando quem recebe o dinheiro confirmou a parte. Migração `group-share-settlement` (`prisma migrate dev --config prisma7.config.ts`).

### Recalcular pendentes — novo `src/groups/resplit.ts`
- `split.ts`: extrair o núcleo do maior resto para `distribute(totalCents, weights)` (reusado por `computeShares`) e adicionar `redistribute(totalCents, shares, keepIds)` puro (proporcional às partes atuais, centavos exatos, empate → menor id; sem ninguém restante → `null`).
- `resplitPending(tx, groupId, { fromMonth?, splitMethodId? })`: carrega os lançamentos com `paidByMemberId: null` (filtro opcional de mês ≥ `fromMonth` e de regra), os membros ativos e as regras; para cada um:
  - regra existe, ativa e só com membros ativos → `computeShares` (FIXED: `amountCents` passa a ser o total da regra);
  - senão (regra apagada/inativa) → `redistribute` sem os ex-membros; se não sobrar ninguém, igualitário entre os ativos;
  - grava só se mudou (`deleteMany` + `createMany` das partes).
- Chamado dentro da mesma transação em:
  - `membership.ts` `endMembership` → após `adjustRules` (se o grupo não foi apagado), `fromMonth` = mês atual.
  - `invitation.service.ts` `join` (aceite e pré-cadastro): converter os `$transaction([...])` em transação interativa; após o upsert, novo `includeInRules(tx, groupId, memberId)` (em `membership.ts`) adiciona o membro às regras EQUAL **com** participantes e WEIGHT (valor 1) e reativa regra EQUAL/WEIGHT que estava inativa por ficar vazia; depois `resplitPending` com `fromMonth` = mês atual.
  - `split-method.service.ts` `update` quando muda `type`/`shares` → `resplitPending({ splitMethodId: id })` na mesma transação.
- Helper de mês atual: reutilizar o que existir em `src/budget/month.ts` (senão adicionar `currentMonth()` lá).

### Recebimento das partes
- `settlement.ts` `computeGroupBalance`: `SettlementTransaction.shares` ganha `settled: boolean`; parte confirmada não entra no `netCents` (nem débito do devedor, nem crédito correspondente do pagador). Nets continuam somando zero; `suggestTransfers` passa a refletir só o que falta.
- `GroupTransactionService`:
  - `balance()` passa `settled` e devolve também `settlements: [{ transactionId, description, kind, memberId, payerMemberId, amountCents, settled, canSettle }]` — partes de outros membros em itens já pagos do mês (`canSettle` = o usuário é quem recebe o dinheiro).
  - Novo `setSettlement(userId, groupId, { items: [{ transactionId, memberId }], settled })` (tudo ou nada): 404 item/parte fora do grupo; 400 item pendente ou parte do próprio pagador; **403** quando o usuário não é quem recebe (despesa: pagador; receita: dono da parte). Grava/limpa `settledAt`.
  - `setPayment`: trocar de pagador ou voltar a pendente com partes confirmadas → **409** (`Undo the confirmed shares first`); sem confirmações, segue como hoje.
  - `update`: recalcular partes (valor/regra) de item pago com partes confirmadas → **409** igual.
  - `groupTransactionSelect`/DTO: cada parte ganha `settled`.
- `group-transaction.controller.ts`: `POST /groups/:id/settlements` com DTO `SetSettlementDto` (`items` 1–100 `{ transactionId, memberId }`, `settled: boolean`), Swagger.

### Orçamento pessoal (partes do usuário)
- `group-statement.service.ts`: `paid` do item passa a ser **"minha parte está quitada"** = sou o pagador **ou** `settledAt` preenchido; novo `groupPaid` (alguém pagou no grupo). `netCents`/`transfers` vêm do balanço já ajustado. DTO atualizado.
- `payment-method.service.ts` (linhas ~122 e ~234): mesmo critério para `paid` das partes na fatura (precisa do `memberId` + `settledAt` na seleção).
- `group-shares.ts` não muda (soma valores, não status).

### Testes API
- Unit: `split.spec.ts` (`distribute`/`redistribute`), novo `resplit.spec.ts` (Prisma mockado: regra válida, FIXED muda valor, regra inativa → redistribui, ninguém sobra → igualitário, sem mudança não grava), `membership.spec.ts` (`includeInRules`, resplit na saída), `settlement.spec.ts` (partes confirmadas fora do net, soma zero), `group-transaction.service.spec.ts` (`setSettlement` 400/403/404, 409 em `setPayment`/`update`), `split-method.service.spec.ts`, `invitation.service.spec.ts`, `group-statement.service.spec.ts`, `controllers.spec.ts`.
- E2E: `group-transactions.e2e-spec.ts` — membro entra → pendentes do mês atual em diante incluem ele (pagos e meses passados não); membro sai com regra Pesos e com Percentual (redistribuição proporcional); editar regra recalcula todos os pendentes (FIXED altera o valor); fluxo de confirmação (pagador marca, devedor recebe 403, item pendente 400, outro grupo 404, trocar pagador 409, saldo/transfers zeram); receita (dono da parte confirma). `group-budget.e2e-spec.ts` — `paid` do item para o devedor só após confirmação; `payment-methods.e2e-spec.ts` — fatura idem.

## Web (`apps/web`)

- `features/groups/types.ts`: `MemberShare.settled`, `GroupBalance.settlements`, `SettlementItem`; `features/budget/types.ts`: `GroupStatementItem.groupPaid`; payment-methods types inalterados (só semântica).
- `features/groups/api.ts` `setSettlement(groupId, input)`; `hooks.ts`: `useGroupTransactionActions(id).setSettlement` (invalida `detail(id)` + `budgetQueries.all()`); corrigir invalidações que faltam: `useSplitMethodActions` e `removeMember` também invalidam `budgetQueries.all()` (agora mudam partes).
- Novo atom **`CheckButton`** (`components/atoms/CheckButton.tsx`, exportado no barrel): botão quadrado pequeno (`size-6`, cantos `rounded-md`, área de toque de 40px como a do `TransactionRow`) com ícone `CheckIcon`; desligado = borda verde e ✓ verde-claro sobre fundo transparente; ligado = **fundo verde sólido** com ✓ branco. `aria-pressed`, `aria-label` obrigatório, `disabled` mostra o estado sem permitir clique (cursor padrão, opacidade). Cor via novos tokens `--success`/`--success-foreground` em `src/index.css` (claro/escuro + `@theme inline`), sem tocar nos componentes `ui/`. Spec do atom (clique alterna `onPressedChange`, disabled não dispara).
- `GroupBalancePanel` (organism): nova seção **"Recebimentos"** abaixo do acerto, agrupada por devedor → credor ("Munique deve a você"), cada parte com um `CheckButton` "Recebido" (habilitado só com `canSettle`; clicar marca/desmarca) e botão "Marcar tudo como recebido"; partes confirmadas ficam com o botão verde e o texto esmaecido. Recebe `onSettle` da rota `grupos/$groupId.tsx`. Os checkboxes existentes (Realizado no extrato, regras de rateio) não mudam.
- `GroupTransactionList`: parte confirmada mostra ícone/tooltip "Recebido".
- `StatementList` `ShareRow`, `GroupStatementsCard` e `PaymentMethodInvoice`: estado em 3 níveis — pendente no grupo / "A acertar com {paidByName}" (`groupPaid && !paid`) / pago.
- `groupErrorMessage` (`errors.ts`): traduzir 403/409 novos.
- Fixtures em `src/test/groups.ts` e `src/test/budget.ts` (`settled`, `settlements`, `groupPaid`).
- Specs: `grupos/$groupId.spec.tsx` (aba balanço: marcar parte e marcar tudo chamam a API; checkbox desabilitado para quem não recebe; erro 409 ao trocar pagador), `$groupId.members.spec.tsx`/`$groupId.split.spec.tsx` (invalidam orçamento), `extrato.groups.spec.tsx` ("A acertar com Wesley"), `meios-de-pagamento/*.spec.tsx` se o texto da parte mudar.

### Diálogos com conteúdo vazando (revisar todos)
Causas encontradas:
- `DialogContent` (shadcn) é `grid` sem trilha definida e o `<form>` filho tem `min-width: auto`: textos sem quebra (prévia da divisão, nomes, opções longas de `NativeSelect`) alargam o diálogo além de `sm:max-w-sm` (384px) e o conteúdo sai da caixa.
- Só `GroupTransactionFormDialog` e `SplitMethodFormDialog` têm `max-h`/`overflow-y-auto`; os demais (ex.: `TransactionFormDialog` com recorrência + meio de pagamento, `GroupLinkDialog`, `InviteMemberDialog`) passam da altura da tela em celulares.
- Nos que rolam, o rodapé (`-mx-4 -mb-4`) rola junto e some.

Correção (sem editar `components/ui/`):
- Novo atom **`FormDialogContent`** (`components/atoms/FormDialogContent.tsx`) que envolve `DialogContent` com `grid-cols-[minmax(0,1fr)]`, `max-h-[calc(100dvh-2rem)] overflow-y-auto`, `[overflow-wrap:anywhere]` e rodapé fixo (`[&_[data-slot=dialog-footer]]:sticky bottom-0`), com prop `size` (`sm` = atual `sm:max-w-sm`, `md` = `sm:max-w-md` para formulários de lançamento, regra e vínculo).
- Trocar `DialogContent` por ele em todos os 14 diálogos de `components/molecules/*Dialog.tsx`; remover os `max-h`/`overflow` avulsos.
- `ConfirmDialog`/`RecurrenceScopeDialog` (AlertDialog): passar `className` com `max-h`/`overflow-y-auto`/`[overflow-wrap:anywhere]` (descrições com nomes longos).
- Ajustes pontuais: `NativeSelect`/inputs `w-full min-w-0`; prévia da divisão e listas de membros com `truncate`/quebra; linhas `flex` dos formulários com `flex-wrap` quando juntam campo fixo + texto.
- Spec do atom (aplica as classes e o `size`); specs existentes dos diálogos continuam passando.
- Verificação visual obrigatória (skill `run`): abrir cada diálogo a 375px e no desktop com nomes/descrições longos (ex.: membro "Maria Aparecida dos Santos Oliveira", regra com nome de 60 caracteres) e conferir que nada sai da caixa e o rodapé fica visível.

## Docs
- `CLAUDE.md`: seções Groups (API e Web) — recalcular pendentes, `includeInRules`, `settledAt`/`POST /settlements`, semântica nova de `paid`; atoms `CheckButton` e `FormDialogContent` (diálogos novos devem usá-lo).
- `README.md`: tabela "Status dos recursos" (recebimento de partes; recálculo de rateios).
- CI: só a nova migração (já coberta por `prisma migrate deploy`).
- Copiar este plano para `plans/group-resplit-and-settlement.md`.

## Verificação
1. `pnpm --filter api prisma generate --config prisma7.config.ts`, `pnpm --filter api lint`, `pnpm --filter api test`.
2. `DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm --filter api test:e2e`.
3. `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
4. Manual (dev): aplicar a migração no `dev.db`, editar a regra "Pesos" do grupo para incluir Felipe e ver os aluguéis pendentes recalculados; marcar no Balanço de outubro a parte da Munique como recebida e conferir o saldo zerado e o extrato da Munique com a parte paga.

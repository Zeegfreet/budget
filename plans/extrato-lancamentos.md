# Extrato mensal com lançamentos, realização e recorrência

## Context

O Dashboard tem um grid de planejamento que guarda **um valor por categoria/mês** (`MonthlyEntry`). Agora queremos uma tela **Extrato**: lista os lançamentos (receitas e despesas) de um mês, começando no mês atual e com navegação entre meses. Nela o usuário:
- marca um lançamento como realizado, informando outro valor quando o realizado for diferente do previsto;
- lança novas receitas/despesas, com a opção de repetir pelos próximos N meses;
- ao alterar ou excluir um lançamento recorrente, escolhe entre **"Só este" (manter os demais)** e **"Alterar/Excluir também os próximos"**.

Decisões do usuário:
1. **Lançamentos passam a ser a fonte dos dados.** `MonthlyEntry` vira `Transaction`, e pode haver vários lançamentos por categoria/mês. A célula do grid mostra a soma dos **previstos**.
2. **Os saldos usam o valor realizado quando houver** e o previsto nos demais casos.
3. **"Também os próximos"** atinge as ocorrências da série com mês ≥ ao do lançamento. Ocorrências anteriores e as já realizadas ficam preservadas.

## Modelo de dados (apps/api/prisma/schema.prisma)

Trocar `MonthlyEntry` por:

```prisma
/// One planned income/expense in a month (a "lançamento"). Several per category and month.
model Transaction {
  id            Int      @id @default(autoincrement())
  userId        Int      // denormalized owner, every query scoped by it
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId    Int
  category      Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  month         String   // YYYY-MM
  description   String?
  plannedCents  Int      // >= 0; sign comes from the category kind
  /// null = pending; set = realized with this amount (may differ from planned)
  realizedCents Int?
  /// Shared by the occurrences created by one recurring launch (uuid)
  seriesId      String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([userId, month])
  @@index([categoryId, month])
  @@index([seriesId])
}
```

Valor efetivo = `realizedCents ?? plannedCents`. Na migration, rodar `migrate dev --create-only --name transactions` e editar o SQL à mão: criar a tabela, fazer `INSERT INTO Transaction (userId, categoryId, month, plannedCents, createdAt, updatedAt) SELECT … FROM MonthlyEntry` e só então dar `DROP` na `MonthlyEntry`, para não perder dados. Trocar as relações `monthlyEntries` → `transactions` em `User` e `Category`.

## API (apps/api/src/budget/)

**month.ts**: adicionar `addMonths(month, n)` e `MAX_REPEAT_MONTHS = 60`.

**balance.ts / BudgetService.summary**: `sumsByCategory` passa a somar os valores efetivos. São dois `groupBy`: `realizedCents` onde não é null e `plannedCents` onde é null, depois mesclados. `computeSummary`/`sumByKind` não mudam.

**Grid (endpoints atuais, adaptados)**
- `GET /budget/entries`: agrega lançamentos por célula e retorna `{ categoryId, month, amountCents (soma dos previstos), count }`.
- `PUT /budget/entries` (mesmo DTO). Para cada célula: com 0 lançamentos, cria um (sem série); com 1, atualiza `plannedCents` (ou exclui se o valor for 0); com mais de 1, retorna **409** "Célula tem vários lançamentos; edite no Extrato". Continua tudo ou nada: 404 para categoria de outro usuário e 400 para categoria inativa.

**Novo `TransactionController` + `TransactionService`** (`transaction.controller.ts`, `transaction.service.ts`, `dto/…`), registrados no `BudgetModule`. O dono vem sempre de `@CurrentUser()`, e um lançamento de outro usuário retorna 404.

| Rota | Body/Query | Comportamento |
|---|---|---|
| `GET /budget/transactions?month=` | `MONTH_PATTERN` | Lançamentos do mês com `category {id,name,dueDay,active}` e `group {id,name,kind,active}`, mais `series: { index, count } \| null` (ex.: 3/12, calculado pela ordem de mês dentro da série). Ordem: tipo, dia de vencimento, posição, id. |
| `POST /budget/transactions` | `categoryId, month, description?, plannedCents (1..MAX_AMOUNT_CENTS), repeatMonths? (1..60, default 1)` | Cria um lançamento por mês, de `month` a `month+N-1`. Se N > 1, todos recebem o mesmo `seriesId` (uuid). Categoria inexistente ou de outro usuário: 404. Categoria ou tipo inativo: 400. Retorna a lista criada (201). |
| `PATCH /budget/transactions/:id` | `categoryId?, description? (null limpa), plannedCents?, scope? ('ONE' \| 'FOLLOWING', default ONE)` | Com ONE, altera só o lançamento. Com FOLLOWING, altera também os da mesma série com mês ≥ e `realizedCents = null`. Sem série, o scope é ignorado. Valida a categoria nova (404/400) e não deixa editar lançamento de categoria inativa (400). |
| `DELETE /budget/transactions/:id?scope=` | idem | Com ONE, exclui só este. Com FOLLOWING, exclui também os seguintes não realizados da série. Responde 204. |
| `PUT /budget/transactions/:id/realization` | `amountCents (0..MAX)` | Marca como realizado com esse valor (o front manda o previsto por padrão). Retorna o lançamento. |
| `DELETE /budget/transactions/:id/realization` | – | Volta para pendente. Responde 200 com o lançamento. |

Reutilizar `MAX_AMOUNT_CENTS` (`dto/save-entries.dto.ts`), `MONTH_PATTERN`, os helpers de validação de categoria (extrair de `saveEntries` um `assertWritableCategories(userId, ids)` usado pelos dois services) e `isUniqueViolation`, se for necessário. As operações em série rodam em `$transaction`. Todos os DTOs levam `@ApiProperty`.

## Web (apps/web/src/)

**Feature `features/transactions/`**
- `types.ts`: `Transaction`, `TransactionInput`, `TransactionPatch`, `RecurrenceScope = 'ONE' | 'FOLLOWING'`.
- `api.ts`: `fetchTransactions(month)`, `createTransaction`, `updateTransaction(id, patch, scope)`, `deleteTransaction(id, scope)`, `realizeTransaction(id, cents)`, `unrealizeTransaction(id)`.
- `queries.ts`: `transactionQueries.month(m)` com a key `[...budgetQueries.all(), 'transactions', m]`. Assim, invalidar `budgetQueries.all()` depois de qualquer mutação atualiza o extrato, o grid e o resumo de uma vez, nos dois sentidos.
- `statement.ts`: função pura `buildStatement(transactions)` que separa receitas e despesas e calcula os totais previsto, realizado, pendente e efetivo por seção, tudo em centavos inteiros.
- `hooks.ts`: `useTransactionActions()`, com mutações que invalidam `budgetQueries.all()`.

**Rota `routes/_app/extrato.tsx`**: `validateSearch` com `month` opcional (`MONTH_PATTERN`, default `currentMonth()`). O loader garante `transactionQueries.month`, `budgetQueries.categories()` (para o select de categoria) e `budgetQueries.summary(month)` (saldo inicial/final do mês). A página tem:
- cabeçalho "Extrato", o `MonthSwitcher` e os botões **Nova receita** e **Nova despesa**;
- `StatementSummary` com receitas e despesas (previsto × realizado), saldo inicial, saldo do mês e saldo final (vindos do summary);
- `StatementList` com uma seção por tipo. Cada linha mostra o dia de vencimento, a descrição (ou o nome da categoria) com o nome do tipo, o selo "3/12" quando é recorrente, o valor previsto e o realizado (destacado quando difere), o checkbox **Realizado** e um menu (Editar, Informar valor realizado, Excluir);
- estado vazio com um CTA para lançar.

O checkbox marca como realizado com o valor previsto (ou desmarca). Clicar no valor realizado, ou em "Informar valor realizado", abre o `RealizeDialog` com `MoneyInput`.

**Componentes (respeitando o atomic design)**
- molecules: `MonthSwitcher` (‹ mês por extenso › + "Mês atual"), `RealizeDialog`, `RecurrenceScopeDialog` (AlertDialog com "Só este (manter os demais)", "Também os próximos" e Cancelar; títulos e textos diferentes para alterar e excluir), `TransactionFormDialog`. O formulário tem a categoria (select filtrado por tipo e só com ativas, agrupado por tipo), descrição, valor previsto (`MoneyInput`), mês e, **só na criação**, o switch "Repetir" com "por N meses" (2–60, padrão 12) e uma prévia do tipo "out/26 a set/27". Reaproveitar `ConfirmDialog`, `RowActions`, `FormField` e `StatCard`.
- organisms: `StatementList`, `StatementSummary`, `TransactionDialogs` (no mesmo padrão de `BudgetDialogs`).
- Fluxo de editar e excluir: se `series` existe e `series.index < series.count`, abre o `RecurrenceScopeDialog` antes de chamar a API com o scope escolhido. Se não, faz o PATCH direto, ou usa o `ConfirmDialog` no caso da exclusão. Os erros aparecem em toast, usando a mensagem de `ApiError`.
- Se algum componente shadcn estiver faltando (alert-dialog, checkbox, select, switch, badge), adicionar com `pnpm dlx shadcn@latest add …`.

**Navegação**: adicionar `{ label: 'Extrato', to: '/extrato', icon: ReceiptTextIcon }` em `lib/navigation.ts`.

**Ajustes no Dashboard**
- `features/budget/types.ts`: `MonthlyEntry` ganha `count`. O `BudgetGrid`/`BudgetCell` deixam a célula com `count > 1` como só leitura, com tooltip "N lançamentos — edite no Extrato" e link para `/extrato?month=…`. O `fill` (replicar) do draft pula essas células.
- `BalanceSummary` passa a usar `summary.incomeCents` e `summary.expenseCents`, que são valores efetivos e por isso refletem o que já foi realizado. O grid, a linha de acumulado e as metas continuam no previsto, já que são planejamento.

## Testes (definition of done)

**API e2e: `test/transactions.e2e-spec.ts`**
- criar avulso e recorrente de 12 meses (meses, `seriesId`, `series.index/count`);
- validações: campo desconhecido, `plannedCents` 0 ou acima do máximo, `repeatMonths` 0 ou 61, mês inválido, scope inválido;
- categoria de outro usuário (404) e categoria inativa (400);
- `GET` por mês com escopo e ordenação;
- realizar e desfazer, com o summary refletindo o valor realizado;
- PATCH ONE × FOLLOWING (meses anteriores e realizados intactos);
- DELETE ONE × FOLLOWING;
- 404 cruzado (usuário A × B) em `GET/PATCH/DELETE/realization`.

**Atualizar `test/budget.e2e-spec.ts`**: `count` nas entries, PUT atualizando um lançamento único, 409 em célula com vários e summary com valores realizados.

**Unit**: `transaction.service.spec.ts`, `transaction.controller.spec.ts`, `month.spec.ts` (`addMonths`) e ajustes em `budget.service.spec.ts`.

**Web**
- `routes/_app/extrato.spec.tsx` com `vi.mock('@/features/transactions/api')` e `src/test/transactions.ts` (`stubTransactionsApi`, `makeTransaction`). Fluxos cobertos:
  - lista e totais do mês atual;
  - navegação ‹ › (search param e fetch do novo mês);
  - marcar realizado (API recebe o previsto) e informar outro valor;
  - nova despesa recorrente por 12 meses;
  - editar recorrente → "Também os próximos" → `FOLLOWING`;
  - excluir recorrente → "Só este" → `ONE`;
  - excluir avulso com confirmação simples;
  - erro da API vira toast.
- `statement.spec.ts`.
- Atualizar as specs do dashboard (célula bloqueada com `count > 1`, cards usando o summary) e `src/test/budget.ts` (`count`).

**CI/README/CLAUDE.md**
- O CI já roda `prisma migrate deploy` e todos os testes, então não precisa de step novo (conferir só isso).
- README: linha "Extrato (lançamentos, realização, recorrência)" em "Status dos recursos" e menção aos endpoints e à tela.
- CLAUDE.md: atualizar a descrição do Budget (de MonthlyEntry para Transaction, as regras de célula e de saldo efetivo) e a da Web (feature transactions, rota `/extrato`).

## Verificação

1. `pnpm --filter api prisma migrate dev --config prisma7.config.ts` sobre uma cópia do `dev.db` com dados, para conferir que as entries viraram lançamentos.
2. `pnpm --filter api lint && pnpm --filter api test && DATABASE_URL=file:./test.db pnpm --filter api test:e2e` (com `migrate deploy` antes) e `pnpm --filter api build`.
3. `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
4. Manual (skill `run`): subir a API e o web; no Extrato, lançar uma despesa recorrente de 12 meses, marcar como realizada com outro valor e conferir os cards do Dashboard; editar e excluir com "Só este" e com "Também os próximos" e navegar entre os meses; no grid, conferir a célula bloqueada quando há 2 lançamentos.

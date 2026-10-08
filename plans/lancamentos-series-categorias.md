# Lançamentos no Dashboard, intervalo de séries e categorias no extrato

## Context
1. **Dashboard:** descrição e dia de vencimento foram feitos na categoria, mas a ideia era outra: cada categoria (ex.: *Custos de Vida › Assinaturas*) deve poder ser expandida e mostrar os **lançamentos** como mais um nível da grade. Os valores manuais passam a ser digitados nesse nível, e o que for salvo vira transação, aparecendo no extrato. Decisões do usuário:
   - Uma linha por lançamento ou série. Uma série recorrente ocupa uma única linha ao longo dos meses.
   - Descrição e vencimento **saem da categoria** e passam a ser do lançamento.
   - A barra **Salvar/Descartar continua** como hoje.
2. **Séries:** o badge `3/12` no extrato e nos grupos passa a ser clicável e abre um diálogo para **estender ou encurtar** a série, mudando o mês final.
3. **Extrato:** ganha um menu para incluir, excluir e inativar tipos e categorias, sem precisar ir ao Dashboard.

## API (`apps/api`)

### Migração `transaction_due_day`
- Adiciona `Transaction.dueDay Int?`.
- Copia para ele `Category.dueDay` em todas as transações já existentes (`UPDATE … SET dueDay = (SELECT dueDay FROM Category …)`).
- Remove `Category.description` e `Category.dueDay`.
- Depois, rodar `prisma generate`.

### Categorias
- `dto/category.dto.ts`: remove `description`/`dueDay` de Create/Update.
- Remove os mesmos campos de `CategoryDto` (`dto/budget-responses.dto.ts`) e dos selects e respostas de `category.service.ts`/`budget.service.ts`.
- Remove também `category.dueDay` do `TransactionDto.category`.

### Transações (`transaction.service.ts`, `dto/transaction.dto.ts`)
- `CreateTransactionDto.dueDay?` aceita 1–31 e é repetido em toda a série.
- `UpdateTransactionDto.dueDay?` aceita `null` (limpa) e é propagado por `FOLLOWING`.
- Vencimento efetivo: `effectiveDueDay = paymentMethod?.dueDay ?? t.dueDay`. Ele continua ordenando o extrato.
- `SeriesPositionDto` ganha `firstMonth` e `lastMonth`, usados pelo diálogo de intervalo. Hoje há três cópias de `present`/`seriesPositions` (pessoal, grupo e `group-statement.service.ts`), e as três precisam dos dois campos.
- **Novo** `PUT /budget/transactions/:id/series` com corpo `{ untilMonth }`:
  - O dono é verificado por `userId`; 404 se a transação não for do usuário.
  - `untilMonth` deve ser ≥ ao mês da primeira ocorrência. O intervalo total não pode passar de `MAX_REPEAT_MONTHS` (60), senão 400.
  - **Estender:** cria uma ocorrência por mês, de `lastMonth + 1` até `untilMonth`, copiando da última ocorrência a categoria, a descrição, `plannedCents`, `dueDay` e o meio de pagamento. As novas ficam pendentes.
    - Se a transação ainda não tinha série, gera um `seriesId` e o aplica a ela também.
    - Retorna 400 se a categoria estiver inativa, usando `assertWritableCategories`.
  - **Encurtar:** apaga as ocorrências **pendentes** com `month > untilMonth`. Se alguma delas já estiver realizada, retorna 409 e não altera nada.
  - Retorna a lista de `TransactionDto` da série.

### Grupos (`group-transaction.service.ts`)
- **Novo** `PUT /groups/:groupId/transactions/:id/series` com `{ untilMonth }`, passando por `assertMember` (404).
- **Estender:** copia a última ocorrência com o snapshot das `shares` e `paidByMemberId: null`.
- **Encurtar:** apaga as ocorrências não pagas depois de `untilMonth`. Se alguma delas já estiver paga, retorna 409.

### Linhas de lançamento no Dashboard (`budget.service.ts`, `budget.controller.ts`)
**Novo `GET /budget/lines?from=&to=`** (mesmo limite de 24 meses de `entries`):
- Agrupa as transações do usuário na janela por `seriesId`; uma transação sem série vira uma linha sozinha.
- Cada linha traz `{ anchorId, categoryId, description, dueDay, paymentMethod, cells: [{ month, transactionId, plannedCents, realizedCents }] }`, em que `anchorId` é a menor id da série.
- As linhas vêm ordenadas por categoria, vencimento efetivo e descrição.

**`PUT /budget/entries` é substituído por `PUT /budget/lines`** com corpo `{ cells: [{ anchorId, month, amountCents }] }` (1–1000 itens):
- A âncora precisa ser do usuário, senão 404.
- Se a linha já tem transação naquele mês: `amountCents` > 0 atualiza `plannedCents`, e 0 apaga a transação.
- Se a linha não tem transação naquele mês e `amountCents` > 0, cria uma copiando os campos da âncora e entrando na série. Se a âncora não tinha `seriesId`, gera um.
- Criar ou atualizar em categoria inativa dá 400; apagar continua permitido.
- Tudo roda num único `$transaction`.
- A lógica de 409 para célula com várias transações sai junto com o endpoint antigo.

`GET /budget/entries` continua alimentando os totais por categoria e o `groupCents`.

## Web (`apps/web`)

### Dashboard
- **`features/budget`:**
  - `types.ts` ganha `BudgetLine`.
  - `api.ts`: `fetchLines` e `saveLines`; sai `saveEntries`.
  - `queries.ts`: `budgetQueries.lines(from, to)`, guardado sob `all()`.
- **`draft.ts`:**
  - A chave das células passa a ser `anchorId:month`, e `changedEntries` vira `changedCells` → `{ anchorId, month, amountCents }`.
  - A ação `forget` passa a receber as âncoras das categorias que foram inativadas ou excluídas.
- **`rows.ts` (`buildBudgetTable`):**
  - `CategoryRow` perde `description`/`dueDay` e ganha `lines: LineRow[]`, com id, descrição, vencimento, valores e total de cada linha.
  - O valor da categoria é a soma das linhas, já com o rascunho, mais `groupCents`.
- **`useBudgetDraft`:** opera sobre as linhas. `isLocked` e `hasGroupShare` deixam de valer por categoria.
- **`BudgetGrid`:**
  - As categorias passam a ter `ToggleLabel`, **recolhidas por padrão**, com um conjunto `expanded` de chaves `category:id`.
  - A linha da categoria vira só total (`MoneyText`).
  - Quando há rateio de grupo, aparece uma sublinha somente leitura "Rateios de grupos" com link para o extrato.
  - Cada linha de lançamento usa `BudgetCell` com Enter e os menus de replicar já existentes. O rótulo mostra a descrição e a tag "Vence dia X".
  - O menu da linha tem Editar, Excluir e Ver no extrato.
  - No fim de cada categoria ativa e expandida há uma linha "+ Novo lançamento".
  - O menu da categoria ganha "Novo lançamento".
- **`index.tsx`:**
  - "+ Novo lançamento" abre o `TransactionFormDialog` já existente, com a categoria e o mês atual pré-preenchidos, e cria a transação na hora via `useTransactionActions().create`.
  - **Editar linha** chama `update` na primeira ocorrência pendente da janela com `scope: 'FOLLOWING'`.
  - **Excluir linha** chama `remove` na primeira ocorrência da janela com `scope: 'FOLLOWING'`, depois de um `ConfirmDialog`.
  - O guard de "não salvo" continua como está.
- **`CategoryFormDialog` / `BudgetDialogs`:** perdem os campos de descrição e vencimento.
- **`TransactionFormDialog`:** ganha o campo "Dia de vencimento (opcional)", com o mesmo `parseWhole` de 1 a 31.
- **`TransactionDialogs`:**
  - Na criação, envia `dueDay` só se estiver preenchido.
  - Na edição, envia `dueDay` só se mudou, seguindo o padrão de `paymentMethodId`.

### Intervalo da série (extrato e grupos)
- **Nova molécula `SeriesBadge`:** um botão com `RepeatIcon` e o texto `index/count`. Substitui o badge em `TransactionRow` e `GroupTransactionList`. O `ShareRow` do extrato continua somente leitura.
- **Nova molécula `SeriesRangeDialog`:**
  - Mostra "Parcela X de N · de <firstMonth> até <lastMonth>".
  - Tem um seletor do mês final com botões −/+ e mostra a nova quantidade de parcelas.
  - Avisa quando o encurtamento vai remover parcelas e traduz o 409 em "Há parcelas realizadas/pagas depois desse mês".
- **Ações:** `TransactionRowAction` e `GroupTransactionAction` ganham `'series'`. Os unions de `TransactionDialogs` e `GroupTransactionDialogs` ganham `{ type: 'series'; transaction }`.
- **API e hooks:**
  - Novas chamadas `setTransactionSeriesEnd` e `setGroupTransactionSeriesEnd`.
  - `useTransactionActions().setSeriesEnd` invalida `budgetQueries.all()`.
  - `useGroupTransactionActions(id).setSeriesEnd` invalida `detail(id)` e `budgetQueries.all()`.
- **Tipos:** `series` ganha `firstMonth`/`lastMonth` nos `types.ts` de transactions e de groups.

### Menu de categorias no extrato
- **Nova organism `CategoryManager`:** um `Sheet` aberto pelo botão "Categorias" no topo de `extrato.tsx`.
  - Lista os tipos e categorias de `budgetQueries.categories()`, incluindo os inativos, com uma tag "Inativo".
  - Usa `RowActions` para Nova categoria, Editar, Inativar/Reativar e Excluir. Há também um botão "Novo tipo" para receita ou despesa.
- **Reuso:**
  - `BudgetDialogs` passa a aceitar tipos mínimos: `Pick` de `GroupRow`/`CategoryRow` com `id`, `kind`, `name`, `goalPercent`, `active` e `categories[].id`.
  - A lógica de alternar ativo sai de `index.tsx` para um helper `useCategoryToggle` em `features/budget/hooks.ts`, usado pelas duas telas. No extrato, `forget` é uma função vazia.
- **`TransactionFormDialog`:** a mensagem "Crie uma no Dashboard" passa a apontar para o menu Categorias.

## Testes (definição de pronto)
- **API e2e:**
  - `budget.e2e-spec.ts`: `GET/PUT /budget/lines`. Cobre criar célula numa série, atualizar, zerar (apaga), linha avulsa virando série, 400 em categoria inativa, 400 na validação, 404 com a âncora de outro usuário e o limite de 1000 itens.
  - `categories.e2e-spec.ts`: sem descrição/vencimento, e campo extra agora dá 400.
  - `transactions.e2e-spec.ts`: `dueDay` na criação e na edição com `FOLLOWING`; `PUT :id/series` estendendo, encurtando, 409 quando há realizada, 400 por limite ou mês inválido, e 404 entre usuários.
  - `group-transactions.e2e-spec.ts`: o equivalente para grupos, incluindo 404 para quem não é membro.
  - `payment-methods.e2e-spec.ts`: vencimento efetivo.
- **API unit:** specs dos serviços (`budget`, `transaction`, `group-transaction`, `category`), substituindo os testes do 409 antigo.
- **Web:**
  - `index.spec.tsx`: expandir categoria, editar e salvar linha (payload de `saveLines`), replicar numa linha e "+ Novo lançamento".
  - `index.categories.spec.tsx`: sem descrição/vencimento.
  - `index.groups.spec.tsx`: sublinha de rateio.
  - `extrato.spec.tsx`: vencimento no formulário, diálogo de série e menu Categorias.
  - `grupos/$groupId.spec.tsx`: diálogo de série.
  - Specs unitárias de `draft`/`rows`.
  - Fixtures em `src/test/budget.ts` (`makeLine`, `stubBudgetApi({ lines })`), `transactions.ts` e `groups.ts`.
- **CI:** o job já roda `prisma migrate deploy`; não deve precisar de nada novo além disso.
- **Docs:** atualizar a tabela "Status dos recursos" do `README.md` e as seções de Budget, Groups e Web do `CLAUDE.md` (lines, `dueDay` no lançamento, endpoint de série, menu Categorias).

## Verificação
- `pnpm --filter api prisma migrate dev --name transaction_due_day --config prisma7.config.ts`, depois `pnpm --filter api lint && pnpm --filter api test && DATABASE_URL=file:./test.db pnpm --filter api test:e2e` (com `migrate deploy` no test.db).
- `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
- Teste manual com `start:dev` nos dois apps:
  - Expandir *Assinaturas*, digitar numa linha, salvar e conferir no extrato.
  - Estender e encurtar uma série pelo badge, no extrato e num grupo.
  - Inativar uma categoria pelo menu do extrato.

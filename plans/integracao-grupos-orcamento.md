# Integração dos grupos financeiros com o Extrato e o Dashboard

## Contexto

As finanças dos grupos (`src/groups/`) ainda não aparecem no orçamento pessoal. Esta entrega:
1. Mostra no Extrato e no Dashboard o extrato final de cada grupo no mês: a parte do usuário, o que ele pagou ou recebeu, o saldo dele e as transferências.
2. Permite levar a parte já rateada do usuário para uma **categoria pessoal**, alterando o balanço dele.

Decisões tomadas com o usuário:
- **Vínculo por grupo**: cada membro escolhe uma categoria de despesa e uma de receita para cada grupo. Sem vínculo, nada entra no orçamento pessoal.
- **Só a parte do usuário** conta no balanço, não importa quem pagou. O saldo e as transferências aparecem só no extrato do grupo.
- **Grade**: a célula mostra o valor pessoal + a parte no grupo e fica somente leitura (reaproveita `isLocked`).

A parte do usuário é **calculada na leitura** a partir de `GroupTransactionShare`, sem copiar para `Transaction`. Assim nada precisa ser sincronizado quando valor, regra ou pagamento mudam.

## API (`apps/api`)

### Schema e migration
- `GroupMember`: `expenseCategoryId Int?` e `incomeCategoryId Int?` → `Category` (`onDelete: SetNull`, relações nomeadas `MemberExpenseCategory`/`MemberIncomeCategory`), com as relações inversas em `Category`.
- `prisma migrate dev --name group_category_link --config prisma7.config.ts`.

### Endpoint de vínculo (módulo groups)
- `PUT /groups/:groupId/link`, corpo `GroupLinkDto { expenseCategoryId: number|null; incomeCategoryId: number|null }`.
  - Passa por `assertMember` (404 para quem não é membro).
  - As categorias são validadas com `assertWritableCategories` (`budget/category-access.ts`: 404 se não for do usuário, 400 se inativa). Manter uma categoria já vinculada que depois foi inativada é permitido. Também verifica o tipo: a de despesa precisa ser EXPENSE e a de receita INCOME, senão 400.
  - Grava só no `GroupMember` de quem chamou, nunca num id vindo do corpo.
- `GET /groups/:groupId` passa a devolver `link: { expenseCategoryId, incomeCategoryId }` do membro atual.
- Teste unitário do vínculo.

### Leitura das partes (`budget/group-shares.ts`)
- `groupShares(prisma, userId, filtroDeMês)` lê `groupTransactionShare` com `member.userId = userId`, incluindo participações ativas **e encerradas**, para que sair do grupo não reescreva o histórico. A categoria de cada parte é `expenseCategoryId` ou `incomeCategoryId`, conforme o tipo do lançamento (`null` = não conta).
- `shareCellSums(rows)` (função pura) devolve `{categoryId, month, amountCents}[]` só das partes vinculadas. Teste unitário.

### Orçamento (`budget.service.ts`)
- `entries()`: soma as partes por célula no novo campo `groupCents` (0 se não houver). Células só com partes vêm com `amountCents: 0, count: 0`.
- `summary()`: inclui as partes nas somas de `previous`/`current` antes de `sumByKind`.
- `saveEntries()`: fica como está. A grade já trava as células com parte de grupo.

### Extrato pessoal dos grupos
- `GET /budget/group-statements?month=YYYY-MM` (`/budget/groups` já é usado pelos tipos de categoria) devolve um item por grupo do usuário:
  - grupo, vínculo (categorias com id e nome), parte, pago, recebido, saldo, pendente e transferências que envolvem o usuário;
  - itens com a parte do usuário em cada lançamento: descrição, parte, total, pago/pendente, quem pagou, série e categoria vinculada.
- Grupos de que o usuário saiu, mas que têm partes vinculadas, vêm com `active: false`. Assim a lista do Extrato bate com o resumo.
- Reaproveita `computeGroupBalance`/`suggestTransfers` (`groups/settlement.ts`) e `activeMembers` (`groups/group-access.ts`). É um novo `GroupStatementService` com controller em `budget/`.

### Testes da API
- Unitários: `group-shares`, o serviço e o controller do novo endpoint, `budget.service` (entries e summary com partes) e o vínculo.
- E2E em `test/group-budget.e2e-spec.ts`:
  - vínculo válido; tipo errado (400), categoria de outro usuário (404), categoria inativa (400), quem não é membro (404), campo desconhecido (400);
  - despesa de 3000 rateada igualmente entre 2 → `groupCents: 1500` na categoria e +1500 no resumo de cada um; sem vínculo, nada muda;
  - pagar, editar ou excluir o lançamento do grupo aparece na hora; excluir a categoria pessoal anula o vínculo;
  - sair do grupo mantém as partes passadas no resumo;
  - isolamento: o usuário B nunca vê as partes ou os vínculos do usuário A.

## Web (`apps/web`)

### Tipos, API e queries
- `MonthlyEntry.groupCents?`, `FinanceGroup.link` e `setGroupLink` com a ação `setLink` em `useGroupActions`, que invalida o grupo e `budgetQueries.all()`.
- `budgetQueries.groupStatements(month)`, com chave sob `budgetQueries.all()`, e `fetchGroupStatements`.
- As mutações de lançamentos de grupo também invalidam `budgetQueries.all()`.

### Dashboard
- `useBudgetDraft`: as células com `groupCents > 0` ficam travadas e o valor exibido soma a parte. O save continua enviando só a parte pessoal.
- `BudgetGrid`: a célula com parte de grupo ganha a dica "Inclui sua parte em grupos — ver no Extrato".
- Novo organismo `GroupStatementsCard`, com sua parte, quanto você pagou, a receber ou a pagar, a categoria vinculada (ou o botão "Vincular categoria") e um link para o grupo.

### Extrato
- O loader também carrega `budgetQueries.groupStatements(month)`.
- `buildStatement` recebe as partes vinculadas e as coloca no tipo da categoria: paga = realizada, pendente = prevista. Os totais passam a incluí-las.
- `StatementList`: as linhas de grupo são somente leitura, com o nome do grupo e o menu "Abrir no grupo".
- `GroupStatementsCard` vai abaixo do resumo, com o detalhe de cada grupo.

### Diálogo de vínculo
- `GroupLinkDialog` (em `GroupDialogs`) com dois selects de categorias ativas e a opção "Não vincular". Abre pela página do grupo ("Vincular ao orçamento") e pelo card.

### Testes web
- `draft`/hooks: célula travada e valor com a parte somada.
- `statement.spec.ts`: partes de grupo nos totais.
- Rotas:
  - `index.spec.tsx`: card de grupos e célula travada;
  - `extrato.groups.spec.tsx`: lista de partes;
  - `$groupId.spec.tsx`: diálogo de vínculo.
- Fixtures em `src/test/budget.ts`.

## CI e documentação
- CI: nenhum passo novo; a migration já roda em `prisma migrate deploy`.
- `README.md`: nova linha em "Status dos recursos" e a explicação do vínculo e da regra do balanço.
- `CLAUDE.md`: seções Budget, Groups e Statement atualizadas.

## Verificação
- API:
  - gerar o client: `pnpm --filter api prisma generate --config prisma7.config.ts`;
  - lint e testes unitários: `pnpm --filter api lint && pnpm --filter api test`;
  - e2e: `DATABASE_URL=file:./test.db pnpm --filter api test:e2e`, depois do `migrate deploy`.
- Web: `pnpm --filter web generate:routes && pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
- Manual: dois usuários num grupo, vínculo com Moradia e aluguel de 3000 rateado igualmente. A grade mostra +1500 travado em Moradia, os cards e o Extrato batem, e pagar no grupo muda o item para realizado.

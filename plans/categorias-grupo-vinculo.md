# Categorias de grupo e vínculo categoria × categoria

## Contexto

Hoje cada membro vincula um grupo ao orçamento pessoal com **uma** categoria de despesa e **uma** de receita (`GroupMember.expenseCategoryId`/`incomeCategoryId`): toda a sua parte nas despesas do grupo cai numa só categoria (ex.: Moradia), mesmo quando o grupo tem aluguel, mercado, internet etc. A mudança:

1. O grupo ganha **categorias próprias, de um nível só** (nome + tipo receita/despesa), e cada lançamento do grupo pode ter uma.
2. No vínculo com o Extrato/Dashboard o membro escolhe entre:
   - **Uma categoria para tudo** (modelo atual), ou
   - **Categoria × categoria**: cada categoria do grupo aponta para uma categoria pessoal.
   Itens sem categoria ou de categoria não mapeada **caem na categoria padrão** do tipo (o vínculo atual). Sem padrão, ficam só no resumo do grupo.
3. Categorias do grupo são geridas por **qualquer membro** (`assertMember`, como regras de rateio e lançamentos).
4. A seção de convites pendentes **fica como está** (decisão do usuário).

Continua tudo calculado **na leitura** (nada é copiado para `Transaction`).

## API (`apps/api`)

### Schema + migration `group_categories`
- `GroupCategory { id, groupId → FinanceGroup (Cascade), kind EntryKind, name, active Boolean @default(true), createdAt; @@unique([groupId, kind, name]) }`.
- `GroupTransaction.categoryId Int?` → `GroupCategory` (`onDelete: SetNull`), `@@index([categoryId])`.
- `GroupMemberCategoryLink { memberId → GroupMember (Cascade), groupCategoryId → GroupCategory (Cascade), categoryId → Category (Cascade); @@id([memberId, groupCategoryId]) }`. Excluir a categoria pessoal remove o mapeamento (o item volta para a padrão); excluir a do grupo também.
- O modo é derivado: sem mapeamentos = "uma categoria para tudo". `expenseCategoryId`/`incomeCategoryId` continuam sendo a padrão.
- `pnpm prisma migrate dev --name group_categories --config prisma7.config.ts` + `generate`.

### Categorias do grupo (`src/groups/`)
- `GroupCategoryService` + `GroupCategoryController` em `groups/:groupId/categories`: `GET` (ordenadas por kind, nome), `POST { kind, name }`, `PATCH /:id { name?, active? }` (kind não editável), `DELETE /:id`. Todos via `assertMember` (404 fora do grupo); 409 em nome duplicado (`isUniqueViolation`, fora de transação); 404 para categoria de outro grupo.
- DTOs em `dto/group-category.dto.ts`. `GET /groups/:id` (`FinanceGroupDto`) passa a trazer `categories`.

### Lançamentos do grupo (`group-transaction.service.ts`, `dto/group-transaction.dto.ts`)
- `categoryId?: number | null` no create/update. Validação compartilhada (novo helper em `group-access.ts` ou `group-category-access.ts`): 404 se não é do grupo, 400 se inativa (manter uma já inativa na edição é permitido, como `assertUsablePaymentMethod`), 400 se o `kind` difere do lançamento (inclusive ao trocar só o `kind`).
- Segue o padrão de `dueDay`/`paymentUrl`: copiado para cada ocorrência de `repeatMonths`, para extensões de série (`template`), propagado por `FOLLOWING`, `null` limpa. A resposta traz `category: { id, name } | null`.

### Vínculo (`GroupLinkDto`, `GroupService.setLink`)
- Novo campo opcional `categoryLinks?: { groupCategoryId, categoryId }[]` (omitido mantém; enviado substitui todos; `[]` = modo "uma categoria para tudo").
- Validação: cada `groupCategoryId` do grupo (404) e sem repetição (400); cada `categoryId` pessoal reaproveita a validação atual (`assertWritableCategories` para os novos, mesmo `kind` da categoria do grupo, senão 400). Grava em transação interativa (`deleteMany` + `createMany` + update do membro).
- `link` em `FinanceGroupDto` ganha `categoryLinks`.

### Leitura (`budget/group-shares.ts`, `group-statement.service.ts`)
- `linkedCategoryId(kind, link, groupCategoryId)` passa a resolver: mapeamento da categoria do grupo → senão padrão do tipo → senão `null`. `sumLinkedShares` recebe `transaction.categoryId` e `member.categoryLinks`.
- `linkedShareCells`: o filtro `OR` inclui membros com `categoryLinks: { some: {} }`.
- `GroupStatementService`: carrega `categoryLinks` (com a categoria pessoal via `categorySelect`) e `transaction.category`; cada item ganha `groupCategory: { id, name } | null` e `category` resolvido por item. `link` traz `categoryLinks` com nomes.
- `budget.service.ts` (entries/summary) e invoices não mudam: já consomem `linkedShareCells`/as partes por item.

### Testes API
- Unit: `group-shares.spec.ts` (mapeamento > padrão > nada), `group-category.service.spec.ts`, controllers, `group.service.spec.ts` (setLink com mapeamentos), `group-transaction.service.spec.ts` (categoria, kind, propagação), `group-statement.service.spec.ts`.
- E2E novo `test/group-categories.e2e-spec.ts`: CRUD, 409 duplicado, 400 campo desconhecido/inválido, não-membro 404 em todas as rotas, categoria de outro grupo 404, lançamento com categoria de kind errado/inativa 400, propagação FOLLOWING e série, exclusão faz SetNull.
- E2E em `test/group-budget.e2e-spec.ts`: mapeamento Aluguel→Moradia e Mercado→Alimentação dividem `groupCents` entre as duas; item sem categoria/não mapeado cai na padrão; sem padrão fica fora; `categoryLinks: []` volta ao modelo único; excluir a categoria pessoal mapeada volta para a padrão; isolamento (B não vê/altera os mapeamentos de A; A não mapeia para categoria pessoal de B → 404).

## Web (`apps/web`)

- **Tipos/API/queries** (`features/groups/`): `GroupCategory`, `FinanceGroup.categories`, `GroupLink.categoryLinks`, `GroupTransaction.category`; `fetch/create/update/deleteGroupCategory`; `useGroupCategoryActions(id)` invalida `detail(id)` e `budgetQueries.all()`. `groupErrorMessage` traduz as novas mensagens. `statementLink` (`link.ts`) inclui `categoryLinks`.
- **Página do grupo** (`routes/_app/grupos/$groupId.tsx`): nova aba `categorias` (`TABS`), com o organismo `GroupCategoriesPanel` (lista por Receitas/Despesas, criar/renomear/inativar/excluir com `AlertDialog`; diálogos no `GroupDialogs`).
- **Lançamentos**: `GroupTransactionFormDialog` ganha o select de categoria do grupo filtrado pelo tipo (limpa ao trocar o tipo; enviado no create só se definido, no edit só se mudou). `GroupTransactionList` mostra o nome da categoria.
- **`GroupLinkDialog`**: escolha "Uma categoria para tudo" / "Categoria por categoria" (radio). No segundo modo, por tipo: a categoria padrão rotulada "Demais / sem categoria" + uma linha por categoria ativa do grupo com o `CategorySelect` existente ("Usar a padrão" no lugar de "Não vincular"). Voltar para "uma para tudo" envia `categoryLinks: []`. O diálogo recebe `groupCategories`; os chamadores (página do grupo e `GroupStatementsCard`) passam a lista (o card precisa buscá-la: `GroupStatement` passa a trazer `groupCategories` na API, evitando outra query).
- **Extrato/Dashboard**: `buildStatement` já usa `item.category`; `StatementList`/`GroupStatementsCard` mostram `groupCategory` como subtítulo do item de grupo.
- **Testes**: `$groupId.categories.spec.tsx` (CRUD e erros), `$groupId.link.spec.tsx` (dois modos, envio de `categoryLinks`), `$groupId.spec.tsx` (categoria no formulário de lançamento), `extrato.groups.spec.tsx` (itens em categorias diferentes); fixtures `makeGroupCategory` em `src/test/groups.ts` e `stubGroupsApi`.

## CI e docs
- CI: nada novo (a migration roda no `prisma migrate deploy` já existente).
- `README.md`: linha em "Status dos recursos" e explicação dos dois modos de vínculo.
- `CLAUDE.md`: seções Groups (API e web) e Budget (`group-shares` com a resolução por categoria).
- Cópia deste plano em `plans/categorias-grupo-vinculo.md`.

## Verificação
- `cd apps/api && pnpm prisma generate --config prisma7.config.ts && pnpm lint && pnpm test && pnpm build`; `DATABASE_URL=postgresql://budget:budget@localhost:5432/budget_test pnpm prisma migrate deploy --config prisma7.config.ts && pnpm test:e2e`.
- `cd apps/web && pnpm generate:routes && pnpm lint && pnpm test && pnpm build`.
- Manual: grupo com Aluguel (3000) e Mercado (800) rateados entre 2; vínculo categoria × categoria Aluguel→Moradia, Mercado→Alimentação: a grade mostra +1500 em Moradia e +400 em Alimentação; um lançamento sem categoria vai para a padrão; trocar para "uma para tudo" junta tudo de novo.

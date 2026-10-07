# Dashboard: gestão de categorias, coluna Total e metas por tipo

## Context

O Dashboard (`/`) já mostra os cards de balanço e a grade de planejamento (Despesas/Receitas → tipos → categorias × 12 meses), mas a árvore de categorias é fixa (criada por `ensureDefaults`) e não há como editá-la. O pedido:

1. **Nível 1** (Receitas/Despesas) continua imutável — já é derivado de `EntryKind`, não existe no banco.
2. **Níveis 2 (tipo = `CategoryGroup`) e 3 (categoria = `Category`)**: renomear, inativar/reativar e excluir via menu ao passar o mouse (e botão direito); criar novos.
3. **Cabeçalho da tabela**: comandos de inclusão de tipos e "Mostrar inativas".
4. **Botão "+"** após a última categoria de cada tipo: cria categoria com nome, **descrição curta** e **dia de vencimento** (1–31), atributos da categoria (valem para todos os meses).
5. **Coluna "Total"** após o último mês.
6. **Metas** (só tipos de despesa) em % das receitas, com termômetro acima dos cards: mês atual e período de 12 meses.

Decisões confirmadas: inativar **mantém o histórico** (valores continuam nos totais/saldos; linha oculta e não editável, visível esmaecida com "Mostrar inativas"); excluir **apaga os valores** após diálogo de confirmação; metas só em tipos de despesa.

## API (`apps/api`)

### Schema + migration `category_management`
- `CategoryGroup`: `active Boolean @default(true)`, `goalPercent Int?` (1–100, só `EXPENSE`).
- `Category`: `active Boolean @default(true)`, `description String?` (≤ 120), `dueDay Int?` (1–31).
- `User`: `budgetSeeded Boolean @default(false)`; a migration faz `UPDATE User SET budgetSeeded = 1 WHERE id IN (SELECT userId FROM CategoryGroup)`.
  - Motivo: hoje `ensureDefaults` recria os padrões quando o usuário não tem tipos — se ele excluir todos, voltariam. Passa a usar `updateMany({ where: { id, budgetSeeded: false }, data: { budgetSeeded: true } })` dentro da transação (count 1 → cria padrões), o que também resolve a corrida sem depender do `P2002`.
- `prisma generate` depois.

### Novo `CategoryService` + `CategoryController` em `src/budget/` (registrados no `BudgetModule`)
Rotas (todas com `@CurrentUser()`, escopo por `userId`, `404` para recurso de outro usuário via `findFirst({ where: { id, userId } })`):

| Rota | Body | Resposta |
| --- | --- | --- |
| `POST /budget/groups` | `{ kind, name, goalPercent? }` | 201 `CategoryGroupDto` |
| `PATCH /budget/groups/:id` | `{ name?, active?, goalPercent?: number \| null }` | 200 `CategoryGroupDto` |
| `DELETE /budget/groups/:id` | — | 204 (cascade categorias + valores) |
| `POST /budget/groups/:id/categories` | `{ name, description?, dueDay? }` | 201 `CategoryDto` |
| `PATCH /budget/categories/:id` | `{ name?, description?: string \| null, dueDay?: number \| null, active? }` | 200 `CategoryDto` |
| `DELETE /budget/categories/:id` | — | 204 (cascade valores) |

Regras:
- `name` trim, 1–60 chars (`@Transform` trim + `@IsNotEmpty` + `@MaxLength`); `description` trim, string vazia → `null`.
- `ParseIntPipe` nos `:id`.
- Nome duplicado (`@@unique` existentes) → `isUniqueViolation` (`src/prisma/errors.ts`) → `409 Conflict`.
- `goalPercent` em tipo `INCOME` → `400`. `kind` é imutável (não aceito no PATCH).
- Criar categoria em tipo inativo → `400`.
- Novos itens entram no fim: `position = max(position) + 1` (`aggregate`).
- Campos nuláveis: `@IsOptional()` (aceita `null`) + validadores; o service distingue `undefined` (não altera) de `null` (limpa).
- DTOs em `dto/category.dto.ts` (create/update de grupo e categoria) com `@ApiProperty`.

### Ajustes no `BudgetService`
- `categories()` passa a selecionar `active`, `goalPercent`, `description`, `dueDay` (retorna também os inativos; o cliente filtra). Atualizar `CategoryGroupDto`/`CategoryDto`.
- `saveEntries()`: o `count` de propriedade passa a exigir `active: true` na categoria **e** no tipo; categoria inativa → `400 "Category is inactive"` (contar separadamente: inexistente/de outro → 404, inativa → 400).
- `summary()` inalterado (histórico mantido inclui inativas).

## Web (`apps/web`)

### Dados — `src/features/budget/`
- `types.ts`: novos campos (`active`, `goalPercent`, `description`, `dueDay`).
- `api.ts`: `createGroup`, `updateGroup`, `deleteGroup`, `createCategory`, `updateCategory`, `deleteCategory`.
- `hooks.ts`: `useCategoryMutations({ onForget })` — `useMutation` por ação; sucesso invalida `budgetQueries.categories()` (exclusão invalida `budgetQueries.all()`, pois entries/summary mudam); toast de sucesso; erro `409` → "Já existe um item com esse nome".
- `draft.ts`: nova ação `{ type: 'forget', categoryIds }` que remove edições pendentes dessas categorias — disparada ao excluir/inativar categoria ou tipo, para o `PUT /budget/entries` não falhar com 404/400.
- `rows.ts` (`buildBudgetTable`): 
  - Totais calculados sobre **todas** as categorias (histórico mantido); depois filtra a exibição com opção `{ showInactive }`. Uma categoria é inativa se ela ou o tipo estiver inativo; linhas ganham `active`, `description`, `dueDay`, `goalPercent`.
  - Cada linha/total ganha `total` (soma dos meses). `balanceTotal` = soma dos saldos; `accumulatedTotal` = saldo acumulado do último mês.
- `goals.ts` (novo, puro): `buildGoalProgress(table)` → por tipo de despesa com meta: `{ id, name, goalPercent, month: { spentCents, incomeCents, percent }, period: {...} }` + status `ok | warning (≥90% da meta) | over`. Percentual com aritmética inteira (`spent * 1000 / income` → uma casa decimal); receita 0 → percentual indefinido (exibe "sem receitas"). Também um consolidado: soma das metas vs. soma realizada.

### Componentes (respeitando ui → atoms → molecules → organisms)
- `ui/`: adicionar `alert-dialog` e `switch` via `pnpm dlx shadcn@latest add alert-dialog switch`.
- `molecules/`
  - `RowActions` — botão "⋯" visível no hover (`group-hover`, mesmo padrão de `BudgetCell`) + `ContextMenu` no botão direito. Itens: Editar/Renomear, Inativar/Reativar, Excluir; para tipos também "Nova categoria" e (despesa) "Definir meta".
  - `CategoryFormDialog` — criar/editar categoria (nome, descrição, dia de vencimento) ou tipo (nome; meta % se despesa). Segue o padrão de `InitialBalanceDialog` (form montado só quando aberto, `FormAlert` para `ApiError`).
  - `ConfirmDialog` — `AlertDialog` de exclusão ("Os valores lançados nesta categoria serão apagados. Para manter o histórico, inative-a.").
  - `GoalMeter` — termômetro horizontal (`role="meter"`, `aria-valuenow`), barra até o realizado, marcador na meta, cor por status.
- `organisms/`
  - `BudgetGrid`:
    - Cabeçalho "Categoria" com menu: "Novo tipo de despesa", "Novo tipo de receita" e switch "Mostrar inativas".
    - Linhas de tipo e categoria com `RowActions`; linhas inativas esmaecidas, com selo "Inativa", células somente leitura (`MoneyText` em vez de `BudgetCell`).
    - Nome da categoria com descrição em segunda linha (truncada, `title` com texto completo) e selo "Vence dia N".
    - Linha "+ Nova categoria" após a última categoria de cada tipo ativo expandido.
    - Coluna "Total" (sticky à direita, destaque) após o último mês, em seções, tipos, categorias e rodapé.
    - Callbacks novos via props (`onCreateGroup`, `onEditGroup`, `onToggleGroup`, `onDeleteGroup`, idem categoria) — o grid continua sem chamar API.
  - `GoalsPanel` — Card acima do `BalanceSummary`: por tipo de despesa com meta, nome + "meta 50%" + dois `GoalMeter` (mês atual / 12 meses) e um resumo consolidado; botão "Definir metas" abre diálogo com todos os tipos de despesa (inputs de %, mostra soma e alerta se > 100%). Sem metas → estado vazio com CTA.
- `routes/_app/index.tsx`: estado `showInactive`, estado dos diálogos (qual item está sendo criado/editado/excluído), liga `useCategoryMutations` e `draft.dispatch({ type: 'forget' })`. A página fica grande; extrair a orquestração dos diálogos para um organism `CategoryDialogs` se passar de ~200 linhas.

## Testes

- **API e2e** — novo `apps/api/test/categories.e2e-spec.ts`:
  - 401 em todas as rotas novas.
  - CRUD completo de tipos e categorias; posição no fim; descrição/vencimento salvos e limpos com `null`.
  - Validação: campos desconhecidos, nome vazio/longo, `dueDay` 0/32/decimal, `goalPercent` 0/101, meta em tipo de receita, `kind` no PATCH → 400; `:id` não numérico → 400.
  - Nome duplicado → 409; inexistente → 404.
  - **Isolamento**: Bia não lê/edita/inativa/exclui tipos ou categorias da Ana nem cria categoria no tipo dela (404), e os dados da Ana não mudam.
  - Inativar mantém valores no `/budget/summary`; `PUT /budget/entries` em categoria inativa (ou tipo inativo) → 400; reativar volta a aceitar.
  - Excluir categoria/tipo remove valores (summary muda).
  - Excluir todos os tipos não recria os padrões no próximo `GET /budget/categories`.
- **API e2e** — `budget.e2e-spec.ts`: ajustar o formato de `GET /budget/categories` (novos campos).
- **API unit**: `category.service.spec.ts` (mock `PrismaService`: 404, 409, 400 de meta/inativo, position, null vs undefined), `category.controller.spec.ts`, `budget.service.spec.ts` (seed com `budgetSeeded`, inativa no `saveEntries`).
- **Web unit**: `rows.spec.ts` (coluna total, inativas ocultas mas somadas, `showInactive`), `goals.spec.ts` (percentuais, status, receita 0), `draft.spec.ts` (`forget`).
- **Web flows** (`renderRoute('/')`, mock de `@/features/budget/api`, `stubBudgetApi()` em `src/test/budget.ts` estendido com as novas funções): renomear tipo e categoria pelo menu "⋯" e pelo botão direito; inativar → some da grade, "Mostrar inativas" exibe esmaecida e reativa; "+" cria categoria com descrição e vencimento (validação de dia); excluir com confirmação; novo tipo pelo cabeçalho; coluna Total; painel de metas (definir meta, termômetro do mês e do período, alerta de soma > 100%); erro 409 exibido no diálogo; edição pendente de categoria excluída não é enviada no salvar. Se `index.spec.tsx` crescer demais, criar `index.categories.spec.tsx` e `index.goals.spec.tsx` ao lado.

## CI, README e docs
- CI: sem passos novos (o job `api` já roda `prisma migrate deploy` antes do e2e). Conferir que nada muda.
- `README.md`: "Status dos recursos" — "Categorias de receitas e despesas" → ✅/✅ (criar, renomear, inativar, excluir; descrição e vencimento); nova linha "Metas por tipo de despesa" ✅/✅; atualizar a seção [Dashboard] (coluna Total, menu de linhas, inativas, metas) e a lista de rotas da API.
- `CLAUDE.md`: atualizar o bullet **Budget** (API e Web) com `active`, metas, `budgetSeeded`, `CategoryService` e a ação `forget` do draft.

## Verificação
1. `cd apps/api && pnpm prisma migrate dev --name category_management --config prisma7.config.ts && pnpm prisma generate --config prisma7.config.ts`
2. `pnpm --filter api lint && pnpm --filter api test && pnpm --filter api build`
3. `cd apps/api && DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm test:e2e`
4. `pnpm --filter web generate:routes && pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`
5. Manual: subir API + web (`start:dev`), criar/renomear/inativar/excluir tipos e categorias, conferir Total e termômetro com metas, e checar no Swagger (`/docs`) as rotas novas.

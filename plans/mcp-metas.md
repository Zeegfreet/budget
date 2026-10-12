# Metas no servidor MCP

## Contexto

Hoje um agente só consegue mexer nas metas campo a campo, pelo `goalPercent` de `update_category_type`, e não tem como saber como cada meta está indo: o cálculo de uso (gasto × meta, alerta a partir de 90%, estourada, "Sobra / Aporte") existe só no web, em `apps/web/src/features/budget/goals.ts`. A ideia é dar ao MCP duas tools próprias para metas:

- **`get_goals`** (`budget:read`): mostra a situação das metas num período, com os mesmos números do painel de metas do dashboard.
- **`set_goals`** (`budget:write`): define ou remove várias metas de uma vez, com tudo ou nada, como o **Aplicar metas** do web.

Não precisa de migration, de variável de ambiente nem de mudança no CI.

## API

### 1. Cálculo puro: `apps/api/src/budget/goals.ts` (novo)
Porta do `goals.ts` do web, só com inteiros:
- `shareOfIncome`, `goalUsage`, `leftoverUsage` e `WARNING_RATIO = 90` iguais aos do web (`permille`, `status` ok/warning/over, `targetCents`).
- `buildGoalsOverview(types: CategoryGroupDto[], entries: MonthlyEntryDto[], months: string[])`:
  - cada célula vale `amountCents + groupCents`, e tipos/categorias inativos continuam contando, como em `rows.ts`;
  - receita = soma das categorias INCOME; o saldo do mês é receita − todas as despesas;
  - metas = tipos EXPENSE **ativos** com `goalPercent`, com `month` (primeiro mês = mês de referência) e `period` (janela inteira);
  - também `totalGoalPercent`, o uso conjunto e `leftover { targetPercent = max(0, 100 − total), month, period }`.
- Teste unitário `goals.spec.ts`: limiares de status, sem receita, rateios de grupos contando, tipo inativo fora, sobra negativa.

### 2. DTOs
- Em `budget/dto/budget-responses.dto.ts`: `GoalUsageDto`, `GoalProgressDto`, `LeftoverProgressDto` e `GoalsOverviewDto` (com `@ApiProperty`, seguindo o arquivo).
- `budget/dto/set-goals.dto.ts` (novo): `SetGoalsDto { goals: GoalChangeDto[] }` (`ArrayMinSize(1)`, `ArrayMaxSize(MAX_PLAN_ITEMS)`, `ValidateNested`), com `GoalChangeDto { typeId: int ≥ 1; goalPercent: int 1–100 | null }`. O `goalPercent` usa o `IsPresent` de `category.dto.ts` para ser obrigatório, aceitando `null` = remover. Um `typeId` repetido dá 400 (`goals must not repeat a type`, com `ArrayUnique` por `typeId`).

### 3. Serviços (reaproveitando o que já existe)
- `BudgetService.goals(userId, from, to)`: chama `this.categories(userId)` e `this.entries(userId, from, to)`, que já rodam `ensureForUser`, e depois `buildGoalsOverview` com `monthRange`/lista de meses de `budget/month.ts`.
- `set_goals` reutiliza o `PlanService.save(userId, { updateGroups: goals.map(g => ({ id: g.typeId, goalPercent: g.goalPercent })) })`. Assim vem tudo de graça: transação única (tudo ou nada), 404 para tipo de outro usuário e 400 `Only expense types can have a goal`.
- `budget.module.ts`: exportar `PlanService`.

### 4. Tools: `apps/api/src/mcp/tools/goals.tools.ts` (novo)
- `get_goals`: `{ from, to }` com `month(...)`, validado com o `MonthRangeQueryDto` (até 24 meses, como `get_budget_lines`). A descrição explica o `from` como mês de referência, `period` como a janela inteira, `permille`, `status` e a sobra (meta mínima). `readOnlyHint: true`.
- `set_goals`: `{ goals: [{ typeId, goalPercent: int | null }] }` → `validateDto(SetGoalsDto)` → `PlanService.save`. Devolve `{ goals: <tipos de despesa com goalPercent>, totalGoalPercent }`, além de um aviso em texto quando a soma passa de 100% (o web só avisa e não bloqueia). `idempotentHint: true`, `destructiveHint: false`.
- `services.ts`: adicionar `plan: PlanService`. `mcp-server.factory.ts`: injetar o `PlanService`, chamar `registerGoalTools(ctx, this.services)` e acrescentar uma linha em `serverInstructions()` (metas = % da receita por tipo de despesa: `get_goals` para acompanhar, `set_goals` para definir).
- Em `categories.tools.ts`, o texto de `update_category_type` passa a indicar `set_goals` para mudar várias metas de uma vez. O campo continua lá.

## Testes
- `src/mcp/mcp-server.factory.spec.ts`: as contagens vão de 18/5 para **20/6**, com casos para `get_goals` (chama `budget.goals`) e `set_goals` (chama `plan.save` com `updateGroups`) no mock.
- `src/budget/budget.service.spec.ts`: `goals` monta o resumo a partir de `categories` + `entries` mockados.
- `test/mcp.e2e-spec.ts`:
  - `READ_TOOLS` e a lista completa ganham `get_goals` e `set_goals`;
  - novo fluxo **"sets and follows goals"**: `set_goals` em dois tipos de despesa, `set_budget_cells` com receita e despesas, `get_goals` com os status ok/warning/over e a sobra, remoção com `null`;
  - validação: tipo de receita dá 400, `goalPercent` 0 ou 101 dá 400, lista vazia dá 400, campo extra dá 400, `typeId` repetido dá 400, e um item inválido no meio não muda nada (tudo ou nada);
  - um token só de leitura não vê `set_goals`;
  - isolamento: o agente do usuário A recebe 404 com o `typeId` do usuário B e o `get_goals` de A não mostra os tipos de B.

## Documentação
- `README.md`: na linha do MCP em "Status dos recursos", 18 → **20 ferramentas** com "metas" na lista; na tabela de escopos (~linha 638), `get_goals` em `budget:read` e `set_goals` em `budget:write`.
- `CLAUDE.md`: no bloco do MCP, "20 tools … goals (read + bulk set)"; mencionar `budget/goals.ts` (porta pura do web) e o `PlanService` exportado.
- Salvar uma cópia deste plano em `plans/mcp-metas.md`.

## Verificação
```bash
cd apps/api
pnpm prisma generate --config prisma7.config.ts
pnpm lint && pnpm build
pnpm test src/budget/goals.spec.ts src/mcp/mcp-server.factory.spec.ts src/budget/budget.service.spec.ts
pnpm test && pnpm test:e2e        # mcp.e2e-spec.ts and mcp-stdio.e2e-spec.ts (with the build)
```
Para conferir à mão: `pnpm start:mcp`, conectar um cliente MCP, rodar `set_goals` e depois `get_goals` e comparar com o painel de metas do dashboard no mesmo período.

## Notas da implementação
- Não foram criados DTOs de resposta (`GoalsOverviewDto` etc.): sem rota REST, os tipos ficaram como interfaces em `budget/goals.ts`. `buildGoalsOverview(types, entries, from, to)` recebe `from`/`to` em vez da lista de meses.
- O caso "campo extra dá 400" não vale para tools: o schema zod do SDK descarta campos aninhados desconhecidos antes do `validateDto` (registrado no CLAUDE.md). O `goalPercent` ausente é barrado pelo próprio schema da tool.
- `test/mcp-stdio.e2e-spec.ts` também tem a lista de tools de leitura e ganhou `get_goals`.

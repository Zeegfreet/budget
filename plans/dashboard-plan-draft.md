# Dashboard: goal amounts + planning table saved only on "Salvar"

## Context
Two dashboard improvements:
1. **Goal amounts.** Each goal card shows the goal %, the % reached and the amount reached, but not the goal's **amount** (income × goal %). We'll add it, along with the "Sobra / Aporte" minimum.
2. **Planning table as a draft.** Today only the grid's cell values wait for **Salvar** (`useBudgetDraft` → `PUT /budget/lines`). Everything else on the table saves right away: creating, editing, deactivating and deleting types and categories, launches (create/edit/delete) and goals. The table is where the user tries out scenarios, so **every** change should stay in a local draft until **Salvar**, and **Descartar** should undo all of it.

Decisions made: (a) saving goes through a new **batch endpoint** that writes everything in **one database transaction** (all or nothing); (b) **goals** (Definir metas and the type's goal %) are part of the draft too.

Not affected: the Extrato's `CategoryManager`, initial balance, group link and statement actions all keep saving right away.

---

## 1. Goal amount (web)
- [goals.ts](apps/web/src/features/budget/goals.ts): add `targetCents` to `GoalUsage`, set to `Math.round(incomeCents * goalPercent / 100)` (integer math, `0` with no income). It is filled in by `goalUsage`, and by `leftoverUsage` with `targetPercent`.
- [GoalMeter.tsx](apps/web/src/components/molecules/GoalMeter.tsx): the money line becomes `R$ 1.200,00 de R$ 2.500,00` (`max` mode) or `R$ 800,00 · mín. R$ 500,00` (`min` mode), shown only when there is income. Add the amount to `aria-valuetext` too.
- Tests: [goals.spec.ts](apps/web/src/features/budget/goals.spec.ts) (targetCents, rounding, no income), [index.goals.spec.tsx](apps/web/src/routes/_app/index.goals.spec.tsx) (card shows the goal amount).

## 2. API: `PUT /budget/plan` (one transaction)

> **As implemented:** the body uses flat lists (`createGroups`, `updateGroups`, `deleteGroups`, `createCategories`, …, `cells`) instead of nested objects, and the **deletes run first**, so a deleted name can be reused in the same save (the draft drops whatever was under a deleted item). The GoalsDialog button became **Aplicar metas**.
New `PlanService` + route in `BudgetController` (or a `PlanController` under `/budget`), wired in `budget.module.ts`.

**DTO** `dto/save-plan.dto.ts`. It uses separate arrays, so no discriminated unions are needed for class-validator. Every array is optional with `ArrayMaxSize`, and every item is `@ValidateNested` + `@Type`. **Negative ids are references to items created in the same request** (`ref`):
```
groups:     { create: [{ ref<0, kind, name, goalPercent? }], update: [{ id, name?, goalPercent?, active? }], delete: [id] }
categories: { create: [{ ref<0, groupId (id or ref), name }], update: [{ id, name?, active? }], delete: [id] }
lines:      { create: [{ ref<0, categoryId (id or ref), month, description?, plannedCents, repeatMonths?, dueDay?, paymentUrl?, paymentMethodId? }],
              update: [{ transactionId, categoryId?, description?, plannedCents?, dueDay?, paymentUrl?, paymentMethodId? }],  // always FOLLOWING
              delete: [transactionId] }                                                                                  // always FOLLOWING
cells:      [{ anchorId (id or line ref), month, amountCents }]
```
The field validators are reused from `category.dto.ts`, `transaction.dto.ts`, `save-lines.dto.ts` and `IsPaymentUrl()`.

**Execution**: `prisma.$transaction(async (tx) => …)` in a fixed order. That order makes the result match what the draft showed:
1. groups create (`ref → id`) → groups update without `active: false`
2. categories create → categories update without `active: false` (so "reactivate, then add" works)
3. lines create (the response's first occurrence becomes the line ref's anchor) → lines update (FOLLOWING) → lines delete (FOLLOWING)
4. cells (`saveLines` logic, with refs resolved)
5. inactivations (`active: false`) of categories, then groups. They run after the values, so editing values and then deactivating still saves the values.
6. category deletes → group deletes

A reference to an unknown ref is **400** `Unknown reference`. Real ids keep the services' existing checks: **404** for another user's item, 400 for inactive, and so on.

**Refactor so the services can run inside the transaction.** This changes no behavior for the existing routes:
- `type Db = PrismaService | Prisma.TransactionClient`. `assertWritableCategories` ([category-access.ts](apps/api/src/budget/category-access.ts)) and `assertUsablePaymentMethod` ([payment-method-access.ts](apps/api/src/payment-methods/payment-method-access.ts)) take `Db`.
- [category.service.ts](apps/api/src/budget/category.service.ts): `createGroup/updateGroup/deleteGroup/createCategory/updateCategory/deleteCategory` get an optional `db: Db = this.prisma` parameter, which `findGroup`/`findCategory` also use.
- [transaction.service.ts](apps/api/src/budget/transaction.service.ts) `create/update/remove` and [budget.service.ts](apps/api/src/budget/budget.service.ts) `saveLines` currently use batch `$transaction([...])`, which can't be nested. Move their core into internal methods that take `db` and run the writes sequentially. The public methods wrap them in `this.prisma.$transaction(async (tx) => core(tx))`, and `PlanService` calls the core with its `tx`.
- **P2002** (duplicate name) aborts the interactive transaction, so `PlanService` catches it **outside** `$transaction` with `isUniqueViolation` and maps it to 409 `An item with this name already exists`, which is what the existing callers do.
- Response: `204`. The web reloads everything.

`PUT /budget/lines` stays; the e2e suite and other clients still use it.

## 3. Web: the plan draft
**Pure model** `apps/web/src/features/budget/plan.ts` (replaces/absorbs `draft.ts`; the existing `cells` edits map stays as it is). It is a reducer over:
- `groups`: `created` (temp id < 0), `patched` (id → `GroupPatch`), `deleted`
- `categories`: `created` (temp id, groupId may be temp), `patched`, `deleted`
- `lines`: `created` (temp anchor, create input + the chosen `paymentMethod` for display), `updated` (anchorId → `{ transactionId, month, patch }`), `deleted` (anchorId → `{ transactionId, month }`)
- `cells`: the current `Edits` map

**Collapse rules**, so the request is the minimal diff and the count is honest:
- Create + edit merges into the create.
- Create + delete drops both.
- Edit + edit merges.
- A patch equal to the saved value is removed.
- Deleting a type or category drops the patches, lines and cell edits under it.
- Deleting a line drops its edits from the target month on.
- Editing a line's `plannedCents` drops the cell edits from the target month on.
- Deactivating **keeps** the edits (the API applies them first). This replaces the current `forget` on deactivate.

**Projection** `applyPlan(groups, lines, plan, months)` → `{ groups, lines }` with the draft applied, ready for the existing `buildBudgetTable` / `buildGoalsOverview`:
- New lines get pending cells in the window from `month` for `repeatMonths`.
- An edit applies its fields to the line, and its `plannedCents` to the pending cells from the target month on.
- A delete removes the pending cells from the target month on; the line disappears when no cells are left.
- Realized cells never change.

**Other pieces:**
- `planRequest(plan)` builds the `PUT /budget/plan` body (inactivations split from the other patches).
- `planChangeCount(plan, saved)` feeds `SaveBar`.
- Client-side duplicate-name check against the projected tree: the form gets an error just like the API's 409 (reuse the `categoryErrorMessage` text).

**Hooks** ([hooks.ts](apps/web/src/features/budget/hooks.ts)):
- `useBudgetPlan(groups, lines, entries)`: extends `useBudgetDraft` with the plan reducer and exposes the projected data, `changes`, `isChanged` and `dispatch`.
- `usePlanActions(dispatch)`: same interface as `useCategoryActions` (`createGroup`, `updateGroup`, …), but every action resolves immediately into the draft, with no toast.
- `usePlanLineActions(dispatch)`: `create/update/remove`, same interface as the parts of `useTransactionActions` that `BudgetLineDialogs` uses.
- Extract shared `CategoryActions` / `LineActions` types so `BudgetDialogs`, `useCategoryToggle` and `BudgetLineDialogs` take either the immediate version (Extrato) or the draft version (Dashboard).

**API client**: `savePlan(body)` in [api.ts](apps/web/src/features/budget/api.ts), with types in `types.ts`.

**Dashboard** ([routes/_app/index.tsx](apps/web/src/routes/_app/index.tsx)):
- Use `useBudgetPlan` and pass the projected groups and lines to `buildBudgetTable`. The goals and cards then follow the draft.
- `BudgetDialogs` gets `usePlanActions`. Its `goalTargets` come from the projected groups, and `GoalsDialog` goes into the draft.
- `BudgetLineDialogs` gets `usePlanLineActions`. The launch dialog note changes from "saved right away" to the draft wording.
- The save mutation becomes `savePlan(planRequest(plan))`, then `invalidateQueries(budgetQueries.all())`, then `discard`. On error the draft is kept and the message shows in `SaveBar` (translated with `categoryErrorMessage` / `transactionErrorMessage`).
- `useUnsavedChangesGuard` and `SaveBar` use the full count.
- Update the planning card's description: "Nada é gravado até clicar em Salvar".

**Grid** ([BudgetGrid.tsx](apps/web/src/components/organisms/BudgetGrid.tsx)):
- Rows (type, category, line) that are new or edited in the draft get the same "changed" mark the cells use.
- An unsaved line (anchor < 0) has no **Ver no extrato** action.

## 4. Tests
**API**
- `plan.service.spec.ts` (mocked Prisma): execution order, ref resolution, 400 on an unknown ref.
- Existing service specs adjusted for the `db` parameter.
- **E2E** `test/budget-plan.e2e-spec.ts`:
  - One request creates type → category → launch with repeat → cells on the new line → goal; `GET /budget/categories|lines` reflect it.
  - Edit/delete FOLLOWING of existing lines.
  - Cells, then deactivating the category in the same request.
  - **Rollback**: a duplicate name (409) and a write to an inactive category (400) persist **nothing**.
  - **Cross-tenant**: user A sending user B's group, category, transaction or payment method gets 404, and nothing changes.
  - Validation: unknown field, `ref ≥ 0`, unknown ref, goal on an income type.
  - Unauthenticated: 401.
- The existing `categories`, `transactions` and `budget` e2e suites must keep passing after the refactor.

**Web**
- `plan.spec.ts`: collapse rules, projection (realized cells kept, repeats clipped to the window), `planRequest` split, count.
- `goals.spec.ts`.
- Rewrite the dashboard flows in [index.categories.spec.tsx](apps/web/src/routes/_app/index.categories.spec.tsx):
  - Creating, renaming, deactivating and deleting a type or category does **not** call the category API. The grid updates, the SaveBar appears, and **Salvar** calls `savePlan` with the expected body.
  - **Descartar** restores everything.
  - The navigation guard fires with structural changes only.
  - The save error is shown and the draft kept.
- Grid launch flows in `index.spec.tsx`: new, edit and delete stay pending.
- `index.goals.spec.tsx`: Definir metas is pending and the panel follows the draft.
- `stubBudgetApi` gets `savePlan`.
- The Extrato `CategoryManager` specs stay as they are (still immediate).

## 5. Docs
- `CLAUDE.md`: the `PUT /budget/plan` contract and order, the `Db` refactor, and the web `plan.ts`/`useBudgetPlan` (dashboard draft vs. Extrato immediate).
- `README.md` (PT-BR): "Status dos recursos" and the dashboard text.
- CI: no new step (the new e2e file runs in the existing job).

## Verification
- `pnpm --filter api lint && pnpm --filter api test && pnpm --filter api test:e2e` (after `prisma migrate deploy` on `budget_test`; no schema change).
- `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
- Manual run (`docker compose up -d`, API + web `start:dev`):
  1. Create a type, a category and a launch, delete another category, change a goal. Check the goals panel and totals update, and that the Extrato shows nothing new.
  2. Click **Salvar** and check everything persisted.
  3. Repeat the changes and click **Descartar**: everything reverts.
  4. Force a duplicate name with another tab open and check nothing was saved.

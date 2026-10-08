# Grupos: vencimento nos lançamentos + pré-cadastro por convite

## Context
Two gaps on the group screen:
1. Group launches (`GroupTransaction`) have no due day, unlike personal launches in the extrato (`Transaction.dueDay`, 1–31).
2. Inviting by e-mail only works for existing users (`404 'No user with this e-mail'`). The new behavior: an unknown e-mail creates a **pre-registration** (placeholder `User`) with a **nickname**.
   - Per the user's decisions, the placeholder **joins the group as an active member right away**, with no acceptance step. It takes part in splits, the balance and as payer.
   - When the person later signs up with that e-mail, the account **takes over the placeholder row**: same id, so memberships and history are kept. The sign-up name replaces the nickname.

On execution, also copy this plan to `plans/` at the repo root (project convention).

---

## Part 1: due day on group launches

### API
- **Schema and migration.** In `apps/api/prisma/schema.prisma`, add `dueDay Int?` to `GroupTransaction` with the same doc comment as `Transaction`. Then run `prisma migrate dev --name group_transaction_due_day --config prisma7.config.ts`.
- **DTOs** (`src/groups/dto/group-transaction.dto.ts`), copying `src/budget/dto/transaction.dto.ts`:
  - Create: `@IsOptional() @IsInt() @Min(1) @Max(31) dueDay?: number | null`.
  - Update: the same field with `@IsOptional()`, not `@IsPresent()`, so that `null` clears it.
  - Response `GroupTransactionDto`: `dueDay: number | null`.
- **`src/groups/group-transaction.service.ts`:**
  - Add `dueDay` to `groupTransactionSelect`.
  - `create`: copy `dueDay` into every `repeatMonths` occurrence.
  - `update`: put `dueDay` in the `updateMany` data, where `undefined` keeps the value and `null` clears it. This reaches FOLLOWING through `followingIds`.
  - `setSeriesEnd`: copy `template.dueDay`.
  - `list`: order by `dueDay ?? 32`, then `id`, the same rule as `byStatementOrder`.
- **`src/budget/group-statement.service.ts`:**
  - Select `dueDay` and expose it on `GroupStatementItemDto` as the **effective** day. For expenses that is `me.paymentMethod?.dueDay ?? t.dueDay` (the member's linked method wins, like personal launches). For income it is `t.dueDay`.
  - Order the items by that day, then id.
- The invoice (`payment-methods`) is unchanged, since the method's own due day already rules there.

### Web
- **New atom `DueDayBadge`** (`src/components/atoms/`): extract the chip from `TransactionRow.tsx:57-62`. Reuse it in `TransactionRow`, in `GroupTransactionList`'s `GroupTransactionRow`, and in the share rows of `StatementList` and `GroupStatementsCard`.
- **Types:**
  - `features/groups/types.ts`: add `dueDay` to `GroupTransaction`, to `GroupTransactionInput`, and to the `GroupTransactionPatch` pick.
  - `features/budget/types.ts`: add `dueDay` to `GroupStatementItem`.
- **`GroupTransactionFormDialog.tsx`:**
  - Add a field "Dia de vencimento (opcional)" with the same `FormField`, `parseWhole(…, 1, 31)` and message as `TransactionFormDialog`.
  - Place it after the split rule, visible when creating and when editing.
- **`GroupTransactionDialogs.tsx`:**
  - Create: send `dueDay` only when it is not null.
  - Edit: send it only when it changed from `t.dueDay`, the same pattern as `TransactionDialogs.tsx:64-66`.
- **Fixtures:** add `dueDay: null` to `makeGroupTransaction` (`src/test/groups.ts`) and to `makeStatementItem` (`src/test/budget.ts`).

### Tests
- **E2E** (`apps/api/test/group-transactions.e2e-spec.ts`): add a `describe('due day')` that mirrors `transactions.e2e-spec.ts:497-560`:
  - the series keeps the day;
  - a FOLLOWING edit propagates it;
  - `null` clears it;
  - `[0, 32, 1.5, '10']` → 400;
  - extending the series copies it;
  - the list is ordered by the day.
- **E2E** (`group-budget.e2e-spec.ts`): the statement item's `dueDay` is the linked method's day when one is set, otherwise the launch's own day.
- **Unit:** `group-transaction.service.spec.ts` (create, update and setSeriesEnd carry `dueDay`) and `group-statement.service.spec.ts` (effective day and ordering).
- **Web** (`routes/_app/grupos/$groupId.spec.tsx`):
  - creating with a due day sends `dueDay`;
  - an edit that only changes the day sends `{ dueDay }` with the scope;
  - an invalid day shows the error;
  - the badge "Vence dia" is shown.
  - Also check that `extrato.groups.spec.tsx` shows the chip on shares.

---

## Part 2: pre-registration with a nickname

### API: model
- **`User` in `schema.prisma`:**
  - Add `pending Boolean @default(false)`, meaning a pre-registration that cannot log in.
  - Make `passwordHash`, `birthDate`, `cep`, `city` and `state` nullable. The placeholder stores only `email` and `name` (the nickname).
  - Create the migration (`pre_registration`). SQLite redefines the table, and Prisma generates that.
- Fix any compile error coming from the nullable fields. Today only `AuthService` reads `passwordHash`.

### API: invitation (`src/groups/invitation.service.ts`, `dto/invitation.dto.ts`)
- **`CreateInvitationDto`:** add optional `nickname` (trim, `Length(2, 100)`).
- **`invite`:**
  1. Look up the user by e-mail with `findPublicByEmail`, whose select now also returns `pending`.
  2. **Registered user** (`pending: false`): same flow as today, a PENDING invitation.
  3. **No user:** without a nickname, return `400 'Nickname required for an unregistered e-mail'`. With a nickname, create `User { email, name: nickname, pending: true }`, then continue at step 4.
  4. **Pending user** (new or already pre-registered by another group): inside one `$transaction`:
     - upsert the `GroupMember`, reusing the reactivation logic from `accept`;
     - record a `GroupInvitation` as `ACCEPTED` with `respondedAt`, for history;
     - return it.
     - An existing placeholder keeps its current name; the nickname is ignored.
  - The self, member and duplicate-invite checks stay as they are.
- **Responses:**
  - `GroupInvitationDto`: add `status` (`PENDING` | `ACCEPTED`). The `addMember` e2e helper keeps working.
  - `InvitationUserDto` and `GroupMemberDto` (`group.service.ts` L87, select `pending`): add `pending: boolean`.
- **`UserService`:** `createPending(email, name)`.

### API: auth (`src/auth/auth.service.ts`)
- **`register`:** on P2002, run `updateMany({ where: { email, pending: true }, data: { …sign-up data, pending: false } })`, which is race-safe. With `count === 0`, keep the `409 'E-mail already registered'`. Same id, so the person shows up already in the groups, with the sign-up name.
- **`validateCredentials`:** explicitly reject `!user || user.pending || !user.passwordHash` (still verifying against the dummy hash for constant timing).
- Removing a pre-registered member uses the existing `endMembership`. The placeholder user is never deleted, because deleting it would cascade to the shares.

### Web
- **`InviteMemberDialog.tsx`:**
  - Add the field "Apelido (se a pessoa ainda não tiver conta)" (optional, 2–100 characters). `onSubmit(email, nickname?)`.
  - New description: when there is no account, the person joins the group right away under the nickname, and when they sign up with this e-mail they take on their place.
  - The API's 400 'Nickname required…' becomes the field error: "Essa pessoa ainda não tem conta. Informe um apelido para pré-cadastrá-la."
- **`features/groups/errors.ts`:**
  - Map the new message.
  - Remove 'No user with this e-mail'.
- **`api.ts` / `hooks.ts`:**
  - `inviteMember(groupId, { email, nickname })`.
  - `useInvitationActions().invite` toasts according to `status`: "Convite enviado" or "{name} adicionado ao grupo (pré-cadastro)".
  - When the person was added, it also invalidates `groupQueries.detail(id)` (members, rules) and `budgetQueries.all()`.
- **Types:** `pending` on `GroupMember` / `InvitationUser`, `status` on `GroupInvitation`.
- **`GroupMembersPanel.tsx`:** add a "Pré-cadastro" badge on members with `pending`.

### Tests
- **E2E** (`apps/api/test/group-invitations.e2e-spec.ts`):
  - Rewrite the "rejects unknown users" case: without a nickname → 400.
  - Unknown e-mail with a nickname → `status: ACCEPTED`, the member is active with the nickname and `pending: true`.
  - The person enters an EQUAL split, and a launch splits with them.
  - Another group inviting the same placeholder adds it too and keeps the name.
  - Login with that e-mail → 401.
  - `register` with that e-mail → 201: same `userId`, the name is updated, `pending: false`, the person sees the group in `GET /groups` along with its launches.
  - A second `register` → 409.
  - Removal works.
  - Invalid nickname → 400.
  - Cross-tenant: a non-member gets 404 when inviting.
- **E2E** (`auth.e2e-spec.ts`): keep the duplicate 409 for a real user.
- **Unit:** the `invite` branches in `invitation.service.spec.ts`; `register` (claim and 409) and `validateCredentials` (pending) in `auth.service.spec.ts`.
- **Web** (`grupos/$groupId.members.spec.tsx`):
  - inviting with a nickname sends `{ email, nickname }`;
  - the 400 shows the nickname-field error;
  - the "added" toast;
  - the "Pré-cadastro" badge.
  - Update the `it.each` of errors.
  - Fixtures in `src/test/groups.ts` (`makeMember` with `pending: false`, `pendingInvitation` with `status`).

---

## Docs and CI
- Update **README.md** ("Status dos recursos": group launch due day, pre-registration by invitation; the groups section).
- Update **CLAUDE.md** (Groups: `dueDay`; pre-registration, `User.pending`, register claims the placeholder).
- CI needs no new step: the migrations run through the existing `prisma migrate deploy`.

## Verification
- `apps/api`:
  - `pnpm prisma generate --config prisma7.config.ts`
  - `pnpm lint && pnpm build && pnpm test`
  - `DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm test:e2e`
- `apps/web`: `pnpm lint && pnpm test && pnpm build`.
- Manual check (`pnpm start:dev` on both apps):
  - Pre-registration: invite an unknown e-mail with a nickname, check the badge, launch a split with them, sign up with that e-mail, and confirm the group shows up with the real name.
  - Due day: create a group launch with a due day and see the chip in the list and in the extrato (linked shares).

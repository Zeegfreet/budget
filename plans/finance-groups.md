# Grupos Financeiros (grupos, convites, rateio e balanço por membro)

## Contexto

O CLAUDE.md define desde o início três requisitos ainda não implementados: **grupos financeiros** (finanças compartilhadas, ex.: "República" com Aluguel, Água, Luz), **convites** (o convidado precisa aceitar; a participação pode terminar) e **regras de rateio** (as cotas por membro precisam somar o total). Hoje tudo é pessoal e filtrado por `userId` (`src/budget/`).

Escopo decidido com o usuário:
- Esta entrega cobre grupos, membros, convites, regras de rateio, lançamentos do grupo e o **balanço do grupo por membro**. A integração com o extrato e o dashboard pessoais fica para a próxima entrega. O modelo já guarda a cota de cada usuário por mês para viabilizar essa integração.
- Convites usam o **e-mail de um usuário cadastrado**. O convidado aceita ou recusa numa lista dentro do app; nenhum e-mail é enviado.
- Tipos de rateio: **Igualitário, Percentual, Pesos e Valores fixos**.
- O balanço registra **quem pagou** cada lançamento, no estilo Splitwise: quanto cada um pagou, qual a sua cota e quem deve a quem.

Sugestão de branch: `feat/finance-groups`, a partir da atual.

## Modelo de dados (`apps/api/prisma/schema.prisma`, migration `finance_groups`)

```prisma
enum GroupRole { OWNER MEMBER }
enum InvitationStatus { PENDING ACCEPTED DECLINED CANCELED }
enum SplitType { EQUAL PERCENT WEIGHT FIXED }

model FinanceGroup  { id, name, description?, createdAt, updatedAt, members, invitations, splitMethods, transactions }
model GroupMember   { id, groupId(Cascade), userId(Cascade), role GroupRole, joinedAt, leftAt DateTime?
                      @@unique([groupId, userId]) @@index([userId]) }
model GroupInvitation { id, groupId(Cascade), inviterId(User), inviteeId(User), status, createdAt, respondedAt?
                      @@index([inviteeId, status]) @@index([groupId, status]) }
model SplitMethod   { id, groupId(Cascade), name, type SplitType, active Boolean @default(true), createdAt,
                      shares SplitMethodShare[]  @@unique([groupId, name]) }
model SplitMethodShare { splitMethodId(Cascade), memberId(GroupMember, Cascade), value Int
                      @@id([splitMethodId, memberId]) }
model GroupTransaction { id, groupId(Cascade), kind EntryKind, description String, month String,
                      amountCents Int, splitMethodId Int? (SetNull), paidByMemberId Int? (SetNull),
                      createdById, seriesId String?, createdAt, updatedAt, shares
                      @@index([groupId, month]) @@index([seriesId]) }
model GroupTransactionShare { transactionId(Cascade), memberId(GroupMember), amountCents Int
                      @@id([transactionId, memberId]) @@index([memberId]) }
```

Decisões importantes:
- **A participação é encerrada por soft delete** (`leftAt`). Só quem tem `leftAt = null` tem acesso. O histórico (pagador, cotas) continua apontando para o membro que saiu. Se a pessoa for convidada de novo e aceitar, a mesma linha é reativada.
- **Significado de `SplitMethodShare.value` em cada tipo:**
  - PERCENT: basis points (100% = 10000, permitindo "33,33%"); a soma deve ser 10000.
  - WEIGHT: inteiro ≥ 1.
  - FIXED: centavos.
  - EQUAL: lista de participantes, com `value` ignorado. **EQUAL sem participantes significa todos os membros ativos.** O grupo nasce com a regra padrão "Igualitário (todos)".
- **As cotas são gravadas no lançamento** (`GroupTransactionShare`). Alterar uma regra de rateio não reescreve o histórico; editar o lançamento recalcula as cotas pela regra escolhida. FIXED exige `amountCents == soma` (400 caso contrário).
- `paidByMemberId = null` significa "a pagar". Na despesa, é quem pagou; na receita, é quem recebeu.
- **Saída de membro:**
  - EQUAL/WEIGHT perdem a cota dele e são desativadas se ficarem vazias.
  - PERCENT/FIXED que o incluem são **desativadas** (`active=false`) até serem editadas.
  - Regras inativas não podem ser usadas em lançamentos novos (400).
  - Se o OWNER sair, a posse passa para o membro mais antigo.
  - Se o último membro sair, o grupo é apagado.

## API: novo módulo `apps/api/src/groups/`

Segue o layout do `src/budget/`. O módulo importa `PrismaModule` e `UserModule` e é registrado em `app.module.ts`.

- `group-access.ts`: `assertMember(prisma, userId, groupId)` retorna o `GroupMember` ativo ou lança **404**. `assertOwner` retorna 403 apenas para quem já é membro. Todo endpoint aninhado passa por ele, seguindo o padrão de `assertWritableCategories` (`src/budget/category-access.ts`).
- `split.ts` (puro): `computeShares(totalCents, method, activeMembers)`. Usa o método do **maior resto** com desempate determinístico pela ordem de membro (`joinedAt`, `id`) e garante `Σ = total`. Valida a regra (percentual = 100%, pesos ≥ 1, fixos = total).
- `settlement.ts` (puro): `computeGroupBalance(transactions, members)`. Por membro, devolve `shareCents` (cota de despesas − cota de receitas, contando também as pendentes), `paidCents`, `receivedCents` e `netCents`. O líquido só conta lançamentos pagos: na despesa `pago − cota`, na receita `cota − recebido`, e a soma é 0. `suggestTransfers(nets)` monta transferências gulosas (devedor → credor).
- Reutilizar `addMonths`, `MONTH_PATTERN`, `MAX_REPEAT_MONTHS` (`src/budget/month.ts`), `EntryKind`, `isUniqueViolation` (`src/prisma/errors.ts`) e o padrão `scope ONE|FOLLOWING` de `transaction.service.ts`.
- `UserService`: adicionar `findPublicByEmail(email)` (normaliza o e-mail e usa `select: authUserSelect`).

Endpoints (todos autenticados, dono tirado do `@CurrentUser()`):

| Recurso | Rotas |
|---|---|
| Grupos | `GET /groups` (meus, com papel e nº de membros) · `POST /groups` (cria OWNER + regra padrão) · `GET /groups/:id` (membros, meu `memberId`) · `PATCH /groups/:id` (owner) · `DELETE /groups/:id` (owner) |
| Membros | `POST /groups/:id/leave` · `DELETE /groups/:id/members/:memberId` (owner; não pode remover a si mesmo) |
| Convites (grupo) | `GET /groups/:id/invitations` (pendentes) · `POST /groups/:id/invitations {email}` (404 se não há conta, 409 se já é membro ou já tem convite pendente, 400 se for o próprio usuário) · `DELETE /groups/:id/invitations/:invId` (cancelar) |
| Convites (recebidos) | `GET /invitations` (pendentes, com nome do grupo e de quem convidou) · `POST /invitations/:id/accept` · `POST /invitations/:id/decline` (404 se o usuário não é o convidado ou o convite não está pendente) |
| Regras de rateio | `GET/POST /groups/:id/split-methods` · `PATCH/DELETE /groups/:id/split-methods/:methodId` (409 em nome duplicado; os shares referenciam membros ativos do grupo) |
| Lançamentos | `GET /groups/:id/transactions?month=` (com shares, pagador, `series`) · `POST` (`kind, description, month, amountCents>0, splitMethodId, paidByMemberId?, repeatMonths 1–60`) · `PATCH /:txId?scope=` (recalcula as cotas) · `DELETE /:txId?scope=` · `PUT /:txId/payment {memberId}` · `DELETE /:txId/payment` |
| Balanço | `GET /groups/:id/balance?month=` → `{ month, incomeCents, expenseCents, pendingCents, members:[{memberId,name,active,shareCents,paidCents,receivedCents,netCents}], transfers:[{fromMemberId,toMemberId,amountCents}] }` |

O balanço é **mensal**. Registrar acertos entre membros e mostrar saldo acumulado ficam para depois.

Testes:
- **Unitários:** `split.spec.ts` (arredondamento, todos os tipos, erros), `settlement.spec.ts`, specs dos services (com `PrismaService` mockado) e dos controllers.
- **E2E**, em `test/groups.e2e-spec.ts`, `test/group-invitations.e2e-spec.ts` e `test/group-transactions.e2e-spec.ts`. Reutilizam os helpers `userBody`/`signUp` (passam para `test/utils.ts` se forem compartilhados). Cobrem:
  - CRUD, validação (campos desconhecidos/inválidos) e 404.
  - Fluxo convidar → aceitar ou recusar → acesso.
  - Saída ou remoção revoga o acesso.
  - Regras inválidas (≠100%, fixos ≠ total).
  - Recorrência com escopo.
  - Pagamento e balanço somando zero.
  - **Isolamento:** usuário B (não membro), um convidado ainda pendente e um ex-membro recebem 404 em todas as rotas de leitura, escrita e exclusão do grupo de A.
- `test/utils.ts` → `resetDatabase`: incluir as tabelas novas em ordem segura de FK (shares → transactions → split shares → split methods → invitations → members → groups, antes de `user`).

## Web: `apps/web/src/features/groups/`

- `types.ts`, `api.ts`, `queries.ts`:
  - `groupQueries.all()` = `['groups']`
  - `detail(id)` = `['groups', id]`
  - `transactions(id, m)` = `['groups', id, 'transactions', m]`
  - `balance(id, m)` = `['groups', id, 'balance', m]`
  - `invitationQueries.received()` = `['invitations']`
- `hooks.ts`: `useGroupActions`, `useInvitationActions`, `useSplitMethodActions` e `useGroupTransactionActions`. Seguem o padrão de `useTransactionActions` (invalidar o prefixo `['groups', id]` + toast do sonner).
- `errors.ts` (mensagens em PT, como em `transactions/errors.ts`) e `split.ts` (prévia das cotas no formulário, com o mesmo algoritmo do backend).
- Percentuais: o input usa `parseMoneyInput`/`formatAmount` (`src/lib/money.ts`), porque centésimos equivalem a basis points ("33,33" → 3333).

Rotas:
- `src/routes/_app/grupos/index.tsx` (`/grupos`):
  - Card **Convites recebidos** (aceitar/recusar).
  - Lista **Meus grupos** (nome, nº de membros, papel).
  - Botão **Novo grupo**.
- `src/routes/_app/grupos/$groupId.tsx`: cabeçalho com nome e ações (renomear, sair, excluir), `MonthSwitcher` (`?month=`) e **Tabs** (`pnpm dlx shadcn@latest add tabs`):
  1. **Lançamentos**: Receitas/Despesas do mês, com regra, pagador ou "a pagar" e cotas por membro. Os botões Nova receita/despesa e Marcar como pago (escolhendo o membro) ficam aqui. Editar ou excluir passa pelo `RecurrenceScopeDialog` já existente.
  2. **Balanço**: por membro mostra cota, pagou/recebeu e líquido ("a receber" ou "deve"), além da lista "Fulano paga R$ X a Ciclano".
  3. **Membros**: lista, convites pendentes (cancelar), Convidar por e-mail e Remover (owner).
  4. **Rateio**: regras com tipo e distribuição; criar ou editar com campos por membro, validação em tempo real (soma 100% / total fixo) e selo de "inativa".
- `src/lib/navigation.ts`: adicionar `{ label: 'Grupos', to: '/grupos', icon: UsersIcon }`.

Componentes (respeitando a ordem atômica):
- **Moléculas:** `GroupFormDialog`, `InviteMemberDialog`, `SplitMethodFormDialog`, `GroupTransactionFormDialog` e `PaymentDialog`. Usam `FormField`, `MoneyInput`, `NativeSelect`, `FormAlert` e `ConfirmDialog`, com formulário em `useState` como no `TransactionFormDialog`.
- **Organismos:** `GroupList`, `InvitationList`, `GroupTransactionList`, `GroupBalancePanel`, `GroupMembersPanel`, `SplitMethodsPanel` e `GroupDialogs`.

Testes:
- `src/test/groups.ts` com `makeGroup`/`makeMember`/`makeSplitMethod`/`makeGroupTransaction` e `stubGroupsApi()`.
- Specs de rota, cada uma com `vi.mock('@/features/groups/api')`:
  - `grupos/index.spec.tsx`: criar grupo, aceitar e recusar convite, estado vazio.
  - `$groupId.spec.tsx`: lançamentos (criar, pagar, recorrência com escopo) e balanço.
  - `$groupId.members.spec.tsx`: convidar, erros 404/409, remover, sair.
  - `$groupId.split.spec.tsx`: regras e validação de soma.
- Unitário: `features/groups/split.spec.ts`.

## Documentação e CI

- `README.md` (PT): na tabela "Status dos recursos", adicionar Grupos, Convites, Rateio e Balanço do grupo; descrever as novas rotas da API e as telas.
- `CLAUDE.md`: seções **Groups** em API architecture e Web architecture (modelo, `assertMember`, cotas gravadas no lançamento, semântica do EQUAL vazio e dos basis points, chaves de query, helpers de teste).
- `.github/workflows/ci.yml`: nenhum passo novo (o `migrate deploy` já aplica a migration). Conferir apenas que o job web continua gerando as rotas novas.

## Ordem de implementação

0. Salvar este plano em `plans/finance-groups.md` (pasta `plans/` na raiz do projeto).
1. Schema, migration e `prisma generate`; `resetDatabase`.
2. `split.ts` e `settlement.ts` com specs.
3. Grupos, membros e `assertMember`, depois convites, regras e lançamentos/balanço; cada etapa com unit + e2e.
4. Web: feature, rotas, componentes e specs.
5. README, CLAUDE.md, lint, build e todos os testes.

## Verificação

- `apps/api`: `pnpm prisma migrate dev --name finance_groups --config prisma7.config.ts` e `pnpm lint && pnpm build && pnpm test`, depois `DATABASE_URL=file:./test.db pnpm prisma migrate deploy --config prisma7.config.ts && DATABASE_URL=file:./test.db pnpm test:e2e`.
- `apps/web`: `pnpm generate:routes && pnpm lint && pnpm test && pnpm build`.
- Manual, com dois usuários (API + web em dev):
  1. A cria "República" e convida B por e-mail.
  2. B aceita em /grupos.
  3. A cria a regra "A 30% / B 70%" e lança "Aluguel R$ 2.000" recorrente por 12 meses, pago por A.
  4. O balanço deve mostrar "B paga R$ 1.400 a A".
  5. B sai do grupo: perde o acesso (404) e a regra percentual fica inativa.

# Recorrência sem término, com reajuste e encerramento

## Context
Hoje um lançamento recorrente é uma **série finita**, com até 60 ocorrências (`MAX_REPEAT_MONTHS`) criadas de uma vez pelo `repeatMonths`, e um `seriesId` liga as ocorrências. Já existem três peças que este plano reaproveita:
- O **reajuste manual** é feito editando uma ocorrência com `scope: FOLLOWING`. A mudança vale para ela e para as próximas pendentes.
- O **encerramento** é feito com `PUT /:id/series { untilMonth }`, que usa `planSeriesEnd` em `src/budget/series.ts`.
- **Grupos** têm o mesmo mecanismo (`group-transaction.service.ts`).

O que falta para "auto preencher sempre no futuro":
1. Uma série **sem data de término**, que gera os meses futuros sozinha.
2. Um **reajuste programado em %**, por exemplo +5% a cada 12 meses, a partir do mês do aniversário do contrato.
3. O reajuste manual e o encerramento devem conviver com a geração automática.

Decisões do usuário:
- Vale para lançamentos pessoais e de grupo.
- O reajuste manual continua como hoje: o usuário edita o valor no mês do reajuste, com "esta e as próximas", e o novo valor segue para frente. O % programado também entra.
- As ocorrências são geradas por um **horizonte móvel**: a regra fica salva e vira `Transaction`/`GroupTransaction` sob demanda. Assim, grade, extrato, faturas, resumo e análise continuam lendo as tabelas de sempre.

## Modelo (migração `recurrence`)
Novos modelos, um por dono, sem misturar pessoal e grupo:
```prisma
model Recurrence {            // pessoal
  id                Int     @id @default(autoincrement())
  userId            Int     // dono, para escopar as queries
  seriesId          String  @unique   // a série que ela alimenta
  endMonth          String? // null = sem término
  generatedUntil    String  // último mês já materializado (só avança)
  adjustPercentBp   Int?    // reajuste programado em pontos-base (500 = 5%)
  adjustEveryMonths Int?    // periodicidade (ex.: 12)
  adjustFirstMonth  String? // 1º mês em que o reajuste incide; os seguintes são first + k·every
  @@index([userId])
}
model GroupRecurrence { /* mesmos campos, com groupId no lugar de userId */ }
```
Os modelos têm cascade com `User`/`FinanceGroup`. A regra **não guarda valor**: o molde é sempre a última ocorrência materializada, como `setSeriesEnd` já faz. Por isso a edição manual com FOLLOWING alimenta a geração futura sem nenhum passo extra.

## Lógica pura: `src/recurrence/recurrence.ts`
- `adjustmentMonths(rule, from, to)` lista os meses de aniversário no intervalo.
- `nextAmount(prevCents, month, rule)` multiplica `prev × (10000 + bp) / 10000` nos meses de aniversário, com arredondamento inteiro (meio para cima) e **composto passo a passo**. Nos outros meses, devolve `prev`.
- `projectAmounts(baseCents, fromMonth, months, rule)` calcula a sequência de valores a partir de uma base. É usada pela geração e pelo FOLLOWING.
- `monthsToGenerate(rule, until)` vai de `generatedUntil + 1` até `min(until, endMonth)`.
- Horizonte: `until = max(mês pedido, currentMonth() + MAX_MONTH_SPAN − 1)`. O mês pedido tem teto de `currentMonth() + 120` (`MAX_GENERATION_AHEAD`), para que um GET em 2999 não gere milhares de linhas.

Unit tests em `recurrence.spec.ts`: aniversários, juros compostos, arredondamento, fim antes do horizonte e regra sem reajuste.

## `RecurrenceModule` (`src/recurrence/`, importa só `PrismaModule`)
O módulo fica separado para evitar ciclo entre `BudgetModule` e `GroupsModule`. `RecurrenceService` oferece:
- `ensureForUser(userId, untilMonth)` cobre as regras pessoais do usuário e as dos grupos em que ele é membro ativo.
- `ensureForGroup(groupId, untilMonth)` cobre só as regras do grupo.

A primeira query é barata (`generatedUntil < until AND (endMonth IS NULL OR endMonth > generatedUntil)`) e, quase sempre, não encontra nada.

Para cada regra pendente, numa transação interativa:
1. `SELECT … FOR UPDATE` na regra, para serializar leituras concorrentes. Depois, relê `generatedUntil`.
2. Pega a última ocorrência como molde.
3. Cria os meses que faltam com `nextAmount`, pulando meses em que a série já tem ocorrência (por exemplo, uma criada pela grade).
4. Avança `generatedUntil`.

No **pessoal**, a regra é pulada se a categoria estiver inativa: inativar uma categoria pausa a geração.

No **grupo**, as cotas das novas ocorrências **seguem o grupo atual**, como `resplit.ts` faz para pendentes. Elas usam a regra de rateio do molde com `computeShares` (`src/groups/split.ts`, puro). Se a regra estiver inativa ou removida, as cotas ficam iguais entre os membros ativos. As ocorrências novas ficam sem pagador.

Os ganchos ficam nas entradas de leitura, com uma chamada por request e o maior mês pedido:
- `TransactionService.list`/`listByPaymentMethod`
- `BudgetService` entries/lines/summary
- as faturas em `PaymentMethodService`
- `linkedShareCells`/`GroupStatementService`
- `GroupTransactionService.list`/`balance` (`ensureForGroup`)

## API pessoal (`src/budget/`)
- **`CreateTransactionDto`** ganha `openEnded?: boolean`, que é 400 junto com `repeatMonths > 1`. Ganha também `adjustment?: { percentBp 1–10000, everyMonths 1–60, firstMonth? }`; o `firstMonth` padrão é `month + everyMonths`. O `adjustment` sem `openEnded` também vale: a série finita aplica o % já na criação.
  - **Com `openEnded`**, o serviço cria o `seriesId` e a `Recurrence` (`generatedUntil = month`) e gera até o horizonte, tudo na mesma transação.
- **`PUT /:id/series`**: o `untilMonth` passa a aceitar `null`, que quer dizer "sem término", e o corpo ganha `adjustment?` (`null` remove).
  - **Série com regra:** grava `endMonth`, apaga as pendentes depois dele com o mesmo 409 de `planSeriesEnd` se alguma estiver realizada, e ajusta `generatedUntil = min(generatedUntil, endMonth)`. O limite de 60 meses não se aplica, porque a geração é preguiçosa.
  - **Série finita que vira sem término:** cria a regra.
  - **Sem regra:** o comportamento atual continua.
- **`update` com FOLLOWING e `plannedCents`** numa série com reajuste %: as próximas pendentes recebem `projectAmounts(novoValor, mês editado)`, uma a uma, em vez de um `updateMany` com valor fixo. O valor digitado substitui o reajuste do mês, sem acumular os dois. Sem % na regra, nada muda: o `updateMany` atual continua valendo, e a geração futura copia o molde.
- **`remove` com FOLLOWING** numa série com regra: encerra a recorrência, gravando `endMonth = mês − 1` (ou apagando a regra se nada sobrar). Com `ONE`, apaga só o mês, que não volta, porque `generatedUntil` já passou dele.
- **`SeriesPositionDto`** ganha `recurrence: { endMonth: string | null; adjustment: {...} | null } | null`. Para uma série sem término, `count`/`lastMonth` são os do que já foi materializado. São três cópias de `present` (pessoal, grupo e `group-statement.service.ts`).
- **`PlanService`**: `createLines` passa `openEnded`/`adjustment` adiante (`dto/save-plan.dto.ts`).

## API de grupos (`src/groups/`)
- O mesmo vale para `CreateGroupTransactionDto`, `PUT …/series` e FOLLOWING/remove em `group-transaction.service.ts`. FOLLOWING com `amountCents` recalcula as cotas de cada pendente com o valor projetado.
- `adjustment` com uma regra de rateio **FIXED** é 400, porque o total é a soma dos valores fixos e `resplitPending` o sobrescreveria.
- Tudo passa por `assertMember` (404).

## Web
- **Molecule `RecurrenceFields`**, compartilhada por `TransactionFormDialog`, `BudgetLineDialogs` e `GroupTransactionFormDialog`:
  - o campo "Repetir" passa a ter três opções: Não / Por N meses / **Sem data de término**;
  - o "Reajuste automático" é um switch com % (via `parseMoneyInput`, como no rateio, em pontos-base), "a cada N meses" e o primeiro mês.
- **`SeriesBadge`** mostra `3 · ∞` para uma série sem término e um ícone de reajuste quando ele existe.
- **`SeriesRangeDialog`** ganha a opção "Sem término" e edita o reajuste. Ele chama `setSeriesEnd` com `untilMonth: null`/`adjustment`.
- **`RecurrenceScopeDialog`**:
  - ao excluir "esta e as próximas" de uma série sem término, avisa que isso **encerra a recorrência**;
  - ao mudar o valor de uma série com %, avisa que os próximos reajustes vão incidir sobre o novo valor.
- Os tipos ficam em `features/transactions/types.ts`, `features/groups/types.ts` e `features/budget/plan.ts`, que repassa os campos em `createLines`. As mensagens novas da API são traduzidas nos helpers de erro.

## Testes, CI e docs
- **Unit:** `recurrence.spec.ts`, `RecurrenceService` com Prisma mockado, e os specs de transaction/group-transaction service.
- **E2E `test/recurrence.e2e-spec.ts`**, com `currentMonth` mockado:
  - criar uma série sem término gera até o horizonte, e ler um mês mais distante gera até ele;
  - duas leituras em paralelo não duplicam ocorrências;
  - o reajuste % é aplicado no aniversário;
  - FOLLOWING com um novo valor é propagado e reprojeta o %, e os meses gerados depois copiam o novo valor;
  - excluir com ONE não faz o mês reaparecer;
  - excluir com FOLLOWING encerra a recorrência;
  - `PUT series` com um mês fecha a série, e com `null` a reabre; com uma ocorrência realizada depois do fim, devolve 409;
  - validações 400: `openEnded` com `repeatMonths`, `adjustment` inválido, categoria inativa;
  - **o usuário B recebe 404** ao ler, editar ou apagar a série de A.
- **E2E `test/group-recurrence.e2e-spec.ts`:**
  - as cotas dos meses gerados incluem um membro que entrou depois;
  - FIXED com `adjustment` é 400;
  - quem não é membro recebe 404;
  - os meses gerados aparecem nas cotas do orçamento e na fatura.
- **Web:** um spec do formulário (sem término + reajuste) em `extrato.spec`, mais o badge, o diálogo de intervalo e a grade (`index.categories.spec`), e o formulário de grupo.
- **CI:** não precisa mudar. A migração entra pelo `prisma migrate deploy` que já existe.
- **Docs:** atualizar o README ("Status dos recursos") e o CLAUDE.md (Budget/Groups: `Recurrence`, horizonte, ganchos de leitura).

## Verificação
1. `pnpm --filter api prisma migrate dev --name recurrence --config prisma7.config.ts`, depois `generate`.
2. `pnpm --filter api lint && pnpm --filter api test && pnpm --filter api test:e2e`
3. `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`
4. **Manual**, com `pnpm start:dev` nos dois apps:
   1. Criar "Aluguel" sem término, com +5% a cada 12 meses.
   2. Abrir o Dashboard com um período de 24 meses à frente e ver o reajuste no aniversário.
   3. Editar o valor de um mês com "esta e as próximas" e ver os meses seguintes reprojetados.
   4. Encerrar a série pelo badge.

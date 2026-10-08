import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BudgetGridToolbar, EmptyState, GroupLinkDialog, MonthRangePicker } from '@/components/molecules'
import {
  BalanceSummary,
  BudgetDialogs,
  BudgetGrid,
  BudgetLineDialogs,
  ExpenseBreakdownTable,
  GoalsPanel,
  GroupStatementsCard,
  MonthlyTrendChart,
  SaveBar,
  type BudgetDialog,
  type GridAction,
  type LineDialog,
} from '@/components/organisms'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { authQueries } from '@/features/auth/queries'
import { buildExpenseBreakdown, buildMonthlyTrend } from '@/features/budget/analytics'
import { savePlan } from '@/features/budget/api'
import { buildGoalsOverview } from '@/features/budget/goals'
import {
  useBudgetPlan,
  useInitialBalance,
  usePlanCategoryActions,
  usePlanLineActions,
  useUnsavedChangesGuard,
  type GuardedLocation,
} from '@/features/budget/hooks'
import {
  endOfYear,
  formatMonthLabel,
  formatMonthLong,
  monthsBetween,
  parseRange,
  type MonthRange,
} from '@/features/budget/months'
import { budgetQueries } from '@/features/budget/queries'
import { buildBudgetTable, lineTarget } from '@/features/budget/rows'
import type { GroupStatement, Month } from '@/features/budget/types'
import { groupErrorMessage } from '@/features/groups/errors'
import { useGroupActions } from '@/features/groups/hooks'
import { EMPTY_LINK, statementLink } from '@/features/groups/link'
import { knownPaymentMethodMessage } from '@/features/payment-methods/errors'
import { usePaymentMethodOptions } from '@/features/payment-methods/hooks'
import { ApiError } from '@/lib/api/client'

/** The API's answer to a duplicate type or category name */
const DUPLICATE_NAME = 'An item with this name already exists'

const TABS = ['planejamento', 'analise'] as const
type DashboardTab = (typeof TABS)[number]

interface DashboardSearch {
  /** Open tab; the planning table when absent */
  tab?: DashboardTab
  /** Period (`YYYY-MM`, both or neither); the current month and the 11 after it when absent */
  from?: Month
  to?: Month
}

/** Tabs share the page's draft: only a new period (or another page) may discard it */
const keepsDraft = (current: GuardedLocation, next: GuardedLocation) =>
  next.pathname === current.pathname && sameRange(parseRange(current.search), parseRange(next.search))

const sameRange = (a: MonthRange, b: MonthRange) => a.from === b.from && a.to === b.to

export const Route = createFileRoute('/_app/')({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => {
    const range = parseRange(search)
    // A period the page can't use is dropped (the default one applies)
    const valid = range.from === search.from && range.to === search.to
    return {
      tab: TABS.includes(search.tab as DashboardTab) ? (search.tab as DashboardTab) : undefined,
      ...(valid ? range : {}),
    }
  },
  loaderDeps: ({ search }) => parseRange(search),
  loader: async ({ context: { queryClient }, deps: { from, to } }) => {
    const months = monthsBetween(from, to)
    await Promise.all([
      queryClient.ensureQueryData(budgetQueries.categories()),
      queryClient.ensureQueryData(budgetQueries.entries(from, to)),
      queryClient.ensureQueryData(budgetQueries.lines(from, to)),
      queryClient.ensureQueryData(budgetQueries.summary(months[0])),
      queryClient.ensureQueryData(budgetQueries.groupStatements(months[0])),
    ])
    return { months }
  },
  component: DashboardPage,
  errorComponent: DashboardError,
})

function DashboardPage() {
  const { months } = Route.useLoaderData()
  // A new period starts with a new draft (leaving it asks first)
  return <Dashboard key={`${months[0]}:${months.at(-1)}`} months={months} />
}

function Dashboard({ months }: { months: Month[] }) {
  const month = months[0]
  const { tab = 'planejamento' } = Route.useSearch()
  const navigateHere = Route.useNavigate()
  const queryClient = useQueryClient()
  const { data: user } = useQuery(authQueries.me())
  const { data: savedGroups } = useSuspenseQuery(budgetQueries.categories())
  const [from, to] = [months[0], months[months.length - 1]]
  const { data: entries } = useSuspenseQuery(budgetQueries.entries(from, to))
  const { data: savedLines } = useSuspenseQuery(budgetQueries.lines(from, to))
  const { data: summary } = useSuspenseQuery(budgetQueries.summary(month))
  const { data: groupStatements } = useSuspenseQuery(budgetQueries.groupStatements(month))

  // Every change of the planning table (tree, goals, launches, values) stays
  // in this plan until "Salvar"
  const base = useMemo(() => ({ groups: savedGroups, lines: savedLines }), [savedGroups, savedLines])
  const draft = useBudgetPlan(base, entries, months)
  const { groups, lines } = draft
  const dirty = draft.count > 0
  useUnsavedChangesGuard(dirty, keepsDraft)

  const table = buildBudgetTable(
    groups,
    lines,
    months,
    { line: draft.value, groupShare: draft.groupShare },
    summary.openingBalanceCents,
  )
  const goals = buildGoalsOverview(table)
  // The cards use the effective amounts (realized ones count) plus the plan's
  // effect on the current month, so they react while planning
  const saved = buildBudgetTable(
    savedGroups,
    savedLines,
    [month],
    { line: draft.savedValue, groupShare: draft.groupShare },
    0,
  )
  const incomes = summary.incomeCents + table.incomes[0] - saved.incomes[0]
  const expenses = summary.expenseCents + table.expenses[0] - saved.expenses[0]

  const [showInactive, setShowInactive] = useState(false)
  const [dialog, setDialog] = useState<BudgetDialog>(null)
  const [lineDialog, setLineDialog] = useState<LineDialog>(null)
  const navigate = useNavigate()
  const changeSearch = (search: DashboardSearch) => navigateHere({ search: (prev) => ({ ...prev, ...search }) })
  const lineActions = usePlanLineActions(draft.dispatch)
  const launchMethods = usePaymentMethodOptions(month, lineDialog !== null && lineDialog.type !== 'delete-line')
  const [linking, setLinking] = useState<GroupStatement | null>(null)
  const linkMethods = usePaymentMethodOptions(month, linking !== null)
  const groupActions = useGroupActions()
  const actions = usePlanCategoryActions(groups, draft.dispatch)

  function handleGridAction(action: GridAction) {
    switch (action.type) {
      case 'toggle-group':
        return actions.updateGroup(action.group.id, { active: !action.group.active })
      case 'toggle-category':
        return actions.updateCategory(action.category.id, { active: !action.category.active })
      case 'create-line':
        return setLineDialog({ type: 'create-line', categoryId: action.category.id, kind: action.kind })
      case 'edit-line':
      case 'delete-line':
        return setLineDialog(action)
      case 'open-line':
        return navigate({ to: '/extrato', search: { month: lineTarget(action.line.line).month } })
      default:
        setDialog(action)
    }
  }

  const save = useMutation({
    mutationFn: () => savePlan(draft.request()),
    onSuccess: async () => {
      // Drop the edits only once the saved values are back, so cells don't flicker
      await queryClient.invalidateQueries({ queryKey: budgetQueries.all() })
      draft.dispatch({ type: 'discard' })
      toast.success('Alterações salvas')
    },
  })

  const saveInitialBalance = useInitialBalance()

  const firstName = user?.name.split(' ')[0]
  const monthLabel = formatMonthLabel(month)
  const periodLabel = `${monthLabel} a ${formatMonthLabel(to)}`
  // The analysis shows what is saved; the draft only lives in the planning tab
  const trend = buildMonthlyTrend(savedGroups, entries, months, summary.openingBalanceCents)
  const breakdown = buildExpenseBreakdown(savedGroups, entries, months)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            {firstName ? `Olá, ${firstName}! ` : ''}Este é o seu balanço de {formatMonthLong(month)}.
          </p>
        </div>
        <MonthRangePicker from={month} to={to} onChange={(range) => changeSearch(range)} />
      </div>

      <Tabs value={tab} onValueChange={(value) => changeSearch({ tab: value as DashboardTab })} className="gap-6">
        <TabsList>
          <TabsTrigger value="planejamento">Planejamento</TabsTrigger>
          <TabsTrigger value="analise">Análise</TabsTrigger>
        </TabsList>

        {/* Kept mounted while hidden, so expanded rows survive a look at the analysis */}
        <TabsContent value="planejamento" forceMount className="flex flex-col gap-6 data-[state=inactive]:hidden">
          <GoalsPanel
            overview={goals}
            monthLabel={formatMonthLong(month)}
            periodLabel={periodLabel}
            onEditGoals={() => setDialog({ type: 'goals' })}
          />

          <BalanceSummary
            openingCents={summary.openingBalanceCents}
            incomeCents={incomes}
            expenseCents={expenses}
            initialBalanceCents={summary.initialBalanceCents}
            onSaveInitialBalance={saveInitialBalance}
          />

          {groupStatements.length > 0 && (
            <GroupStatementsCard statements={groupStatements} month={month} onLink={setLinking} />
          )}

          <Card className="gap-0 pb-0">
            <CardHeader className="pb-4">
              <CardTitle>Planejamento mensal</CardTitle>
              <CardDescription>
                Expanda uma categoria para ver os lançamentos dela e clique em um valor previsto para
                editar; cada linha é um lançamento (recorrente ou avulso) e aparece também no Extrato. Valores
                já realizados (marcados com ✓) substituem o previsto e são alterados no Extrato. Use o
                menu da célula (ou o botão direito) para replicar para os meses seguintes, e o menu de cada
                linha para criar, editar, inativar ou excluir. Teste seus cenários à vontade: nada é gravado
                (valores, tipos, categorias, lançamentos ou metas) até clicar em Salvar.
              </CardDescription>
              <CardAction>
                <BudgetGridToolbar
                  showInactive={showInactive}
                  onShowInactiveChange={setShowInactive}
                  onCreateGroup={(kind) => setDialog({ type: 'create-group', kind })}
                />
              </CardAction>
            </CardHeader>
            <CardContent className="border-t px-0">
              <BudgetGrid
                table={table}
                months={months}
                showInactive={showInactive}
                onAction={handleGridAction}
                isChanged={draft.isChanged}
                isRealized={draft.isRealized}
                isPending={draft.isPending}
                onChange={(anchorId, m, amountCents) => draft.dispatch({ type: 'set', anchorId, month: m, amountCents })}
                onFill={(anchorId, start, scope) => {
                  const until = scope === 'year' ? endOfYear(start) : to
                  draft.dispatch({
                    type: 'fill',
                    anchorId,
                    // Realized months keep their amount
                    months: months.filter((m) => m > start && m <= until && !draft.isRealized(anchorId, m)),
                    amountCents: draft.value(anchorId, start),
                  })
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analise" className="flex flex-col gap-6">
          {dirty && (
            <p className="text-sm text-muted-foreground">
              A análise mostra apenas valores salvos; salve o planejamento para incluir as alterações pendentes.
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Evolução mensal</CardTitle>
              <CardDescription>
                Receitas, despesas, saldo do mês e saldo acumulado (a partir do saldo de abertura de{' '}
                {monthLabel}), de {periodLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyTrendChart data={trend} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Despesas por categoria</CardTitle>
              <CardDescription>
                O valor de {monthLabel}, o total de {periodLabel} e quanto cada categoria representa nesse
                total. Valores realizados substituem o previsto e os rateios de grupos vinculados entram na
                categoria.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExpenseBreakdownTable breakdown={breakdown} monthLabel={monthLabel} periodLabel={periodLabel} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SaveBar
        count={draft.count}
        saving={save.isPending}
        error={save.error ? saveErrorMessage(save.error) : undefined}
        onSave={() => save.mutate()}
        onDiscard={() => {
          save.reset()
          draft.dispatch({ type: 'discard' })
        }}
      />

      <BudgetDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        actions={actions}
        goalTargets={groups
          .filter((g) => g.kind === 'EXPENSE' && g.active)
          .map(({ id, name, goalPercent }) => ({ id, name, goalPercent }))}
      />

      <BudgetLineDialogs
        dialog={lineDialog}
        onClose={() => setLineDialog(null)}
        month={month}
        groups={groups}
        paymentMethods={launchMethods}
        actions={lineActions}
      />

      <GroupLinkDialog
        open={linking !== null}
        onOpenChange={(open) => !open && setLinking(null)}
        groupName={linking?.group.name ?? ''}
        categories={groups}
        paymentMethods={linkMethods}
        groupCategories={linking?.groupCategories ?? []}
        initial={linking ? statementLink(linking) : EMPTY_LINK}
        onSubmit={(link) => groupActions.setLink(linking!.group.id, link)}
        errorMessage={(error) => groupErrorMessage(error, 'Não foi possível salvar o vínculo.')}
      />
    </div>
  )
}

/** Why the plan wasn't saved (nothing was: the API saves it all or nothing) */
function saveErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível salvar as alterações.'
  if (error.status === 409 && error.messages.includes(DUPLICATE_NAME)) {
    return 'Não foi possível salvar: já existe um item com esse nome.'
  }
  if (error.status === 404) return 'Não foi possível salvar: algum item não existe mais. Atualize a página.'
  return `Não foi possível salvar: ${knownPaymentMethodMessage(error) ?? error.messages.join(' ')}`
}

function DashboardError() {
  const router = useRouter()
  return (
    <EmptyState
      title="Não foi possível carregar o dashboard"
      description="Verifique sua conexão e tente novamente."
      action={<Button onClick={() => router.invalidate()}>Tentar novamente</Button>}
    />
  )
}

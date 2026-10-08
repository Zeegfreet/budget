import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { BudgetGridToolbar, EmptyState, GroupLinkDialog } from '@/components/molecules'
import {
  BalanceSummary,
  BudgetDialogs,
  BudgetGrid,
  BudgetLineDialogs,
  GoalsPanel,
  GroupStatementsCard,
  SaveBar,
  type BudgetDialog,
  type GridAction,
  type LineDialog,
} from '@/components/organisms'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authQueries } from '@/features/auth/queries'
import { saveLines, updateInitialBalance } from '@/features/budget/api'
import { buildGoalsOverview } from '@/features/budget/goals'
import { useBudgetDraft, useCategoryActions, useCategoryToggle, useUnsavedChangesGuard } from '@/features/budget/hooks'
import { currentMonth, endOfYear, formatMonthLabel, formatMonthLong, monthWindow } from '@/features/budget/months'
import { budgetQueries } from '@/features/budget/queries'
import { buildBudgetTable, lineTarget } from '@/features/budget/rows'
import type { GroupStatement } from '@/features/budget/types'
import { groupErrorMessage } from '@/features/groups/errors'
import { useGroupActions } from '@/features/groups/hooks'
import { statementLink } from '@/features/groups/link'
import { usePaymentMethodOptions } from '@/features/payment-methods/hooks'
import { useTransactionActions } from '@/features/transactions/hooks'
import { ApiError } from '@/lib/api/client'

/** The grid shows the current month and the 11 after it */
const WINDOW_MONTHS = 12

export const Route = createFileRoute('/_app/')({
  loader: async ({ context: { queryClient } }) => {
    const months = monthWindow(currentMonth(), WINDOW_MONTHS)
    const [from, to] = [months[0], months[months.length - 1]]
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
  const month = months[0]
  const queryClient = useQueryClient()
  const { data: user } = useQuery(authQueries.me())
  const { data: groups } = useSuspenseQuery(budgetQueries.categories())
  const [from, to] = [months[0], months[months.length - 1]]
  const { data: entries } = useSuspenseQuery(budgetQueries.entries(from, to))
  const { data: lines } = useSuspenseQuery(budgetQueries.lines(from, to))
  const { data: summary } = useSuspenseQuery(budgetQueries.summary(month))
  const { data: groupStatements } = useSuspenseQuery(budgetQueries.groupStatements(month))

  const draft = useBudgetDraft(lines, entries)
  const dirty = draft.changes.length > 0
  useUnsavedChangesGuard(dirty)

  const table = buildBudgetTable(
    groups,
    lines,
    months,
    { line: draft.value, groupShare: draft.groupShare },
    summary.openingBalanceCents,
  )
  const goals = buildGoalsOverview(table)
  // The cards use the effective amounts (realized ones count) plus the unsaved
  // grid edits of the current month, so they react while typing
  const saved = buildBudgetTable(groups, lines, [month], { line: draft.savedValue, groupShare: draft.groupShare }, 0)
  const incomes = summary.incomeCents + table.incomes[0] - saved.incomes[0]
  const expenses = summary.expenseCents + table.expenses[0] - saved.expenses[0]

  const [showInactive, setShowInactive] = useState(false)
  const [dialog, setDialog] = useState<BudgetDialog>(null)
  const [lineDialog, setLineDialog] = useState<LineDialog>(null)
  const navigate = useNavigate()
  const transactionActions = useTransactionActions()
  const launchMethods = usePaymentMethodOptions(month, lineDialog !== null && lineDialog.type !== 'delete-line')
  const [linking, setLinking] = useState<GroupStatement | null>(null)
  const linkMethods = usePaymentMethodOptions(month, linking !== null)
  const groupActions = useGroupActions()
  // Rows of categories that can no longer take values lose their unsaved edits
  const actions = useCategoryActions((categoryIds) =>
    draft.dispatch({
      type: 'forget',
      anchorIds: lines.filter((l) => categoryIds.includes(l.categoryId)).map((l) => l.anchorId),
    }),
  )

  const { toggleGroup, toggleCategory } = useCategoryToggle(actions)

  function handleGridAction(action: GridAction) {
    switch (action.type) {
      case 'toggle-group':
        return toggleGroup(action.group)
      case 'toggle-category':
        return toggleCategory(action.category)
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
    mutationFn: () => saveLines(draft.changes),
    onSuccess: async () => {
      // Drop the edits only once the saved values are back, so cells don't flicker
      await queryClient.invalidateQueries({ queryKey: budgetQueries.all() })
      draft.dispatch({ type: 'discard' })
      toast.success('Alterações salvas')
    },
  })

  async function saveInitialBalance(cents: number) {
    await updateInitialBalance(cents)
    await queryClient.invalidateQueries({ queryKey: budgetQueries.summary(month).queryKey })
  }

  const firstName = user?.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          {firstName ? `Olá, ${firstName}! ` : ''}Este é o seu balanço de {formatMonthLong(month)}.
        </p>
      </div>

      <GoalsPanel
        overview={goals}
        monthLabel={formatMonthLong(month)}
        periodLabel={`${formatMonthLabel(months[0])} a ${formatMonthLabel(months[months.length - 1])}`}
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
            editar; cada linha é um lançamento (recorrente ou avulso) e aparece também no Extrato. Use o
            menu da célula (ou o botão direito) para replicar para os meses seguintes, e o menu de cada
            linha para criar, editar, inativar ou excluir. As alterações nos valores só valem depois de
            salvar.
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
            onChange={(anchorId, m, amountCents) => draft.dispatch({ type: 'set', anchorId, month: m, amountCents })}
            onFill={(anchorId, start, scope) => {
              const until = scope === 'year' ? endOfYear(start) : to
              draft.dispatch({
                type: 'fill',
                anchorId,
                months: months.filter((m) => m > start && m <= until),
                amountCents: draft.value(anchorId, start),
              })
            }}
          />
        </CardContent>
      </Card>

      <SaveBar
        count={draft.changes.length}
        saving={save.isPending}
        error={
          save.error
            ? save.error instanceof ApiError
              ? `Não foi possível salvar: ${save.error.messages.join(' ')}`
              : 'Não foi possível salvar as alterações.'
            : undefined
        }
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
        actions={transactionActions}
      />

      <GroupLinkDialog
        open={linking !== null}
        onOpenChange={(open) => !open && setLinking(null)}
        groupName={linking?.group.name ?? ''}
        categories={groups}
        paymentMethods={linkMethods}
        initial={linking ? statementLink(linking) : { expenseCategoryId: null, incomeCategoryId: null, paymentMethodId: null }}
        onSubmit={(link) => groupActions.setLink(linking!.group.id, link)}
        errorMessage={(error) => groupErrorMessage(error, 'Não foi possível salvar o vínculo.')}
      />
    </div>
  )
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

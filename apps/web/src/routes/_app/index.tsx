import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { BudgetGridToolbar, EmptyState } from '@/components/molecules'
import {
  BalanceSummary,
  BudgetDialogs,
  BudgetGrid,
  GoalsPanel,
  SaveBar,
  type BudgetDialog,
  type GridAction,
} from '@/components/organisms'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authQueries } from '@/features/auth/queries'
import { saveEntries, updateInitialBalance } from '@/features/budget/api'
import { categoryErrorMessage } from '@/features/budget/errors'
import { buildGoalsOverview } from '@/features/budget/goals'
import { useBudgetDraft, useCategoryActions, useUnsavedChangesGuard } from '@/features/budget/hooks'
import { currentMonth, endOfYear, formatMonthLabel, formatMonthLong, monthWindow } from '@/features/budget/months'
import { budgetQueries } from '@/features/budget/queries'
import { buildBudgetTable } from '@/features/budget/rows'
import { ApiError } from '@/lib/api/client'

/** The grid shows the current month and the 11 after it */
const WINDOW_MONTHS = 12

export const Route = createFileRoute('/_app/')({
  loader: async ({ context: { queryClient } }) => {
    const months = monthWindow(currentMonth(), WINDOW_MONTHS)
    await Promise.all([
      queryClient.ensureQueryData(budgetQueries.categories()),
      queryClient.ensureQueryData(budgetQueries.entries(months[0], months[months.length - 1])),
      queryClient.ensureQueryData(budgetQueries.summary(months[0])),
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
  const { data: entries } = useSuspenseQuery(
    budgetQueries.entries(months[0], months[months.length - 1]),
  )
  const { data: summary } = useSuspenseQuery(budgetQueries.summary(month))

  const draft = useBudgetDraft(entries)
  const dirty = draft.changes.length > 0
  useUnsavedChangesGuard(dirty)

  const table = buildBudgetTable(groups, months, draft.value, summary.openingBalanceCents)
  const [expenses, incomes] = [table.expenses[0], table.incomes[0]]
  const goals = buildGoalsOverview(table)

  const [showInactive, setShowInactive] = useState(false)
  const [dialog, setDialog] = useState<BudgetDialog>(null)
  const actions = useCategoryActions((categoryIds) => draft.dispatch({ type: 'forget', categoryIds }))

  async function toggleActive(run: () => Promise<void>, active: boolean, name: string) {
    try {
      await run()
      toast.success(active ? `${name} reativado(a)` : `${name} inativado(a)`)
    } catch (error) {
      toast.error(categoryErrorMessage(error, 'Não foi possível alterar.'))
    }
  }

  function handleGridAction(action: GridAction) {
    switch (action.type) {
      case 'toggle-group': {
        const { group } = action
        const active = !group.active
        const ids = group.categories.map((c) => c.id)
        return toggleActive(() => actions.updateGroup(group.id, { active }, ids), active, group.name)
      }
      case 'toggle-category': {
        const { category } = action
        const active = !category.active
        return toggleActive(() => actions.updateCategory(category.id, { active }), active, category.name)
      }
      default:
        setDialog(action)
    }
  }

  const save = useMutation({
    mutationFn: () => saveEntries(draft.changes),
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

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>Planejamento mensal</CardTitle>
          <CardDescription>
            Clique em um valor para editar. Use o menu da célula (ou o botão direito) para replicar
            para os meses seguintes. Passe o mouse sobre um tipo ou categoria para editar, inativar
            ou excluir. As alterações nos valores só valem depois de salvar.
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
            onChange={(categoryId, m, amountCents) =>
              draft.dispatch({ type: 'set', categoryId, month: m, amountCents })
            }
            onFill={(categoryId, from, scope) => {
              const until = scope === 'year' ? endOfYear(from) : months[months.length - 1]
              draft.dispatch({
                type: 'fill',
                categoryId,
                months: months.filter((m) => m > from && m <= until),
                amountCents: draft.value(categoryId, from),
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

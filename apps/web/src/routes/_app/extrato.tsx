import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { PlusIcon, TagsIcon, WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState, GroupLinkDialog, InitialBalanceDialog, MonthSwitcher } from '@/components/molecules'
import {
  BudgetDialogs,
  CategoryManager,
  GroupStatementsCard,
  StatementList,
  StatementSummary,
  TransactionDialogs,
  type BudgetDialog,
  type CategoryAction,
  type StatementAction,
  type TransactionDialog,
} from '@/components/organisms'
import { Button } from '@/components/ui/button'
import { useCategoryActions, useCategoryToggle, useInitialBalance } from '@/features/budget/hooks'
import { currentMonth, formatMonthLong } from '@/features/budget/months'
import { budgetQueries } from '@/features/budget/queries'
import type { GroupStatement, Month } from '@/features/budget/types'
import { groupErrorMessage } from '@/features/groups/errors'
import { useGroupActions } from '@/features/groups/hooks'
import { statementLink } from '@/features/groups/link'
import { transactionErrorMessage } from '@/features/transactions/errors'
import { useTransactionActions } from '@/features/transactions/hooks'
import { transactionQueries } from '@/features/transactions/queries'
import { buildStatement, hasFollowing } from '@/features/transactions/statement'
import { usePaymentMethodOptions } from '@/features/payment-methods/hooks'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

interface StatementSearch {
  /** `YYYY-MM`; the current month when absent */
  month?: Month
}

export const Route = createFileRoute('/_app/extrato')({
  // `month: undefined` (not a missing key) so an invalid raw value doesn't survive the merge
  validateSearch: (search: Record<string, unknown>): StatementSearch => ({
    month: typeof search.month === 'string' && MONTH_PATTERN.test(search.month) ? search.month : undefined,
  }),
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: async ({ context: { queryClient }, deps: { month } }) => {
    await Promise.all([
      queryClient.ensureQueryData(transactionQueries.month(month)),
      queryClient.ensureQueryData(budgetQueries.categories()),
      queryClient.ensureQueryData(budgetQueries.summary(month)),
      queryClient.ensureQueryData(budgetQueries.groupStatements(month)),
    ])
    return { month }
  },
  component: StatementPage,
  errorComponent: StatementError,
})

function StatementPage() {
  const { month } = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: transactions } = useSuspenseQuery(transactionQueries.month(month))
  const { data: groups } = useSuspenseQuery(budgetQueries.categories())
  const { data: summary } = useSuspenseQuery(budgetQueries.summary(month))
  const { data: groupStatements } = useSuspenseQuery(budgetQueries.groupStatements(month))
  // Types in the tree's order, the same as the dashboard grid; linked group shares join their type
  const statement = buildStatement(
    transactions,
    groups.map((g) => g.id),
    groupStatements,
  )
  const hasShares = statement.sections.some((s) => s.shares.length > 0)
  const actions = useTransactionActions()
  const groupActions = useGroupActions()
  const [dialog, setDialog] = useState<TransactionDialog>(null)
  const [linking, setLinking] = useState<GroupStatement | null>(null)
  const linkMethods = usePaymentMethodOptions(month, linking !== null)
  const formMethods = usePaymentMethodOptions(month, dialog?.type === 'create' || dialog?.type === 'edit')
  const [managing, setManaging] = useState(false)
  const [editingBalance, setEditingBalance] = useState(false)
  const saveInitialBalance = useInitialBalance()
  const [categoryDialog, setCategoryDialog] = useState<BudgetDialog>(null)
  // No unsaved values on this page, so nothing to forget
  const categoryActions = useCategoryActions(() => {})
  const { toggleGroup, toggleCategory } = useCategoryToggle(categoryActions)

  function handleCategoryAction(action: CategoryAction) {
    switch (action.type) {
      case 'toggle-group':
        return toggleGroup(action.group)
      case 'toggle-category':
        return toggleCategory(action.category)
      default:
        setCategoryDialog(action)
    }
  }

  async function toggleRealized({ id, realizedCents, plannedCents }: StatementAction['transaction']) {
    try {
      if (realizedCents === null) await actions.realize(id, plannedCents)
      else await actions.unrealize(id)
    } catch (error) {
      toast.error(transactionErrorMessage(error, 'Não foi possível alterar o lançamento.'))
    }
  }

  function handleAction({ type, transaction }: StatementAction) {
    switch (type) {
      case 'toggle-realized':
        return toggleRealized(transaction)
      case 'delete':
        return setDialog({ type: hasFollowing(transaction) ? 'delete-scope' : 'delete', transaction })
      default:
        setDialog({ type, transaction })
    }
  }

  const newButtons = (
    <div className="grid grid-cols-2 gap-2 sm:flex">
      <Button variant="outline" onClick={() => setDialog({ type: 'create', kind: 'INCOME' })}>
        <PlusIcon />
        Nova receita
      </Button>
      <Button onClick={() => setDialog({ type: 'create', kind: 'EXPENSE' })}>
        <PlusIcon />
        Nova despesa
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Extrato</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Receitas e despesas de {formatMonthLong(month)}. Marque o que já foi pago ou recebido.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <MonthSwitcher month={month} onChange={(m) => navigate({ search: { month: m } })} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="ghost" onClick={() => setEditingBalance(true)}>
                <WalletIcon />
                Saldo inicial
              </Button>
              <Button variant="ghost" onClick={() => setManaging(true)}>
                <TagsIcon />
                Categorias
              </Button>
            </div>
            {newButtons}
          </div>
        </div>
      </div>

      <StatementSummary statement={statement} openingCents={summary.openingBalanceCents} />

      {transactions.length === 0 && !hasShares ? (
        <EmptyState
          title="Nenhum lançamento neste mês"
          description="Lance suas receitas e despesas previstas, inclusive as que se repetem todo mês."
          action={newButtons}
        />
      ) : (
        <StatementList statement={statement} onAction={handleAction} />
      )}

      {groupStatements.length > 0 && (
        <GroupStatementsCard statements={groupStatements} month={month} detailed onLink={setLinking} />
      )}

      <InitialBalanceDialog
        open={editingBalance}
        onOpenChange={setEditingBalance}
        initialBalanceCents={summary.initialBalanceCents}
        onSubmit={saveInitialBalance}
      />

      <CategoryManager open={managing} onOpenChange={setManaging} groups={groups} onAction={handleCategoryAction} />
      <BudgetDialogs dialog={categoryDialog} onClose={() => setCategoryDialog(null)} actions={categoryActions} />

      <TransactionDialogs
        dialog={dialog}
        onDialogChange={setDialog}
        month={month}
        groups={groups}
        paymentMethods={formMethods}
        actions={actions}
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

function StatementError() {
  const router = useRouter()
  return (
    <EmptyState
      title="Não foi possível carregar o extrato"
      description="Verifique sua conexão e tente novamente."
      action={<Button onClick={() => router.invalidate()}>Tentar novamente</Button>}
    />
  )
}

import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { ArrowLeftIcon, CircleCheckIcon, PencilIcon, Undo2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState, MonthSwitcher } from '@/components/molecules'
import {
  PAYMENT_METHOD_ICONS,
  PaymentMethodDialogs,
  PaymentMethodInvoice,
  TransactionDialogs,
  type PaymentMethodDialog,
  type StatementAction,
  type TransactionDialog,
} from '@/components/organisms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { addMonths, currentMonth } from '@/features/budget/months'
import { budgetQueries } from '@/features/budget/queries'
import type { Month } from '@/features/budget/types'
import { describeDueDay, paymentMethodTypeLabel } from '@/features/payment-methods/labels'
import { usePaymentMethodActions, usePaymentMethodOptions } from '@/features/payment-methods/hooks'
import { paymentMethodQueries } from '@/features/payment-methods/queries'
import { transactionErrorMessage } from '@/features/transactions/errors'
import { useTransactionActions } from '@/features/transactions/hooks'
import { hasFollowing } from '@/features/transactions/statement'
import { ApiError } from '@/lib/api/client'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

interface InvoiceSearch {
  /** `YYYY-MM`; the current month when absent */
  month?: Month
}

/** The route's numeric id, or a 404 for anything else */
function parseMethodId(raw: string): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 1) throw new ApiError(404, ['Payment method not found'])
  return id
}

export const Route = createFileRoute('/_app/meios-de-pagamento/$methodId')({
  validateSearch: (search: Record<string, unknown>): InvoiceSearch => ({
    month: typeof search.month === 'string' && MONTH_PATTERN.test(search.month) ? search.month : undefined,
  }),
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: async ({ context: { queryClient }, params, deps: { month } }) => {
    const id = parseMethodId(params.methodId)
    await queryClient.ensureQueryData(paymentMethodQueries.invoice(id, month))
    return { id, month }
  },
  component: InvoicePage,
  errorComponent: InvoiceError,
})

function InvoicePage() {
  const { id, month } = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: invoice } = useSuspenseQuery(paymentMethodQueries.invoice(id, month))
  // Twelve months around this one; the page works without them
  const { data: history } = useQuery(paymentMethodQueries.history(id, addMonths(month, -5), addMonths(month, 6)))
  const method = invoice.paymentMethod
  const Icon = PAYMENT_METHOD_ICONS[method.type]
  const methodActions = usePaymentMethodActions()
  const transactionActions = useTransactionActions()
  const [dialog, setDialog] = useState<PaymentMethodDialog>(null)
  const [transactionDialog, setTransactionDialog] = useState<TransactionDialog>(null)
  const editing = transactionDialog?.type === 'edit'
  const { data: categories } = useQuery({ ...budgetQueries.categories(), enabled: editing })
  const formMethods = usePaymentMethodOptions(month, editing)

  const pending = invoice.transactions.filter((t) => t.realizedCents === null)
  const realized = invoice.transactions.length - pending.length
  const selectMonth = (m: Month) => navigate({ search: { month: m } })

  async function toggleRealized({ id: transactionId, realizedCents, plannedCents }: StatementAction['transaction']) {
    try {
      if (realizedCents === null) await transactionActions.realize(transactionId, plannedCents)
      else await transactionActions.unrealize(transactionId)
    } catch (error) {
      toast.error(transactionErrorMessage(error, 'Não foi possível alterar o lançamento.'))
    }
  }

  function handleAction({ type, transaction }: StatementAction) {
    switch (type) {
      case 'toggle-realized':
        return toggleRealized(transaction)
      case 'delete':
        return setTransactionDialog({ type: hasFollowing(transaction) ? 'delete-scope' : 'delete', transaction })
      default:
        setTransactionDialog({ type, transaction })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="self-start" asChild>
        <Link to="/meios-de-pagamento" search={{ month }}>
          <ArrowLeftIcon />
          Meios de pagamento
        </Link>
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <span className="truncate">{method.name}</span>
              {!method.active && <Badge variant="outline">Inativo</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              {paymentMethodTypeLabel(method.type)} · {describeDueDay(method)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <MonthSwitcher month={month} onChange={selectMonth} />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={() => setDialog({ type: 'edit', method })}>
              <PencilIcon />
              Editar
            </Button>
            {pending.length > 0 ? (
              <Button
                onClick={() =>
                  setDialog({
                    type: 'pay',
                    method,
                    month,
                    count: pending.length,
                    amountCents: pending.reduce((sum, t) => sum + t.plannedCents, 0),
                  })
                }
              >
                <CircleCheckIcon />
                Pagar fatura
              </Button>
            ) : (
              realized > 0 && (
                <Button variant="outline" onClick={() => setDialog({ type: 'unpay', method, month })}>
                  <Undo2Icon />
                  Desfazer pagamento
                </Button>
              )
            )}
          </div>
        </div>
      </div>

      <PaymentMethodInvoice invoice={invoice} history={history} onAction={handleAction} onSelectMonth={selectMonth} />

      <PaymentMethodDialogs dialog={dialog} onDialogChange={setDialog} actions={methodActions} />
      <TransactionDialogs
        dialog={transactionDialog}
        onDialogChange={setTransactionDialog}
        month={month}
        groups={categories ?? []}
        paymentMethods={formMethods}
        actions={transactionActions}
      />
    </div>
  )
}

function InvoiceError({ error }: ErrorComponentProps) {
  const router = useRouter()
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        title="Meio de pagamento não encontrado"
        description="Ele não existe ou foi excluído."
        action={
          <Button asChild>
            <Link to="/meios-de-pagamento">Ver meus meios de pagamento</Link>
          </Button>
        }
      />
    )
  }
  return (
    <EmptyState
      title="Não foi possível carregar a fatura"
      description="Verifique sua conexão e tente novamente."
      action={<Button onClick={() => router.invalidate()}>Tentar novamente</Button>}
    />
  )
}

import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { CreditCardIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState, MonthSwitcher } from '@/components/molecules'
import {
  PaymentMethodDialogs,
  PaymentMethodList,
  type PaymentMethodAction,
  type PaymentMethodDialog,
} from '@/components/organisms'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { currentMonth, formatMonthLong } from '@/features/budget/months'
import type { Month } from '@/features/budget/types'
import { paymentMethodErrorMessage } from '@/features/payment-methods/errors'
import { usePaymentMethodActions } from '@/features/payment-methods/hooks'
import { paymentMethodQueries } from '@/features/payment-methods/queries'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

interface PaymentMethodsSearch {
  /** `YYYY-MM`; the current month when absent */
  month?: Month
}

export const Route = createFileRoute('/_app/meios-de-pagamento/')({
  validateSearch: (search: Record<string, unknown>): PaymentMethodsSearch => ({
    month: typeof search.month === 'string' && MONTH_PATTERN.test(search.month) ? search.month : undefined,
  }),
  loaderDeps: ({ search }) => ({ month: search.month ?? currentMonth() }),
  loader: async ({ context: { queryClient }, deps: { month } }) => {
    await queryClient.ensureQueryData(paymentMethodQueries.list(month))
    return { month }
  },
  component: PaymentMethodsPage,
  errorComponent: PaymentMethodsError,
})

function PaymentMethodsPage() {
  const { month } = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: methods } = useSuspenseQuery(paymentMethodQueries.list(month))
  const actions = usePaymentMethodActions()
  const [dialog, setDialog] = useState<PaymentMethodDialog>(null)
  const [showInactive, setShowInactive] = useState(false)
  const inactiveCount = methods.filter((m) => !m.active).length
  const shown = showInactive ? methods : methods.filter((m) => m.active)

  async function handleAction({ type, method }: PaymentMethodAction) {
    if (type !== 'toggle-active') return setDialog({ type, method })
    try {
      await actions.update(method.id, { active: !method.active })
    } catch (error) {
      toast.error(paymentMethodErrorMessage(error, 'Não foi possível alterar o meio de pagamento.'))
    }
  }

  const newButton = (
    <Button onClick={() => setDialog({ type: 'create' })}>
      <PlusIcon />
      Novo meio de pagamento
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Meios de pagamento</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Cartões e contas com a fatura de {formatMonthLong(month)}. As despesas lançadas em cada um vencem no dia
            dele.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <MonthSwitcher month={month} onChange={(m) => navigate({ search: { month: m } })} />
          {newButton}
        </div>
      </div>

      {methods.length === 0 ? (
        <EmptyState
          icon={CreditCardIcon}
          title="Nenhum meio de pagamento"
          description="Cadastre seus cartões e contas, com o dia de vencimento, e escolha um ao lançar uma despesa."
          action={newButton}
        />
      ) : (
        <>
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 self-start text-sm">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              Mostrar inativos ({inactiveCount})
            </label>
          )}
          <PaymentMethodList methods={shown} month={month} onAction={handleAction} />
        </>
      )}

      <PaymentMethodDialogs
        dialog={dialog}
        onDialogChange={setDialog}
        actions={actions}
        onCreated={async (method) => {
          await navigate({
            to: '/meios-de-pagamento/$methodId',
            params: { methodId: String(method.id) },
            search: { month },
          })
        }}
      />
    </div>
  )
}

function PaymentMethodsError() {
  const router = useRouter()
  return (
    <EmptyState
      title="Não foi possível carregar os meios de pagamento"
      description="Verifique sua conexão e tente novamente."
      action={<Button onClick={() => router.invalidate()}>Tentar novamente</Button>}
    />
  )
}

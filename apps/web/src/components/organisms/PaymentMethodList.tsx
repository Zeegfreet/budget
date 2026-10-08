import { Link } from '@tanstack/react-router'
import {
  BanknoteIcon,
  CreditCardIcon,
  LandmarkIcon,
  PencilIcon,
  PowerIcon,
  PowerOffIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react'
import { MoneyText } from '@/components/atoms'
import { RowActions, type RowAction } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import type { Month } from '@/features/budget/types'
import { describeDueDay, paymentMethodTypeLabel } from '@/features/payment-methods/labels'
import type { PaymentMethodSummary, PaymentMethodType } from '@/features/payment-methods/types'
import { cn } from '@/lib/utils'

/** What the user asked to do with a method; the page handles it. */
export type PaymentMethodAction = {
  type: 'edit' | 'toggle-active' | 'delete'
  method: PaymentMethodSummary
}

export const PAYMENT_METHOD_ICONS: Record<PaymentMethodType, LucideIcon> = {
  CREDIT_CARD: CreditCardIcon,
  ACCOUNT: LandmarkIcon,
  OTHER: BanknoteIcon,
}

interface PaymentMethodListProps {
  methods: PaymentMethodSummary[]
  /** Month of the invoices shown (and of the page each card opens) */
  month: Month
  onAction: (action: PaymentMethodAction) => void
}

/** The user's payment methods with the month's invoice, each linking to it. */
export function PaymentMethodList({ methods, month, onAction }: PaymentMethodListProps) {
  return (
    <ul aria-label="Meus meios de pagamento" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {methods.map((m) => (
        <PaymentMethodCard key={m.id} method={m} month={month} onAction={onAction} />
      ))}
    </ul>
  )
}

function PaymentMethodCard({
  method: m,
  month,
  onAction,
}: {
  method: PaymentMethodSummary
  month: Month
  onAction: (action: PaymentMethodAction) => void
}) {
  const Icon = PAYMENT_METHOD_ICONS[m.type]
  const action = (type: PaymentMethodAction['type']) => () => onAction({ type, method: m })
  const actions: RowAction[] = [
    { label: 'Editar', icon: PencilIcon, onSelect: action('edit') },
    m.active
      ? { label: 'Inativar', icon: PowerOffIcon, onSelect: action('toggle-active') }
      : { label: 'Reativar', icon: PowerIcon, onSelect: action('toggle-active') },
    { label: 'Excluir', icon: Trash2Icon, destructive: true, separated: true, onSelect: action('delete') },
  ]

  return (
    <li aria-label={m.name} className={cn('rounded-xl border bg-card', !m.active && 'opacity-70')}>
      <RowActions label={m.name} actions={actions} className="pr-2">
        <Link
          to="/meios-de-pagamento/$methodId"
          params={{ methodId: String(m.id) }}
          search={{ month }}
          className="flex h-full items-center gap-3 rounded-xl p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5 text-muted-foreground" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium">{m.name}</span>
              {!m.active && <Badge variant="outline">Inativo</Badge>}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {paymentMethodTypeLabel(m.type)} · {describeDueDay(m)}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <MoneyText cents={m.invoice.effectiveCents} className="font-semibold" />
            <span className="text-xs text-muted-foreground">
              {m.invoice.count === 0 ? (
                'Sem lançamentos'
              ) : m.invoice.pendingCents > 0 ? (
                <>
                  a pagar <MoneyText cents={m.invoice.pendingCents} />
                </>
              ) : (
                'Paga'
              )}
            </span>
          </span>
        </Link>
      </RowActions>
    </li>
  )
}

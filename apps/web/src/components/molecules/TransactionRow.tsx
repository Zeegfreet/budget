import { Link } from '@tanstack/react-router'
import { CircleCheckIcon, CreditCardIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { DueDayBadge, MoneyText, PaymentLinkButton } from '@/components/atoms'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { transactionTitle } from '@/features/transactions/statement'
import type { Transaction } from '@/features/transactions/types'
import { cn } from '@/lib/utils'
import { RowActions, type RowAction } from './RowActions'
import { SeriesBadge } from './SeriesBadge'

/** What the user asked to do with a transaction; the page handles it. */
export type TransactionRowAction = {
  /** `series` opens the range of its recurrence (extend or shorten it) */
  type: 'toggle-realized' | 'realize' | 'edit' | 'delete' | 'series'
  transaction: Transaction
}

/**
 * One personal transaction of a list: a checkbox to realize it, the effective
 * due day, title, recurrence, payment method and amounts, plus its actions.
 */
export function TransactionRow({
  transaction: t,
  onAction,
  showPaymentMethod = true,
}: {
  transaction: Transaction
  onAction: (action: TransactionRowAction) => void
  /** Off on the method's own invoice, where it would repeat on every row */
  showPaymentMethod?: boolean
}) {
  const title = transactionTitle(t)
  const realized = t.realizedCents !== null
  const differs = realized && t.realizedCents !== t.plannedCents
  const editable = t.category.active && t.category.group.active
  const action = (type: TransactionRowAction['type']) => () => onAction({ type, transaction: t })

  const actions: RowAction[] = [
    ...(editable ? [{ label: 'Editar', icon: PencilIcon, onSelect: action('edit') }] : []),
    { label: 'Informar valor realizado', icon: CircleCheckIcon, onSelect: action('realize') },
    { label: 'Excluir', icon: Trash2Icon, destructive: true, separated: true, onSelect: action('delete') },
  ]

  return (
    <li aria-label={title} data-realized={realized || undefined} className="py-1 pr-2 sm:pr-3">
      <RowActions label={title} actions={actions}>
        <div className="flex min-h-12 items-center gap-1 sm:gap-2">
          {/* A finger-sized hit area around the small box */}
          <label className="flex size-10 shrink-0 cursor-pointer items-center justify-center">
            <Checkbox
              checked={realized}
              onCheckedChange={action('toggle-realized')}
              aria-label={`Realizado: ${title}`}
            />
          </label>
          {t.dueDay !== null && <DueDayBadge day={t.dueDay} />}
          <div className="min-w-0 flex-1 pl-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn('truncate', realized && 'text-muted-foreground')}>{title}</span>
              {t.series && <SeriesBadge series={t.series} title={title} onClick={action('series')} />}
              {showPaymentMethod && t.paymentMethod && (
                <Badge variant="outline" className="shrink-0" asChild>
                  <Link
                    to="/meios-de-pagamento/$methodId"
                    params={{ methodId: String(t.paymentMethod.id) }}
                    search={{ month: t.month }}
                    title="Ver a fatura deste meio de pagamento"
                  >
                    <CreditCardIcon aria-hidden />
                    {t.paymentMethod.name}
                  </Link>
                </Badge>
              )}
            </div>
            {t.description && <p className="truncate text-xs text-muted-foreground">{t.category.name}</p>}
          </div>
          {t.paymentUrl && <PaymentLinkButton href={t.paymentUrl} title={title} />}
          <div className="flex shrink-0 flex-col items-end">
            {realized ? (
              <button
                type="button"
                onClick={action('realize')}
                className="rounded-sm text-muted-foreground tabular-nums hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Valor realizado de ${title}`}
              >
                <MoneyText cents={t.realizedCents!} className={cn(differs && 'text-amber-600 dark:text-amber-400')} />
              </button>
            ) : (
              <MoneyText cents={t.plannedCents} className="font-medium" />
            )}
            {differs && (
              <span className="text-xs text-muted-foreground">
                Previsto <MoneyText cents={t.plannedCents} />
              </span>
            )}
          </div>
        </div>
      </RowActions>
    </li>
  )
}

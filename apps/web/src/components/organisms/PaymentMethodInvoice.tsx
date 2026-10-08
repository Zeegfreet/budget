import { Link } from '@tanstack/react-router'
import { CircleCheckIcon, UsersIcon } from 'lucide-react'
import { MoneyText, PaymentLinkButton } from '@/components/atoms'
import { TransactionRow, type TransactionRowAction } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatMonthLabel } from '@/features/budget/months'
import type { Month } from '@/features/budget/types'
import { formatDueDate } from '@/features/payment-methods/labels'
import type { Invoice, InvoiceMonth, InvoiceShare } from '@/features/payment-methods/types'
import { cn } from '@/lib/utils'

interface PaymentMethodInvoiceProps {
  invoice: Invoice
  /** Totals of the months around this one; `undefined` while loading */
  history?: InvoiceMonth[]
  onAction: (action: TransactionRowAction) => void
  onSelectMonth: (month: Month) => void
}

/**
 * A payment method's invoice: the month's totals, its launches (the user's
 * own, which can be realized here, and their group shares, read-only) and the
 * totals of the surrounding months.
 */
export function PaymentMethodInvoice({ invoice, history, onAction, onSelectMonth }: PaymentMethodInvoiceProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card role="region" aria-label="Resumo da fatura" className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        <SummaryItem title="Total da fatura" cents={invoice.effectiveCents} emphasis />
        <SummaryItem title="Pago" cents={invoice.realizedCents} />
        <SummaryItem title="A pagar" cents={invoice.pendingCents} />
        <div role="group" aria-label="Vencimento" className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Vencimento</span>
          <span className="text-xl font-semibold tabular-nums">
            {invoice.dueDate ? formatDueDate(invoice.dueDate) : '—'}
          </span>
          {!invoice.dueDate && (
            <span className="text-xs text-muted-foreground">Cada lançamento vence no dia da sua categoria</span>
          )}
        </div>
      </Card>

      <section role="region" aria-label="Lançamentos da fatura" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Lançamentos</h2>
        {invoice.count === 0 ? (
          <p className="rounded-xl border py-8 text-center text-sm text-muted-foreground">
            Nenhuma despesa neste meio de pagamento em {formatMonthLabel(invoice.month)}.
          </p>
        ) : (
          <ul aria-label="Lançamentos" className="divide-y overflow-hidden rounded-xl border bg-card">
            {invoice.transactions.map((t) => (
              <TransactionRow key={t.id} transaction={t} onAction={onAction} showPaymentMethod={false} />
            ))}
            {invoice.shares.map((share) => (
              <ShareRow key={`share:${share.transactionId}`} share={share} month={invoice.month} />
            ))}
          </ul>
        )}
      </section>

      {history && (
        <section role="region" aria-label="Histórico" className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Histórico</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {history.map((m) => (
              <li key={m.month}>
                <button
                  type="button"
                  onClick={() => onSelectMonth(m.month)}
                  aria-current={m.month === invoice.month ? 'date' : undefined}
                  aria-label={`Fatura de ${formatMonthLabel(m.month)}`}
                  className={cn(
                    'flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    m.month === invoice.month && 'border-primary bg-accent',
                  )}
                >
                  <span className="text-xs text-muted-foreground capitalize">{formatMonthLabel(m.month)}</span>
                  <MoneyText cents={m.effectiveCents} className={cn('font-medium', m.count === 0 && 'text-muted-foreground')} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SummaryItem({ title, cents, emphasis = false }: { title: string; cents: number; emphasis?: boolean }) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{title}</span>
      <MoneyText cents={cents} className={cn('font-semibold', emphasis ? 'text-2xl' : 'text-xl')} />
    </div>
  )
}

/** The user's share of a group expense: paid once they paid it or the payer confirmed being paid back. */
function ShareRow({ share, month }: { share: InvoiceShare; month: Month }) {
  const label = `${share.description} (${share.group.name})`
  return (
    <li aria-label={label} data-realized={share.paid || undefined} data-group-share="" className="py-1 pr-3">
      <div className="flex min-h-12 items-center gap-1 sm:gap-2">
        <span className="flex size-10 shrink-0 items-center justify-center text-muted-foreground" title="Sua parte em um grupo">
          {share.paid ? (
            <CircleCheckIcon aria-hidden className="size-4 text-primary" />
          ) : (
            <UsersIcon aria-hidden className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1 pl-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate', share.paid && 'text-muted-foreground')}>{share.description}</span>
            <Badge variant="outline" className="shrink-0" asChild>
              <Link
                to="/grupos/$groupId"
                params={{ groupId: String(share.group.id) }}
                search={{ month, tab: 'lancamentos' }}
              >
                <UsersIcon aria-hidden />
                {share.group.name}
              </Link>
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            Sua parte · {share.paid ? 'Pago no grupo' : share.groupPaid ? 'A acertar no grupo' : 'Pendente no grupo'}
          </p>
        </div>
        {share.paymentUrl && <PaymentLinkButton href={share.paymentUrl} title={label} />}
        <MoneyText
          cents={share.shareCents}
          className={cn('shrink-0 font-medium', share.paid && 'font-normal text-muted-foreground')}
        />
      </div>
    </li>
  )
}

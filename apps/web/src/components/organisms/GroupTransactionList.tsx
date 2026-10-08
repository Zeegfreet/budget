import { CircleCheckIcon, PencilIcon, Trash2Icon, Undo2Icon } from 'lucide-react'
import { MoneyText } from '@/components/atoms'
import { RowActions, SeriesBadge, type RowAction } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import type { EntryKind } from '@/features/budget/types'
import type { GroupTransaction } from '@/features/groups/types'

/** What the user asked to do with a group transaction; the page handles it. */
export interface GroupTransactionAction {
  /** `series` opens the range of its recurrence (extend or shorten it) */
  type: 'edit' | 'pay' | 'unpay' | 'delete' | 'series'
  transaction: GroupTransaction
}

interface GroupTransactionListProps {
  transactions: GroupTransaction[]
  onAction: (action: GroupTransactionAction) => void
}

const SECTIONS: { kind: EntryKind; label: string; empty: string }[] = [
  { kind: 'INCOME', label: 'Receitas', empty: 'Nenhuma receita neste mês.' },
  { kind: 'EXPENSE', label: 'Despesas', empty: 'Nenhuma despesa neste mês.' },
]

/** The group's transactions of a month: Receitas above Despesas, each with its split and payer. */
export function GroupTransactionList({ transactions, onAction }: GroupTransactionListProps) {
  return (
    <div className="flex flex-col gap-8">
      {SECTIONS.map(({ kind, label, empty }) => {
        const items = transactions.filter((t) => t.kind === kind)
        const total = items.reduce((sum, t) => sum + t.amountCents, 0)
        return (
          <section key={kind} role="region" aria-label={label} className="flex flex-col gap-3">
            <header className="flex items-end justify-between gap-4 border-b pb-2">
              <h2 className="text-lg font-semibold">{label}</h2>
              <MoneyText cents={total} className="text-lg font-semibold" />
            </header>
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
            ) : (
              <ul aria-label={label} className="divide-y overflow-hidden rounded-xl border bg-card">
                {items.map((t) => (
                  <GroupTransactionRow key={t.id} transaction={t} onAction={onAction} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function GroupTransactionRow({
  transaction: t,
  onAction,
}: {
  transaction: GroupTransaction
  onAction: (action: GroupTransactionAction) => void
}) {
  const income = t.kind === 'INCOME'
  const action = (type: GroupTransactionAction['type']) => () => onAction({ type, transaction: t })
  const actions: RowAction[] = [
    { label: 'Editar', icon: PencilIcon, onSelect: action('edit') },
    {
      label: t.paidBy
        ? income
          ? 'Alterar quem recebeu'
          : 'Alterar quem pagou'
        : income
          ? 'Marcar como recebido'
          : 'Marcar como pago',
      icon: CircleCheckIcon,
      onSelect: action('pay'),
    },
    ...(t.paidBy
      ? [{ label: income ? 'Desfazer recebimento' : 'Desfazer pagamento', icon: Undo2Icon, onSelect: action('unpay') }]
      : []),
    { label: 'Excluir', icon: Trash2Icon, destructive: true, separated: true, onSelect: action('delete') },
  ]

  return (
    <li aria-label={t.description} data-paid={!!t.paidBy || undefined} className="py-2 pr-2 pl-3 sm:pr-3 sm:pl-4">
      <RowActions label={t.description} actions={actions}>
        <div className="flex min-h-12 items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{t.description}</span>
              {t.series && <SeriesBadge series={t.series} title={t.description} onClick={action('series')} />}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">{t.splitMethod?.name ?? 'Regra excluída'}</span>
              {t.shares.map((s) => (
                <span key={s.memberId}>
                  {' · '}
                  {s.name} <MoneyText cents={s.amountCents} />
                </span>
              ))}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <MoneyText cents={t.amountCents} className="font-medium" />
            {t.paidBy ? (
              <span className="text-xs text-muted-foreground">
                {income ? 'Recebido por' : 'Pago por'} {t.paidBy.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={action('pay')}
                aria-label={`${income ? 'Marcar como recebido' : 'Marcar como pago'}: ${t.description}`}
                className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Badge variant="outline">{income ? 'A receber' : 'A pagar'}</Badge>
              </button>
            )}
          </div>
        </div>
      </RowActions>
    </li>
  )
}

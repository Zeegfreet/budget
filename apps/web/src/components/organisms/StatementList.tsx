import { useNavigate } from '@tanstack/react-router'
import { CircleCheckIcon, ExternalLinkIcon, UsersIcon } from 'lucide-react'
import { useId } from 'react'
import { DueDayBadge, MoneyText, PaymentLinkButton } from '@/components/atoms'
import { RowActions, SeriesBadge, TransactionRow, type RowAction, type TransactionRowAction } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import type { Statement, StatementGroup, StatementShare } from '@/features/transactions/statement'
import { cn } from '@/lib/utils'

/** What the user asked to do with a transaction; the page handles it. */
export type StatementAction = TransactionRowAction

interface StatementListProps {
  statement: Statement
  onAction: (action: StatementAction) => void
  /** The list only shows what is pending (changes the empty message) */
  pendingOnly?: boolean
}

/**
 * The month's transactions: Receitas above Despesas, each split under its
 * types' titles. The user's linked group shares follow the transactions of
 * their type, read-only (they are managed in the group).
 */
export function StatementList({ statement, onAction, pendingOnly = false }: StatementListProps) {
  return (
    <div className="flex flex-col gap-8">
      {statement.sections.map((section) => (
        <section key={section.kind} role="region" aria-label={section.label} className="flex flex-col gap-4">
          <header className="flex items-end justify-between gap-4 border-b pb-2">
            <h2 className="text-lg font-semibold">{section.label}</h2>
            <div className="flex flex-col items-end">
              <MoneyText cents={section.effectiveCents} className="text-lg font-semibold" />
              {section.pendingCents > 0 && (
                <span className="text-xs text-muted-foreground">
                  a realizar <MoneyText cents={section.pendingCents} />
                </span>
              )}
            </div>
          </header>
          {section.groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma {section.kind === 'INCOME' ? 'receita' : 'despesa'}
              {pendingOnly && ' pendente'} neste mês.
            </p>
          ) : (
            section.groups.map((group) => <StatementGroupList key={group.id} group={group} onAction={onAction} />)
          )}
        </section>
      ))}
    </div>
  )
}

function StatementGroupList({
  group,
  onAction,
}: {
  group: StatementGroup
  onAction: (action: StatementAction) => void
}) {
  const headingId = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4 px-1 text-sm">
        <h3 id={headingId} className="flex min-w-0 items-center gap-2 font-medium text-muted-foreground">
          <span className="truncate">{group.name}</span>
          {!group.active && <Badge variant="outline">Inativo</Badge>}
        </h3>
        <MoneyText cents={group.effectiveCents} className="shrink-0 text-muted-foreground" />
      </div>
      <ul aria-labelledby={headingId} className="divide-y overflow-hidden rounded-xl border bg-card">
        {group.items.map((item) =>
          item.kind === 'transaction' ? (
            <TransactionRow key={item.transaction.id} transaction={item.transaction} onAction={onAction} />
          ) : (
            <ShareRow key={`share:${item.share.item.transactionId}`} share={item.share} />
          ),
        )}
      </ul>
    </div>
  )
}

/**
 * The user's share of a group transaction: paid once they paid it or the
 * member who did confirmed being paid back ("a acertar" until then).
 */
function ShareRow({ share: { group, item } }: { share: StatementShare }) {
  const navigate = useNavigate()
  const title = item.description
  const actions: RowAction[] = [
    {
      label: 'Abrir no grupo',
      icon: ExternalLinkIcon,
      onSelect: () =>
        navigate({
          to: '/grupos/$groupId',
          params: { groupId: String(group.id) },
          search: { month: item.month, tab: 'lancamentos' },
        }),
    },
  ]
  const status = item.paid
    ? `${item.kind === 'EXPENSE' ? 'Pago' : 'Recebido'}${item.paidByName ? ` por ${item.paidByName}` : ''}`
    : item.groupPaid
      ? `${item.kind === 'EXPENSE' ? 'A acertar com' : 'A receber de'} ${item.paidByName ?? 'quem pagou'}`
      : 'Pendente no grupo'

  return (
    <li
      aria-label={`${title} (${group.name})`}
      data-realized={item.paid || undefined}
      data-group-share=""
      className="py-1 pr-2 sm:pr-3"
    >
      <RowActions label={`${title} (${group.name})`} actions={actions}>
        <div className="flex min-h-12 items-center gap-1 sm:gap-2">
          <span
            className="flex size-10 shrink-0 items-center justify-center text-muted-foreground"
            title="Sua parte em um grupo"
          >
            {item.paid ? <CircleCheckIcon aria-hidden className="size-4 text-primary" /> : <UsersIcon aria-hidden className="size-4" />}
          </span>
          {item.dueDay !== null && <DueDayBadge day={item.dueDay} />}
          <div className="min-w-0 flex-1 pl-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn('truncate', item.paid && 'text-muted-foreground')}>{title}</span>
              <Badge variant="outline" className="shrink-0">
                <UsersIcon aria-hidden />
                {group.name}
              </Badge>
              {item.series && <SeriesBadge series={item.series} title={item.description} />}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {item.category.name} · {status}
            </p>
          </div>
          {item.paymentUrl && <PaymentLinkButton href={item.paymentUrl} title={`${title} (${group.name})`} />}
          <div className="flex shrink-0 flex-col items-end">
            <MoneyText cents={item.shareCents} className={cn('font-medium', item.paid && 'font-normal text-muted-foreground')} />
            <span className="text-xs text-muted-foreground">
              Sua parte de <MoneyText cents={item.totalCents} />
            </span>
          </div>
        </div>
      </RowActions>
    </li>
  )
}

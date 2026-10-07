import { useNavigate } from '@tanstack/react-router'
import { CircleCheckIcon, ExternalLinkIcon, PencilIcon, RepeatIcon, Trash2Icon, UsersIcon } from 'lucide-react'
import { useId } from 'react'
import { MoneyText } from '@/components/atoms'
import { RowActions, type RowAction } from '@/components/molecules'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import type { Statement, StatementGroup, StatementShare } from '@/features/transactions/statement'
import { transactionTitle } from '@/features/transactions/statement'
import type { Transaction } from '@/features/transactions/types'
import { cn } from '@/lib/utils'

/** What the user asked to do with a transaction; the page handles it. */
export type StatementAction =
  | { type: 'toggle-realized' | 'realize' | 'edit' | 'delete'; transaction: Transaction }

interface StatementListProps {
  statement: Statement
  onAction: (action: StatementAction) => void
}

/**
 * The month's transactions: Receitas above Despesas, each split under its
 * types' titles. The user's linked group shares follow the transactions of
 * their type, read-only (they are managed in the group).
 */
export function StatementList({ statement, onAction }: StatementListProps) {
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
              Nenhuma {section.kind === 'INCOME' ? 'receita' : 'despesa'} neste mês.
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
        {group.transactions.map((t) => (
          <StatementRow key={t.id} transaction={t} onAction={onAction} />
        ))}
        {group.shares.map((share) => (
          <ShareRow key={`share:${share.item.transactionId}`} share={share} />
        ))}
      </ul>
    </div>
  )
}

function StatementRow({
  transaction: t,
  onAction,
}: {
  transaction: Transaction
  onAction: (action: StatementAction) => void
}) {
  const title = transactionTitle(t)
  const realized = t.realizedCents !== null
  const differs = realized && t.realizedCents !== t.plannedCents
  const editable = t.category.active && t.category.group.active
  const action = (type: StatementAction['type']) => () => onAction({ type, transaction: t })

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
          {t.category.dueDay !== null && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              <span className="sr-only">Vence dia </span>
              {String(t.category.dueDay).padStart(2, '0')}
            </span>
          )}
          <div className="min-w-0 flex-1 pl-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn('truncate', realized && 'text-muted-foreground')}>{title}</span>
              {t.series && (
                <Badge variant="secondary" className="shrink-0" title="Lançamento recorrente">
                  <RepeatIcon aria-hidden />
                  {t.series.index}/{t.series.count}
                </Badge>
              )}
            </div>
            {t.description && <p className="truncate text-xs text-muted-foreground">{t.category.name}</p>}
          </div>
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

/** The user's share of a group transaction: paid when someone in the group paid it. */
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
          <div className="min-w-0 flex-1 pl-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn('truncate', item.paid && 'text-muted-foreground')}>{title}</span>
              <Badge variant="outline" className="shrink-0">
                <UsersIcon aria-hidden />
                {group.name}
              </Badge>
              {item.series && (
                <Badge variant="secondary" className="shrink-0" title="Lançamento recorrente">
                  <RepeatIcon aria-hidden />
                  {item.series.index}/{item.series.count}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {item.category.name} · {status}
            </p>
          </div>
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

import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, CircleCheckIcon, ClockIcon, Link2Icon, UsersIcon } from 'lucide-react'
import { DueDayBadge, MoneyText } from '@/components/atoms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { GroupStatement, Month } from '@/features/budget/types'
import { cn } from '@/lib/utils'

interface GroupStatementsCardProps {
  statements: GroupStatement[]
  month: Month
  /** Lists each group's items too (the statement); the dashboard shows only the totals */
  detailed?: boolean
  /** Opens the link dialog of a group */
  onLink: (statement: GroupStatement) => void
}

/**
 * The final statement of the user's groups in the month, from their side:
 * their shares, what they paid, what they owe or are owed, and where the shares
 * count in their budget.
 */
export function GroupStatementsCard({ statements, month, detailed = false, onLink }: GroupStatementsCardProps) {
  return (
    <Card role="region" aria-label="Grupos">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon aria-hidden className="size-4" />
          Grupos
        </CardTitle>
        <CardDescription>
          Sua parte nas finanças compartilhadas. Ela entra no seu balanço na categoria vinculada a cada grupo;
          o acerto entre os membros fica no grupo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {statements.map((statement) => (
          <GroupSummary
            key={statement.group.id}
            statement={statement}
            month={month}
            detailed={detailed}
            onLink={() => onLink(statement)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function GroupSummary({
  statement: s,
  month,
  detailed,
  onLink,
}: {
  statement: GroupStatement
  month: Month
  detailed: boolean
  onLink: () => void
}) {
  const linked = s.link.expenseCategory || s.link.incomeCategory
  const owes = s.transfers.filter((t) => t.fromMemberId === s.memberId)
  const receives = s.transfers.filter((t) => t.toMemberId === s.memberId)

  return (
    <section aria-label={s.group.name} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 font-medium">
          {s.active ? (
            <Link
              to="/grupos/$groupId"
              params={{ groupId: String(s.group.id) }}
              search={{ month, tab: 'balanco' }}
              className="truncate hover:underline"
            >
              {s.group.name}
            </Link>
          ) : (
            <span className="truncate">{s.group.name}</span>
          )}
          {!s.active && <Badge variant="outline">Você saiu</Badge>}
        </h3>
        <NetBadge cents={s.netCents} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label="Sua parte nas despesas" cents={s.expenseShareCents} of={s.expenseCents} />
        {(s.incomeCents > 0 || s.incomeShareCents > 0) && (
          <Stat label="Sua parte nas receitas" cents={s.incomeShareCents} of={s.incomeCents} />
        )}
        <Stat label="Você pagou" cents={s.paidCents} />
        {s.receivedCents > 0 && <Stat label="Você recebeu" cents={s.receivedCents} />}
      </dl>

      {(owes.length > 0 || receives.length > 0) && (
        <ul aria-label={`Acerto em ${s.group.name}`} className="flex flex-col gap-1 text-sm">
          {owes.map((t) => (
            <li key={t.toMemberId} className="flex items-center gap-1.5">
              <ArrowRightIcon aria-hidden className="size-3.5 text-destructive" />
              Pague <MoneyText cents={t.amountCents} className="font-medium" /> a {t.toName}
            </li>
          ))}
          {receives.map((t) => (
            <li key={t.fromMemberId} className="flex items-center gap-1.5">
              <ArrowRightIcon aria-hidden className="size-3.5 rotate-180 text-emerald-600 dark:text-emerald-400" />
              {t.fromName} te paga <MoneyText cents={t.amountCents} className="font-medium" />
            </li>
          ))}
        </ul>
      )}

      {detailed && s.items.length > 0 && (
        <ul aria-label={`Lançamentos de ${s.group.name}`} className="flex flex-col gap-1 rounded-lg bg-muted/50 p-2 text-sm">
          {s.items.map((item) => (
            <li key={item.transactionId} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {item.paid ? (
                  <CircleCheckIcon aria-label="Pago" className="size-3.5 shrink-0 text-primary" />
                ) : item.groupPaid ? (
                  <ClockIcon
                    aria-label={`A acertar com ${item.paidByName ?? 'quem pagou'}`}
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                ) : (
                  <span aria-label="Pendente" className="size-3.5 shrink-0 rounded-full border" />
                )}
                {item.dueDay !== null && <DueDayBadge day={item.dueDay} className="px-1 py-0" />}
                <span className="truncate">{item.description}</span>
                {item.kind === 'INCOME' && <Badge variant="secondary">Receita</Badge>}
              </span>
              <span className="shrink-0 text-right">
                <MoneyText cents={item.shareCents} className="font-medium" />
                <span className="text-xs text-muted-foreground">
                  {' '}
                  de <MoneyText cents={item.totalCents} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {linked ? (
            <>
              No seu orçamento: despesas em{' '}
              <span className="font-medium text-foreground">{s.link.expenseCategory?.name ?? '—'}</span>, receitas em{' '}
              <span className="font-medium text-foreground">{s.link.incomeCategory?.name ?? '—'}</span>.
            </>
          ) : (
            'Não entra no seu orçamento: escolha uma categoria para somar sua parte ao seu balanço.'
          )}
        </p>
        {s.active && (
          <Button variant={linked ? 'ghost' : 'outline'} size="sm" onClick={onLink}>
            <Link2Icon />
            {linked ? 'Alterar vínculo' : 'Vincular categorias'}
          </Button>
        )}
      </div>
    </section>
  )
}

function Stat({ label, cents, of }: { label: string; cents: number; of?: number }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        <MoneyText cents={cents} className="font-medium" />
        {of !== undefined && (
          <span className="text-xs text-muted-foreground">
            {' '}
            de <MoneyText cents={of} />
          </span>
        )}
      </dd>
    </div>
  )
}

function NetBadge({ cents }: { cents: number }) {
  const label = cents > 0 ? 'A receber' : cents < 0 ? 'A pagar' : 'Em dia'
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm',
        cents > 0 && 'bg-emerald-500/10',
        cents < 0 && 'bg-destructive/10',
        cents === 0 && 'bg-muted text-muted-foreground',
      )}
    >
      {label}
      {cents !== 0 && <MoneyText cents={Math.abs(cents)} signed={false} className="font-medium" />}
    </span>
  )
}

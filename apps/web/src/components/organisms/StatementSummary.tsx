import { MoneyText } from '@/components/atoms'
import { Card } from '@/components/ui/card'
import type { Statement } from '@/features/transactions/statement'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

interface StatementSummaryProps {
  statement: Statement
  /** Initial balance + every month before this one */
  openingCents: number
}

/**
 * Headline numbers of the month's statement in one compact card (realized
 * amounts count, planned while pending): the closing balance stands out (to the
 * right on wide screens), the rest sits in a 2-column grid on phones and a
 * single row on wider screens.
 */
export function StatementSummary({ statement, openingCents }: StatementSummaryProps) {
  const [income, expense] = statement.sections
  const detail = (realized: number, pending: number) =>
    `Realizado ${formatCents(realized)} · a realizar ${formatCents(pending)}`

  return (
    <Card role="region" aria-label="Resumo do mês" className="gap-0 py-0 lg:flex-row-reverse">
      <SummaryItem
        title="Saldo final"
        cents={openingCents + statement.balanceCents}
        signed
        description="Abertura + saldo do mês"
        className="border-b p-4 lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-l"
        amountClassName="text-2xl"
      />
      <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-4 p-4 md:grid-cols-4">
        <SummaryItem
          title="Receitas do mês"
          cents={income.effectiveCents}
          description={detail(income.realizedCents, income.pendingCents)}
        />
        <SummaryItem
          title="Despesas do mês"
          cents={expense.effectiveCents}
          description={detail(expense.realizedCents, expense.pendingCents)}
        />
        <SummaryItem
          title="Saldo de abertura"
          cents={openingCents}
          signed
          description="Saldo inicial + meses anteriores"
        />
        <SummaryItem
          title="Saldo do mês"
          cents={statement.balanceCents}
          signed
          description="Receitas − despesas"
        />
      </div>
    </Card>
  )
}

function SummaryItem({
  title,
  cents,
  signed = false,
  description,
  className,
  amountClassName,
}: {
  title: string
  cents: number
  signed?: boolean
  description: string
  className?: string
  amountClassName?: string
}) {
  return (
    <div role="group" aria-label={title} className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-xs text-muted-foreground">{title}</span>
      <MoneyText cents={cents} signed={signed} className={cn('text-lg font-semibold', amountClassName)} />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

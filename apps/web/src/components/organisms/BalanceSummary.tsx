import { PencilIcon, PiggyBankIcon, ScaleIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { useState } from 'react'
import { InitialBalanceDialog, StatCard } from '@/components/molecules'
import { Button } from '@/components/ui/button'

interface BalanceSummaryProps {
  /** Initial balance + every month before the current one */
  openingCents: number
  incomeCents: number
  expenseCents: number
  initialBalanceCents: number
  onSaveInitialBalance: (cents: number) => Promise<void>
}

/** The five headline numbers of the current month. */
export function BalanceSummary({
  openingCents,
  incomeCents,
  expenseCents,
  initialBalanceCents,
  onSaveInitialBalance,
}: BalanceSummaryProps) {
  const [editing, setEditing] = useState(false)
  const monthCents = incomeCents - expenseCents

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard
        title="Saldo de abertura"
        cents={openingCents}
        signed
        description="Saldo inicial + meses anteriores"
        action={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ajustar saldo inicial"
            onClick={() => setEditing(true)}
          >
            <PencilIcon />
          </Button>
        }
      />
      <StatCard title="Receitas do mês" cents={incomeCents} icon={TrendingUpIcon} />
      <StatCard title="Despesas do mês" cents={expenseCents} icon={TrendingDownIcon} />
      <StatCard
        title="Saldo do mês"
        cents={monthCents}
        signed
        icon={ScaleIcon}
        description="Receitas − despesas"
      />
      <StatCard
        title="Saldo acumulado"
        cents={openingCents + monthCents}
        signed
        icon={PiggyBankIcon}
        description="Abertura + saldo do mês"
      />
      <InitialBalanceDialog
        open={editing}
        onOpenChange={setEditing}
        initialBalanceCents={initialBalanceCents}
        onSubmit={onSaveInitialBalance}
      />
    </div>
  )
}

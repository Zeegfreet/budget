import { PiggyBankIcon, TargetIcon } from 'lucide-react'
import { MoneyText } from '@/components/atoms'
import { EmptyState, GoalMeter } from '@/components/molecules'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPermille, type GoalsOverview } from '@/features/budget/goals'

interface GoalsPanelProps {
  overview: GoalsOverview
  /** e.g. "outubro de 2026" */
  monthLabel: string
  /** e.g. "out/26 a set/27" */
  periodLabel: string
  onEditGoals: () => void
}

/**
 * Goals of the expense types as a share of the income, current month and
 * whole period, plus what is left to save or invest ("Sobra / Aporte").
 */
export function GoalsPanel({ overview, monthLabel, periodLabel, onEditGoals }: GoalsPanelProps) {
  const { goals, totalGoalPercent, month, period, leftover } = overview
  const editButton = (
    <Button variant="outline" size="sm" onClick={onEditGoals}>
      <TargetIcon aria-hidden />
      Definir metas
    </Button>
  )

  return (
    <Card role="region" aria-label="Metas por tipo de despesa" className="gap-4">
      <CardHeader>
        <CardTitle>Metas por tipo de despesa</CardTitle>
        <CardDescription>
          Quanto das receitas cada tipo consome. Mês atual: {monthLabel}; período: {periodLabel}.
        </CardDescription>
        {goals.length > 0 && <CardAction>{editButton}</CardAction>}
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <EmptyState
            icon={TargetIcon}
            title="Nenhuma meta definida"
            description="Defina, por exemplo, 50% das receitas para Despesas Básicas e acompanhe aqui."
            action={editButton}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {/* As many columns as fit, stretched so the row is always full */}
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
              {goals.map((goal) => (
                <li
                  key={goal.id}
                  aria-label={goal.name}
                  className="flex flex-col gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{goal.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">Meta {goal.goalPercent}%</span>
                  </div>
                  <GoalMeter label="Mês atual" usage={goal.month} goalPercent={goal.goalPercent} />
                  <GoalMeter label="Período" usage={goal.period} goalPercent={goal.goalPercent} />
                </li>
              ))}
              <li
                aria-label="Sobra / Aporte"
                className="flex flex-col gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <PiggyBankIcon aria-hidden className="size-4 shrink-0 self-center text-primary" />
                    <span className="truncate">Sobra / Aporte</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">Meta mín. {leftover.targetPercent}%</span>
                </div>
                <GoalMeter label="Mês atual" usage={leftover.month} goalPercent={leftover.targetPercent} mode="min" />
                <GoalMeter label="Período" usage={leftover.period} goalPercent={leftover.targetPercent} mode="min" />
                <p className="text-xs text-muted-foreground">O que sobra das receitas para guardar ou investir.</p>
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Metas somadas: <span className="font-medium text-foreground">{totalGoalPercent}%</span> das receitas ·
              realizado no mês:{' '}
              <span className="font-medium text-foreground">
                {month.permille === null ? 'sem receitas' : formatPermille(month.permille)}
              </span>{' '}
              · no período:{' '}
              <span className="font-medium text-foreground">
                {period.permille === null ? 'sem receitas' : formatPermille(period.permille)}
              </span>{' '}
              · sobra no mês: <MoneyText cents={leftover.month.spentCents} className="font-medium text-foreground" />
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

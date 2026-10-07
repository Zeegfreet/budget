import { TargetIcon } from 'lucide-react'
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

/** Goals of the expense types as a share of the income: current month and whole period. */
export function GoalsPanel({ overview, monthLabel, periodLabel, onEditGoals }: GoalsPanelProps) {
  const { goals, totalGoalPercent, month, period } = overview
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
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

import { MoneyText } from '@/components/atoms'
import { formatPermille, type GoalUsage } from '@/features/budget/goals'
import { cn } from '@/lib/utils'

interface GoalMeterProps {
  /** e.g. "Mês atual" */
  label: string
  usage: GoalUsage
  goalPercent: number
  className?: string
}

const BAR = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  over: 'bg-destructive',
} as const

const TEXT = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  over: 'text-destructive',
} as const

/**
 * Thermometer of one goal: the bar is the share of the income spent, the
 * marker is the goal. The scale is 0–100% of the income.
 */
export function GoalMeter({ label, usage, goalPercent, className }: GoalMeterProps) {
  const { permille, status, spentCents } = usage
  const shown = permille === null ? 'sem receitas' : formatPermille(permille)
  const width = permille === null ? (spentCents > 0 ? 100 : 0) : Math.min(permille / 10, 100)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-medium tabular-nums', TEXT[status])}>{shown}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={permille === null ? undefined : permille / 10}
        aria-valuetext={`${permille === null ? shown : `${shown} das receitas`}, meta ${goalPercent}%`}
        data-status={status}
        className="relative h-2.5 rounded-full bg-muted"
      >
        <div className={cn('h-full rounded-full transition-[width]', BAR[status])} style={{ width: `${width}%` }} />
        <div
          aria-hidden
          title={`Meta: ${goalPercent}%`}
          className="absolute -top-1 h-4.5 w-0.5 rounded bg-foreground/70"
          style={{ left: `calc(${Math.min(goalPercent, 100)}% - 1px)` }}
        />
      </div>
      <MoneyText cents={spentCents} className="text-xs text-muted-foreground" />
    </div>
  )
}

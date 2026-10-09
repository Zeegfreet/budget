import { ChevronDownIcon, RepeatIcon, TrendingUpIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SeriesPosition } from '@/features/budget/types'
import { adjustmentOf, describeAdjustment, isOpenEnded } from '@/features/transactions/recurrence'

/**
 * "3/12" of a recurring launch ("3/∞" with no end, plus an arrow when it has
 * a scheduled adjustment). With `onClick` it is a button that opens the
 * series' range (extend, shorten or end it); otherwise just a label.
 */
export function SeriesBadge({
  series,
  title,
  onClick,
}: {
  series: SeriesPosition
  /** The launch's name, for the button's label */
  title: string
  onClick?: () => void
}) {
  const open = isOpenEnded(series)
  const adjustment = adjustmentOf(series)
  const text = (
    <>
      <RepeatIcon aria-hidden />
      {series.index}/{open ? '∞' : series.count}
      {adjustment && <TrendingUpIcon aria-hidden />}
    </>
  )
  const position = open ? `${series.index}, sem data de término` : `${series.index} de ${series.count}`
  const reajuste = adjustment ? `Reajuste ${describeAdjustment(adjustment)}` : null
  if (!onClick) {
    return (
      <Badge
        variant="secondary"
        className="shrink-0"
        title={['Lançamento recorrente', reajuste].filter(Boolean).join('. ')}
      >
        {text}
      </Badge>
    )
  }
  return (
    <Badge
      variant="secondary"
      className="shrink-0 cursor-pointer border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-95"
      asChild
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`Recorrência de ${title}: ${position}${reajuste ? `. ${reajuste}` : ''}`}
        title="Ajustar o período da recorrência"
      >
        {text}
        <ChevronDownIcon aria-hidden />
      </button>
    </Badge>
  )
}

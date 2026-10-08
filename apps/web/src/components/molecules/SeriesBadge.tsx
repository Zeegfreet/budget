import { RepeatIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SeriesPosition } from '@/features/budget/types'

/**
 * "3/12" of a recurring launch. With `onClick` it is a button that opens the
 * series' range (extend or shorten it); otherwise just a label.
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
  const text = (
    <>
      <RepeatIcon aria-hidden />
      {series.index}/{series.count}
    </>
  )
  if (!onClick) {
    return (
      <Badge variant="secondary" className="shrink-0" title="Lançamento recorrente">
        {text}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="shrink-0 hover:bg-secondary/70" asChild>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Recorrência de ${title}: ${series.index} de ${series.count}`}
        title="Ajustar o período da recorrência"
      >
        {text}
      </button>
    </Badge>
  )
}

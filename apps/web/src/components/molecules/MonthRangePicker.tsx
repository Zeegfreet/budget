import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  currentMonth,
  defaultRange,
  formatMonthLabel,
  formatMonthLong,
  isWithinReach,
  lastMonths,
  MAX_RANGE_MONTHS,
  orderedRange,
  yearMonths,
  yearOf,
  yearRange,
  type MonthRange,
} from '@/features/budget/months'
import type { Month } from '@/features/budget/types'
import { cn } from '@/lib/utils'

interface MonthRangePickerProps extends MonthRange {
  onChange: (range: MonthRange) => void
}

const sameRange = (a: MonthRange, b: MonthRange) => a.from === b.from && a.to === b.to

/**
 * The period as a button opening a calendar of months (two years side by
 * side): a click picks the first month, a second one the last (either order,
 * up to `MAX_RANGE_MONTHS`). Shortcuts in the footer; "Redefinir" beside it
 * goes back to the default period.
 */
export function MonthRangePicker({ from, to, onChange }: MonthRangePickerProps) {
  const today = currentMonth()
  const standard = defaultRange(today)
  const [open, setOpen] = useState(false)
  const [firstYear, setFirstYear] = useState(() => yearOf(from))
  /** The first month of a period being picked */
  const [pending, setPending] = useState<Month | null>(null)
  const [hovered, setHovered] = useState<Month | null>(null)

  function changeOpen(next: boolean) {
    setOpen(next)
    // Every opening starts over, on the years of the current period
    setPending(null)
    setHovered(null)
    if (next) setFirstYear(yearOf(from))
  }

  function apply(range: MonthRange) {
    onChange(range)
    changeOpen(false)
  }

  function pick(month: Month) {
    if (pending === null) setPending(month)
    else apply(orderedRange(pending, month))
  }

  // While picking, the period previews up to the hovered month
  const shown =
    pending === null
      ? { from, to }
      : orderedRange(pending, hovered && isWithinReach(pending, hovered) ? hovered : pending)

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Período">
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" aria-label={`Período: ${formatMonthLong(from)} a ${formatMonthLong(to)}`}>
            <CalendarIcon />
            <span className="tabular-nums">
              {formatMonthLabel(from)} – {formatMonthLabel(to)}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(calc(100vw-2rem),34rem)] gap-3 p-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon-sm" aria-label="Ano anterior" onClick={() => setFirstYear((y) => y - 1)}>
              <ChevronLeftIcon />
            </Button>
            <p className="text-center text-sm text-muted-foreground" aria-live="polite">
              {pending === null
                ? 'Escolha o primeiro mês do período'
                : `Agora o último mês (até ${MAX_RANGE_MONTHS} meses)`}
            </p>
            <Button variant="ghost" size="icon-sm" aria-label="Próximo ano" onClick={() => setFirstYear((y) => y + 1)}>
              <ChevronRightIcon />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[firstYear, firstYear + 1].map((year) => (
              <div key={year} role="group" aria-label={String(year)} className="flex flex-col gap-2">
                <p className="text-center text-sm font-medium">{year}</p>
                <div className="grid grid-cols-4 gap-1 sm:grid-cols-3">
                  {yearMonths(year).map((month) => {
                    const edge = month === shown.from || month === shown.to
                    const inside = month > shown.from && month < shown.to
                    return (
                      <Button
                        key={month}
                        variant="ghost"
                        size="sm"
                        aria-label={formatMonthLong(month)}
                        aria-pressed={edge || inside}
                        disabled={pending !== null && !isWithinReach(pending, month)}
                        onClick={() => pick(month)}
                        onMouseEnter={() => setHovered(month)}
                        onFocus={() => setHovered(month)}
                        className={cn(
                          'capitalize',
                          inside && 'bg-accent text-accent-foreground',
                          edge && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
                          month === today && !edge && 'ring-1 ring-ring',
                        )}
                      >
                        {formatMonthLabel(month).split('/')[0]}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1 border-t pt-3">
            <Button variant="secondary" size="sm" onClick={() => apply(standard)}>
              Próximos 12 meses
            </Button>
            <Button variant="secondary" size="sm" onClick={() => apply(lastMonths(12, today))}>
              Últimos 12 meses
            </Button>
            <Button variant="secondary" size="sm" onClick={() => apply(yearRange(today))}>
              Ano atual
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="sm"
        aria-label="Redefinir período"
        disabled={sameRange({ from, to }, standard)}
        onClick={() => onChange(standard)}
      >
        <RotateCcwIcon />
        <span className="hidden sm:inline">Redefinir</span>
      </Button>
    </div>
  )
}

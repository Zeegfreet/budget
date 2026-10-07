import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addMonths, currentMonth, formatMonthLong } from '@/features/budget/months'
import type { Month } from '@/features/budget/types'

interface MonthSwitcherProps {
  month: Month
  onChange: (month: Month) => void
}

/**
 * "‹ outubro de 2026 ›", plus a shortcut back to the current month. The month
 * name stretches to fill a wider container (e.g. full width on phones).
 */
export function MonthSwitcher({ month, onChange }: MonthSwitcherProps) {
  const today = currentMonth()
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Mês">
      <Button variant="outline" size="icon-sm" aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}>
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-40 flex-1 text-center font-medium capitalize" aria-live="polite">
        {formatMonthLong(month)}
      </span>
      <Button variant="outline" size="icon-sm" aria-label="Próximo mês" onClick={() => onChange(addMonths(month, 1))}>
        <ChevronRightIcon />
      </Button>
      {month !== today && (
        <Button variant="ghost" size="sm" onClick={() => onChange(today)}>
          Mês atual
        </Button>
      )}
    </div>
  )
}

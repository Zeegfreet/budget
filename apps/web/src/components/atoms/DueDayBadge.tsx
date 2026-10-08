import { cn } from '@/lib/utils'

/** The day of the month something is due, as a small "05" chip ("Vence dia 05" for screen readers). */
export function DueDayBadge({ day, className }: { day: number; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground',
        className,
      )}
    >
      <span className="sr-only">Vence dia </span>
      {String(day).padStart(2, '0')}
    </span>
  )
}

import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckButtonProps {
  pressed: boolean
  onPressedChange?: (pressed: boolean) => void
  /** What it confirms, for screen readers ("Recebido: Munique — Aluguel") */
  'aria-label': string
  /** Shows the state without letting it change */
  disabled?: boolean
  className?: string
}

/**
 * A small green square with a check mark: outlined while off, solid green
 * once pressed. The button is finger-sized around the small square.
 */
export function CheckButton({ pressed, onPressedChange, disabled, className, ...props }: CheckButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={props['aria-label']}
      disabled={disabled}
      onClick={() => onPressedChange?.(!pressed)}
      className={cn(
        'group/check flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none disabled:cursor-default',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-6 items-center justify-center rounded-md border-2 border-success transition-colors group-focus-visible/check:ring-3 group-focus-visible/check:ring-ring/50',
          pressed
            ? 'bg-success text-success-foreground'
            : 'bg-transparent text-success/40 group-enabled/check:group-hover/check:bg-success/10 group-enabled/check:group-hover/check:text-success',
          disabled && 'opacity-60',
        )}
      >
        <CheckIcon className="size-4" strokeWidth={3} />
      </span>
    </button>
  )
}

import { cn } from '@/lib/utils'

/** Form-level error message, announced to assistive tech as soon as it appears. */
export function FormAlert({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      role="alert"
      className={cn(
        'rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive',
        className,
      )}
      {...props}
    />
  )
}

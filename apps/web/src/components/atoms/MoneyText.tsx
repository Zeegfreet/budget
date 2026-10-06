import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'

interface MoneyTextProps extends React.ComponentProps<'span'> {
  /** Amount in integer cents */
  cents: number
  currency?: string
  /** Colors positive amounts green and negative red */
  signed?: boolean
}

export function MoneyText({
  cents,
  currency = 'BRL',
  signed = false,
  className,
  ...props
}: MoneyTextProps) {
  return (
    <span
      className={cn(
        'tabular-nums',
        signed && cents > 0 && 'text-emerald-600 dark:text-emerald-400',
        signed && cents < 0 && 'text-destructive',
        className,
      )}
      {...props}
    >
      {formatCents(cents, 'pt-BR', currency)}
    </span>
  )
}

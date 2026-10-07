import { Input } from '@/components/ui/input'
import { parseMoneyInput } from '@/lib/money'
import { cn } from '@/lib/utils'

interface MoneyInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  /** Raw text as typed ("1.800,00"); parse it with `parseMoneyInput` */
  value: string
  onValueChange: (text: string) => void
  allowNegative?: boolean
}

/** Text input for amounts in reais. Flags itself invalid while the text isn't an amount. */
export function MoneyInput({
  value,
  onValueChange,
  allowNegative = false,
  className,
  ...props
}: MoneyInputProps) {
  const invalid = value.trim() !== '' && parseMoneyInput(value, { allowNegative }) === null

  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      aria-invalid={invalid || undefined}
      className={cn('text-right tabular-nums', className)}
      {...props}
    />
  )
}

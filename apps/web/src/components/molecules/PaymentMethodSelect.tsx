import { useId } from 'react'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { selectableMethods } from '@/features/payment-methods/labels'
import type { PaymentMethod } from '@/features/payment-methods/types'

interface PaymentMethodSelectProps {
  label?: string
  /** The user's methods; only active ones (plus `current`) are offered */
  methods: PaymentMethod[]
  /** The method saved so far, kept as an option even if inactive */
  current: number | null
  /** The chosen id, or `null` for none */
  value: number | null
  onChange: (value: number | null) => void
  /** Shown while no method is chosen */
  emptyHint?: string
}

/** Picks the card or account an expense is paid with; its due day overrides the category's. */
export function PaymentMethodSelect({
  label = 'Meio de pagamento',
  methods,
  current,
  value,
  onChange,
  emptyHint = 'Sem meio de pagamento, vale o vencimento da categoria.',
}: PaymentMethodSelectProps) {
  const id = useId()
  const options = selectableMethods(methods, current)
  const chosen = options.find((m) => m.id === value)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        className="w-full"
        value={value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <NativeSelectOption value="">Nenhum</NativeSelectOption>
        {options.map((m) => (
          <NativeSelectOption key={m.id} value={m.id}>
            {m.active ? m.name : `${m.name} (inativo)`}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldDescription>
        {!chosen
          ? emptyHint
          : chosen.dueDay === null
            ? `${chosen.name} não tem vencimento próprio: vale o da categoria.`
            : `Vence dia ${chosen.dueDay}, pelo ${chosen.name}.`}
      </FieldDescription>
    </Field>
  )
}

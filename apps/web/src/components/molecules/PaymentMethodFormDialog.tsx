import { useId, useState } from 'react'
import { FormAlert, FormDialogContent, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PAYMENT_METHOD_TYPES } from '@/features/payment-methods/labels'
import type { PaymentMethodInput, PaymentMethodType } from '@/features/payment-methods/types'
import { FormField } from './FormField'

export const MAX_PAYMENT_METHOD_NAME_LENGTH = 60

interface PaymentMethodFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing: the current values */
  initial?: PaymentMethodInput
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (values: PaymentMethodInput) => Promise<void>
  errorMessage: (error: unknown) => string
}

/** Creates or edits a payment method: name, type and the invoice's due day. */
export function PaymentMethodFormDialog({ open, onOpenChange, ...props }: PaymentMethodFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent>
        {/* Mounted only while open, so it always starts from `initial` */}
        {open && <PaymentMethodForm onDone={() => onOpenChange(false)} {...props} />}
      </FormDialogContent>
    </Dialog>
  )
}

type Errors = Partial<Record<'name' | 'dueDay', string>>

function PaymentMethodForm({
  initial,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<PaymentMethodFormDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const editing = initial !== undefined
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<PaymentMethodType>(initial?.type ?? 'CREDIT_CARD')
  const [dueDay, setDueDay] = useState(initial?.dueDay?.toString() ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const id = useId()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    const day = dueDay.trim() === '' ? null : /^\d+$/.test(dueDay.trim()) ? Number(dueDay) : NaN
    const next: Errors = {}
    if (!trimmed) next.name = 'Informe o nome.'
    else if (trimmed.length > MAX_PAYMENT_METHOD_NAME_LENGTH) {
      next.name = `Use até ${MAX_PAYMENT_METHOD_NAME_LENGTH} caracteres.`
    }
    if (day !== null && !(day >= 1 && day <= 31)) next.dueDay = 'Informe um dia de 1 a 31.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setPending(true)
    setError(null)
    try {
      await onSubmit({ name: trimmed, type, dueDay: day })
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? 'Editar meio de pagamento' : 'Novo meio de pagamento'}</DialogTitle>
        <DialogDescription>
          As despesas lançadas nele passam a vencer no dia dele, e a fatura do mês reúne todas.
        </DialogDescription>
      </DialogHeader>
      <FormField
        label="Nome"
        placeholder="Ex.: Cartão Americanas"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_PAYMENT_METHOD_NAME_LENGTH}
        error={errors.name}
        autoFocus
      />
      <Field>
        <FieldLabel htmlFor={`${id}-type`}>Tipo</FieldLabel>
        <NativeSelect
          id={`${id}-type`}
          className="w-full"
          value={type}
          onChange={(e) => setType(e.target.value as PaymentMethodType)}
        >
          {PAYMENT_METHOD_TYPES.map((t) => (
            <NativeSelectOption key={t.value} value={t.value}>
              {t.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <FormField
        label="Dia de vencimento (opcional)"
        description="Sem dia, cada lançamento segue o vencimento da sua categoria."
        inputMode="numeric"
        placeholder="Ex.: 12"
        value={dueDay}
        onChange={(e) => setDueDay(e.target.value)}
        error={errors.dueDay}
        className="w-24"
      />
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {editing ? 'Salvar' : 'Criar'}
        </Button>
      </DialogFooter>
    </form>
  )
}

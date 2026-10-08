import { useId, useState } from 'react'
import { FormAlert, FormDialogContent, MoneyText, Spinner } from '@/components/atoms'
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
import type { EntryKind } from '@/features/budget/types'
import type { GroupMember } from '@/features/groups/types'

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: EntryKind
  title: string
  amountCents: number
  members: GroupMember[]
  /** Preselected member (the current payer, or the current user) */
  initialMemberId: number
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (memberId: number) => Promise<void>
  errorMessage: (error: unknown) => string
}

/** Records which member paid an expense (or received an income) of the group. */
export function PaymentDialog({ open, onOpenChange, ...props }: PaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent>{open && <PaymentForm onDone={() => onOpenChange(false)} {...props} />}</FormDialogContent>
    </Dialog>
  )
}

function PaymentForm({
  kind,
  title,
  amountCents,
  members,
  initialMemberId,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<PaymentDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [memberId, setMemberId] = useState(String(initialMemberId))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const id = useId()
  const income = kind === 'INCOME'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit(Number(memberId))
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
        <DialogTitle>{income ? 'Marcar como recebido' : 'Marcar como pago'}</DialogTitle>
        <DialogDescription>
          {title}: <MoneyText cents={amountCents} />.{' '}
          {income
            ? 'Quem recebeu fica devendo a parte dos outros membros.'
            : 'Quem pagou tem a receber a parte dos outros membros.'}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={`${id}-member`}>{income ? 'Recebido por' : 'Pago por'}</FieldLabel>
        <NativeSelect
          id={`${id}-member`}
          className="w-full"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          autoFocus
        >
          {members.map((m) => (
            <NativeSelectOption key={m.id} value={m.id}>
              {m.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Confirmar
        </Button>
      </DialogFooter>
    </form>
  )
}

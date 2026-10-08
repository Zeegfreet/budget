import { useState } from 'react'
import { FormAlert, FormDialogContent, MoneyInput, MoneyText, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { formatAmount, parseMoneyInput } from '@/lib/money'

interface RealizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What was paid or received, e.g. "Aluguel" */
  title: string
  plannedCents: number
  /** Starting value: the realized amount, if any, or the planned one */
  initialCents: number
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (cents: number) => Promise<void>
  errorMessage: (error: unknown) => string
}

/** Marks a transaction as realized with the amount actually paid or received. */
export function RealizeDialog({ open, onOpenChange, ...props }: RealizeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent>
        {/* Mounted only while open, so it always starts from `initialCents` */}
        {open && <RealizeForm onDone={() => onOpenChange(false)} {...props} />}
      </FormDialogContent>
    </Dialog>
  )
}

function RealizeForm({
  title,
  plannedCents,
  initialCents,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<RealizeDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [text, setText] = useState(formatAmount(initialCents))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const cents = text.trim() === '' ? 0 : parseMoneyInput(text)
    if (cents === null) {
      setError('Informe um valor válido, por exemplo 1.500,00.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await onSubmit(cents)
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
        <DialogTitle>Valor realizado</DialogTitle>
        <DialogDescription>
          Quanto foi efetivamente pago ou recebido em {title}. Previsto: <MoneyText cents={plannedCents} />.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="realized-amount">Valor realizado (R$)</Label>
        <MoneyInput id="realized-amount" value={text} onValueChange={setText} autoFocus />
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Marcar como realizado
        </Button>
      </DialogFooter>
    </form>
  )
}

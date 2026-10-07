import { useState } from 'react'
import { FormAlert, MoneyInput, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api/client'
import { formatAmount, parseMoneyInput } from '@/lib/money'

interface InitialBalanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialBalanceCents: number
  /** Rejects with `ApiError` to show its messages */
  onSubmit: (cents: number) => Promise<void>
}

/** Edits the balance the user had before the budget's first month. */
export function InitialBalanceDialog({ open, onOpenChange, ...props }: InitialBalanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so it always starts from the saved value */}
        {open && <InitialBalanceForm onDone={() => onOpenChange(false)} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function InitialBalanceForm({
  initialBalanceCents,
  onSubmit,
  onDone,
}: Omit<InitialBalanceDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [text, setText] = useState(formatAmount(initialBalanceCents))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const cents = text.trim() === '' ? 0 : parseMoneyInput(text, { allowNegative: true })
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
      setError(e instanceof ApiError ? e.messages.join(' ') : 'Não foi possível salvar o saldo inicial.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Saldo inicial</DialogTitle>
        <DialogDescription>
          Quanto você tinha antes do primeiro mês lançado. Use um valor negativo para dívidas.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="initial-balance">Valor (R$)</Label>
        <MoneyInput
          id="initial-balance"
          value={text}
          onValueChange={setText}
          allowNegative
          autoFocus
        />
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}

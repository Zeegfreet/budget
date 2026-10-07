import { useState } from 'react'
import { FormAlert, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from './FormField'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (email: string) => Promise<void>
  errorMessage: (error: unknown) => string
}

/** Invites a registered user, by e-mail, to join the group. */
export function InviteMemberDialog({ open, onOpenChange, ...props }: InviteMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <InviteForm onDone={() => onOpenChange(false)} {...props} />}</DialogContent>
    </Dialog>
  )
}

function InviteForm({
  groupName,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<InviteMemberDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const value = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(value)) {
      setEmailError('Informe um e-mail válido.')
      return
    }
    setEmailError(undefined)
    setPending(true)
    setError(null)
    try {
      await onSubmit(value)
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
        <DialogTitle>Convidar membro</DialogTitle>
        <DialogDescription>
          A pessoa precisa ter uma conta. Ela verá o convite para {groupName} em Grupos e entra no grupo ao aceitar.
        </DialogDescription>
      </DialogHeader>
      <FormField
        label="E-mail"
        type="email"
        placeholder="nome@exemplo.com"
        autoComplete="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={emailError}
        autoFocus
      />
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Enviar convite
        </Button>
      </DialogFooter>
    </form>
  )
}

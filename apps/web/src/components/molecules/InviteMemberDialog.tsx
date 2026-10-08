import { useState } from 'react'
import { FormAlert, FormDialogContent, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { needsNickname } from '@/features/groups/errors'
import type { InvitationInput } from '@/features/groups/types'
import { FormField } from './FormField'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NICKNAME_LENGTH = 100

interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  /** Rejects to show `errorMessage(error)` (or the nickname field's error when one is needed) */
  onSubmit: (input: InvitationInput) => Promise<void>
  errorMessage: (error: unknown) => string
}

/**
 * Invites someone by e-mail to join the group. Without an account, the
 * nickname pre-registers them and they join right away.
 */
export function InviteMemberDialog({ open, onOpenChange, ...props }: InviteMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent>{open && <InviteForm onDone={() => onOpenChange(false)} {...props} />}</FormDialogContent>
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
  const [nickname, setNickname] = useState('')
  const [nicknameError, setNicknameError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const value = email.trim().toLowerCase()
    const name = nickname.trim()
    const invalidEmail = !EMAIL_PATTERN.test(value)
    const invalidName = name !== '' && name.length < 2
    setEmailError(invalidEmail ? 'Informe um e-mail válido.' : undefined)
    setNicknameError(invalidName ? 'O apelido deve ter ao menos 2 caracteres.' : undefined)
    if (invalidEmail || invalidName) return
    setPending(true)
    setError(null)
    try {
      await onSubmit(name ? { email: value, nickname: name } : { email: value })
      onDone()
    } catch (e) {
      if (needsNickname(e)) {
        setNicknameError('Essa pessoa ainda não tem conta. Informe um apelido para pré-cadastrá-la.')
      } else {
        setError(errorMessage(e))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Convidar membro</DialogTitle>
        <DialogDescription>
          Enviamos um e-mail para a pessoa. Quem já tem conta verá o convite para {groupName} em Grupos e entra ao
          aceitar. Quem ainda não tem entra agora com o apelido e recebe um link para ativar a conta.
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
      <FormField
        label="Apelido (se a pessoa ainda não tiver conta)"
        description="Usado no grupo até a pessoa concluir o cadastro."
        placeholder="Ex.: Bruno"
        autoComplete="off"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={MAX_NICKNAME_LENGTH}
        error={nicknameError}
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

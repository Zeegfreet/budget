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
import type { GroupInput } from '@/features/groups/types'
import { FormField } from './FormField'

export const MAX_GROUP_NAME_LENGTH = 60
export const MAX_GROUP_DESCRIPTION_LENGTH = 120

interface GroupFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing: the current values */
  initial?: GroupInput
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (values: GroupInput) => Promise<void>
  errorMessage: (error: unknown) => string
}

/** Creates a finance group or renames one. */
export function GroupFormDialog({ open, onOpenChange, ...props }: GroupFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent>{open && <GroupForm onDone={() => onOpenChange(false)} {...props} />}</FormDialogContent>
    </Dialog>
  )
}

function GroupForm({
  initial,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<GroupFormDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [nameError, setNameError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Informe o nome do grupo.')
      return
    }
    setNameError(undefined)
    setPending(true)
    setError(null)
    try {
      await onSubmit({ name: trimmed, description: description.trim() || null })
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
        <DialogTitle>{initial ? 'Editar grupo' : 'Novo grupo'}</DialogTitle>
        <DialogDescription>
          {initial
            ? 'Altere o nome ou a descrição do grupo.'
            : 'Um grupo reúne receitas e despesas divididas entre pessoas, como as contas de uma república.'}
        </DialogDescription>
      </DialogHeader>
      <FormField
        label="Nome"
        placeholder="Ex.: República"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_GROUP_NAME_LENGTH}
        error={nameError}
        autoFocus
      />
      <FormField
        label="Descrição (opcional)"
        placeholder="Ex.: apartamento da Rua A"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={MAX_GROUP_DESCRIPTION_LENGTH}
      />
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {initial ? 'Salvar' : 'Criar grupo'}
        </Button>
      </DialogFooter>
    </form>
  )
}

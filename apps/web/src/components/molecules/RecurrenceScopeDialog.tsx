import { useState } from 'react'
import { FormAlert, Spinner } from '@/components/atoms'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { RecurrenceScope } from '@/features/transactions/types'

interface RecurrenceScopeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Changing or deleting the occurrence */
  action: 'update' | 'delete'
  /** Closes the dialog when it resolves; a rejection shows `errorMessage(error)` */
  onChoose: (scope: RecurrenceScope) => Promise<void>
  errorMessage: (error: unknown) => string
}

const COPY = {
  update: {
    title: 'Alterar lançamento recorrente',
    description:
      'Este lançamento se repete nos próximos meses. Deseja aplicar a alteração também aos próximos? Os já realizados não mudam.',
    one: 'Manter os próximos',
    following: 'Alterar também os próximos',
  },
  delete: {
    title: 'Excluir lançamento recorrente',
    description:
      'Este lançamento se repete nos próximos meses. Deseja excluir também os próximos? Os já realizados são mantidos.',
    one: 'Excluir só este',
    following: 'Excluir também os próximos',
  },
} as const

/** Asks whether a change to one occurrence of a series also applies to the later ones. */
export function RecurrenceScopeDialog({
  open,
  onOpenChange,
  action,
  onChoose,
  errorMessage,
}: RecurrenceScopeDialogProps) {
  const [pending, setPending] = useState<RecurrenceScope | null>(null)
  const [error, setError] = useState<string | null>(null)
  const copy = COPY[action]

  function change(next: boolean) {
    if (pending) return
    setError(null)
    onOpenChange(next)
  }

  async function choose(scope: RecurrenceScope) {
    setPending(scope)
    setError(null)
    try {
      await onChoose(scope)
      onOpenChange(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(null)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto [overflow-wrap:anywhere]">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FormAlert>{error}</FormAlert>}
        {/* Three long labels don't fit side by side: stacked on every screen */}
        <AlertDialogFooter className="sm:flex-col-reverse sm:justify-start">
          <AlertDialogCancel disabled={!!pending}>Cancelar</AlertDialogCancel>
          {/* Plain buttons: an Action would close before the request ends */}
          <Button variant="outline" disabled={!!pending} onClick={() => choose('ONE')}>
            {pending === 'ONE' && <Spinner />}
            {copy.one}
          </Button>
          <Button
            variant={action === 'delete' ? 'destructive' : 'default'}
            disabled={!!pending}
            onClick={() => choose('FOLLOWING')}
          >
            {pending === 'FOLLOWING' && <Spinner />}
            {copy.following}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

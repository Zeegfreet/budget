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
import { Input } from '@/components/ui/input'
import { categoryErrorMessage } from '@/features/budget/errors'
import { cn } from '@/lib/utils'

export interface GoalTarget {
  id: number
  name: string
  goalPercent: number | null
}

interface GoalsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Active expense types */
  groups: GoalTarget[]
  /** Receives only the changed goals (`null` removes one) */
  onSubmit: (changes: { id: number; goalPercent: number | null }[]) => Promise<void>
}

/** Sets the goal (share of the income) of every expense type at once. */
export function GoalsDialog({ open, onOpenChange, ...props }: GoalsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent>{open && <GoalsForm onDone={() => onOpenChange(false)} {...props} />}</FormDialogContent>
    </Dialog>
  )
}

/** '' → null, 1–100 → number, anything else → NaN */
const parseGoal = (text: string) => {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
  return value >= 1 && value <= 100 ? value : NaN
}

function GoalsForm({
  groups,
  onSubmit,
  onDone,
}: Omit<GoalsDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [texts, setTexts] = useState(() =>
    Object.fromEntries(groups.map((g) => [g.id, g.goalPercent?.toString() ?? ''])),
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const parsed = groups.map((g) => ({ ...g, next: parseGoal(texts[g.id]) }))
  const invalid = parsed.filter((g) => Number.isNaN(g.next))
  const total = parsed.reduce((sum, g) => sum + (Number.isNaN(g.next) ? 0 : (g.next ?? 0)), 0)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (invalid.length > 0) {
      setError('Use percentuais inteiros entre 1 e 100, ou deixe em branco para não ter meta.')
      return
    }
    const changes = parsed
      .filter((g) => g.next !== g.goalPercent)
      .map((g) => ({ id: g.id, goalPercent: g.next }))
    setPending(true)
    setError(null)
    try {
      if (changes.length > 0) await onSubmit(changes)
      onDone()
    } catch (e) {
      setError(categoryErrorMessage(e, 'Não foi possível aplicar as metas.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Metas por tipo de despesa</DialogTitle>
        <DialogDescription>
          Quanto das receitas cada tipo pode consumir, em %. Ex.: 50% para Despesas Básicas. Deixe em branco para
          não ter meta. As metas entram no planejamento e só são gravadas ao clicar em Salvar.
        </DialogDescription>
      </DialogHeader>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum tipo de despesa ativo.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {parsed.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3">
              <label htmlFor={`goal-${g.id}`} className="min-w-0 text-sm">
                {g.name}
              </label>
              <div className="flex shrink-0 items-center gap-1">
                <Input
                  id={`goal-${g.id}`}
                  inputMode="numeric"
                  className="w-20 text-right"
                  aria-invalid={Number.isNaN(g.next) || undefined}
                  value={texts[g.id]}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [g.id]: e.target.value }))}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p
        role="status"
        className={cn('text-sm', total > 100 ? 'text-destructive' : 'text-muted-foreground')}
      >
        Soma das metas: {total}%{total > 100 && ' — acima de 100% das receitas'}
      </p>
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          Aplicar metas
        </Button>
      </DialogFooter>
    </form>
  )
}

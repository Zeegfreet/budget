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
import { categoryErrorMessage } from '@/features/budget/errors'
import { FormField } from './FormField'

export const MAX_NAME_LENGTH = 60
export const MAX_DESCRIPTION_LENGTH = 120

export interface CategoryFormValues {
  name: string
  description: string | null
  dueDay: number | null
  goalPercent: number | null
}

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** `category` asks for description and due day; `group` (a type) may ask for a goal */
  variant: 'category' | 'group'
  /** Shows the goal field (expense types) */
  withGoal?: boolean
  initial?: Partial<CategoryFormValues>
  submitLabel?: string
  /** Rejects with `ApiError` to show its messages */
  onSubmit: (values: CategoryFormValues) => Promise<void>
}

/** Creates or edits a type or a category of the budget. */
export function CategoryFormDialog({ open, onOpenChange, ...props }: CategoryFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so it always starts from `initial` */}
        {open && <CategoryForm onDone={() => onOpenChange(false)} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

/** Blank → null; whole number in range → number; otherwise undefined (invalid). */
function parseWhole(text: string, min: number, max: number): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return value >= min && value <= max ? value : undefined
}

type Errors = Partial<Record<'name' | 'description' | 'dueDay' | 'goalPercent', string>>

function CategoryForm({
  title,
  description,
  variant,
  withGoal = false,
  initial = {},
  submitLabel = 'Salvar',
  onSubmit,
  onDone,
}: Omit<CategoryFormDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [name, setName] = useState(initial.name ?? '')
  const [note, setNote] = useState(initial.description ?? '')
  const [dueDay, setDueDay] = useState(initial.dueDay?.toString() ?? '')
  const [goal, setGoal] = useState(initial.goalPercent?.toString() ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const isCategory = variant === 'category'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const values = {
      name: name.trim(),
      description: isCategory ? note.trim() || null : null,
      dueDay: isCategory ? parseWhole(dueDay, 1, 31) : null,
      goalPercent: withGoal ? parseWhole(goal, 1, 100) : null,
    }
    const next: Errors = {}
    if (!values.name) next.name = 'Informe o nome.'
    else if (values.name.length > MAX_NAME_LENGTH) next.name = `Use até ${MAX_NAME_LENGTH} caracteres.`
    if ((values.description?.length ?? 0) > MAX_DESCRIPTION_LENGTH) {
      next.description = `Use até ${MAX_DESCRIPTION_LENGTH} caracteres.`
    }
    if (values.dueDay === undefined) next.dueDay = 'Informe um dia entre 1 e 31.'
    if (values.goalPercent === undefined) next.goalPercent = 'Informe um percentual inteiro entre 1 e 100.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setPending(true)
    setError(null)
    try {
      await onSubmit(values as CategoryFormValues)
      onDone()
    } catch (e) {
      setError(categoryErrorMessage(e, 'Não foi possível salvar.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <FormField
        label="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_NAME_LENGTH}
        error={errors.name}
        autoFocus
      />
      {isCategory && (
        <>
          <FormField
            label="Descrição (opcional)"
            placeholder="Ex.: apartamento do centro"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_DESCRIPTION_LENGTH}
            error={errors.description}
          />
          <FormField
            label="Dia de vencimento (opcional)"
            description="Dia do mês em que a conta vence, de 1 a 31."
            placeholder="Ex.: 10"
            inputMode="numeric"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            error={errors.dueDay}
            className="w-24"
          />
        </>
      )}
      {withGoal && (
        <FormField
          label="Meta (% das receitas, opcional)"
          description="Quanto das receitas do mês este tipo pode consumir, ex.: 50."
          inputMode="numeric"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          error={errors.goalPercent}
          className="w-24"
        />
      )}
      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

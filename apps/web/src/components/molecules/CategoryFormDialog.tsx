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
import { categoryErrorMessage } from '@/features/budget/errors'
import { parseWhole } from '@/lib/numbers'
import { FormField } from './FormField'

export const MAX_NAME_LENGTH = 60

export interface CategoryFormValues {
  name: string
  goalPercent: number | null
}

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
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
      <FormDialogContent>
        {/* Mounted only while open, so it always starts from `initial` */}
        {open && <CategoryForm onDone={() => onOpenChange(false)} {...props} />}
      </FormDialogContent>
    </Dialog>
  )
}

type Errors = Partial<Record<'name' | 'goalPercent', string>>

function CategoryForm({
  title,
  description,
  withGoal = false,
  initial = {},
  submitLabel = 'Salvar',
  onSubmit,
  onDone,
}: Omit<CategoryFormDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [name, setName] = useState(initial.name ?? '')
  const [goal, setGoal] = useState(initial.goalPercent?.toString() ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const values = {
      name: name.trim(),
      goalPercent: withGoal ? parseWhole(goal, 1, 100) : null,
    }
    const next: Errors = {}
    if (!values.name) next.name = 'Informe o nome.'
    else if (values.name.length > MAX_NAME_LENGTH) next.name = `Use até ${MAX_NAME_LENGTH} caracteres.`
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

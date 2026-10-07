import { useId, useState } from 'react'
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select'
import type { CategoryGroup, EntryKind } from '@/features/budget/types'
import type { GroupLink } from '@/features/groups/types'

interface GroupLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  /** The user's category tree */
  categories: CategoryGroup[]
  /** The current link */
  initial: GroupLink
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (link: GroupLink) => Promise<void>
  errorMessage: (error: unknown) => string
}

/** Chooses the personal categories where the user's shares of a group count. */
export function GroupLinkDialog({ open, onOpenChange, ...props }: GroupLinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <GroupLinkForm onDone={() => onOpenChange(false)} {...props} />}</DialogContent>
    </Dialog>
  )
}

const toValue = (id: number | null) => (id === null ? '' : String(id))
const toId = (value: string) => (value === '' ? null : Number(value))

function GroupLinkForm({
  groupName,
  categories,
  initial,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<GroupLinkDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [expense, setExpense] = useState(toValue(initial.expenseCategoryId))
  const [income, setIncome] = useState(toValue(initial.incomeCategoryId))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit({ expenseCategoryId: toId(expense), incomeCategoryId: toId(income) })
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
        <DialogTitle>Vincular ao orçamento</DialogTitle>
        <DialogDescription>
          Sua parte nos lançamentos de {groupName} entra no seu Dashboard e no seu Extrato, na categoria escolhida.
          Sem categoria, ela aparece só no resumo do grupo.
        </DialogDescription>
      </DialogHeader>
      <CategorySelect
        label="Despesas do grupo"
        kind="EXPENSE"
        categories={categories}
        current={initial.expenseCategoryId}
        value={expense}
        onChange={setExpense}
      />
      <CategorySelect
        label="Receitas do grupo"
        kind="INCOME"
        categories={categories}
        current={initial.incomeCategoryId}
        value={income}
        onChange={setIncome}
      />
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

function CategorySelect({
  label,
  kind,
  categories,
  current,
  value,
  onChange,
}: {
  label: string
  kind: EntryKind
  categories: CategoryGroup[]
  /** The linked category, kept as an option even if inactive */
  current: number | null
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const options = categories
    .filter((g) => g.kind === kind)
    .map((g) => ({
      ...g,
      categories: g.categories.filter((c) => (g.active && c.active) || c.id === current),
    }))
    .filter((g) => g.categories.length > 0)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} className="w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <NativeSelectOption value="">Não vincular</NativeSelectOption>
        {options.map((g) => (
          <NativeSelectOptGroup key={g.id} label={g.name}>
            {g.categories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {g.active && c.active ? c.name : `${c.name} (inativa)`}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        ))}
      </NativeSelect>
      <FieldDescription>
        {kind === 'EXPENSE' ? 'Ex.: Moradia, para o aluguel da república.' : 'Ex.: Renda extra, para uma sublocação.'}
      </FieldDescription>
    </Field>
  )
}

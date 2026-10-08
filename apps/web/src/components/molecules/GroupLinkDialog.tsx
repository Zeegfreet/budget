import { useId, useState } from 'react'
import { FormAlert, FormDialogContent, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import type { CategoryGroup, EntryKind } from '@/features/budget/types'
import type { GroupCategory, GroupLink } from '@/features/groups/types'
import type { PaymentMethod } from '@/features/payment-methods/types'
import { PaymentMethodSelect } from './PaymentMethodSelect'

interface GroupLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  /** The user's category tree */
  categories: CategoryGroup[]
  /** The group's own categories, for linking them one by one */
  groupCategories: GroupCategory[]
  /** The user's payment methods, for the expense shares (none hides the field) */
  paymentMethods?: PaymentMethod[]
  /** The current link */
  initial: GroupLink
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (link: GroupLink) => Promise<void>
  errorMessage: (error: unknown) => string
}

/**
 * Chooses the personal categories where the user's shares of a group count,
 * and the payment method whose invoice shows the expense shares. The shares
 * go either to one category per kind or, category by category, each group
 * category to one of the user's (the unmapped ones use the default).
 */
export function GroupLinkDialog({ open, onOpenChange, ...props }: GroupLinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent size="md">{open && <GroupLinkForm onDone={() => onOpenChange(false)} {...props} />}</FormDialogContent>
    </Dialog>
  )
}

const toValue = (id: number | null) => (id === null ? '' : String(id))
const toId = (value: string) => (value === '' ? null : Number(value))

const KINDS: { kind: EntryKind; label: string; others: string }[] = [
  { kind: 'EXPENSE', label: 'Despesas do grupo', others: 'Demais despesas e sem categoria' },
  { kind: 'INCOME', label: 'Receitas do grupo', others: 'Demais receitas e sem categoria' },
]

function GroupLinkForm({
  groupName,
  categories,
  groupCategories,
  paymentMethods = [],
  initial,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<GroupLinkDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [expense, setExpense] = useState(toValue(initial.expenseCategoryId))
  const [income, setIncome] = useState(toValue(initial.incomeCategoryId))
  const switchId = useId()
  const [byCategory, setByCategory] = useState(initial.categoryLinks.length > 0)
  const [mapped, setMapped] = useState<Record<number, string>>(() =>
    Object.fromEntries(initial.categoryLinks.map((l) => [l.groupCategoryId, String(l.categoryId)])),
  )
  const initialMapped = new Map(initial.categoryLinks.map((l) => [l.groupCategoryId, l.categoryId]))
  // Active group categories, plus inactive ones still mapped
  const linkable = groupCategories.filter((c) => c.active || initialMapped.has(c.id))
  const [paymentMethodId, setPaymentMethodId] = useState(initial.paymentMethodId)
  const showMethods = paymentMethods.some((m) => m.active || m.id === initial.paymentMethodId)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const categoryLinks = byCategory
        ? linkable.flatMap((c) => {
            const categoryId = toId(mapped[c.id] ?? '')
            return categoryId === null ? [] : [{ groupCategoryId: c.id, categoryId }]
          })
        : []
      await onSubmit({
        expenseCategoryId: toId(expense),
        incomeCategoryId: toId(income),
        paymentMethodId,
        categoryLinks,
      })
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
      {linkable.length > 0 && (
        <div className="flex items-start gap-2">
          <Switch id={switchId} checked={byCategory} onCheckedChange={setByCategory} />
          <div className="flex flex-col gap-1">
            <Label htmlFor={switchId} className="font-normal">
              Categoria por categoria
            </Label>
            <p className="text-sm text-muted-foreground">
              {byCategory
                ? 'Cada categoria do grupo vai para uma categoria sua; as demais usam a categoria padrão.'
                : 'Uma categoria sua para todas as despesas e outra para todas as receitas.'}
            </p>
          </div>
        </div>
      )}
      {KINDS.map(({ kind, label, others }) => {
        const own = byCategory ? linkable.filter((c) => c.kind === kind) : []
        const fallback = (
          <CategorySelect
            label={own.length > 0 ? others : label}
            kind={kind}
            categories={categories}
            current={kind === 'EXPENSE' ? initial.expenseCategoryId : initial.incomeCategoryId}
            value={kind === 'EXPENSE' ? expense : income}
            onChange={kind === 'EXPENSE' ? setExpense : setIncome}
            hint={
              own.length > 0
                ? undefined
                : kind === 'EXPENSE'
                  ? 'Ex.: Moradia, para o aluguel da república.'
                  : 'Ex.: Renda extra, para uma sublocação.'
            }
          />
        )
        if (own.length === 0) return <div key={kind}>{fallback}</div>
        return (
          <FieldSet key={kind}>
            <FieldLegend variant="label">{label}</FieldLegend>
            {own.map((c) => (
              <CategorySelect
                key={c.id}
                label={c.active ? c.name : `${c.name} (inativa)`}
                kind={kind}
                categories={categories}
                current={initialMapped.get(c.id) ?? null}
                value={mapped[c.id] ?? ''}
                onChange={(value) => setMapped((m) => ({ ...m, [c.id]: value }))}
                emptyLabel="Usar a padrão"
              />
            ))}
            {fallback}
          </FieldSet>
        )
      })}
      {showMethods && (
        <PaymentMethodSelect
          label="Meio de pagamento das despesas"
          methods={paymentMethods}
          current={initial.paymentMethodId}
          value={paymentMethodId}
          onChange={setPaymentMethodId}
          emptyHint="Escolha um cartão ou conta para a sua parte das despesas entrar na fatura dele."
        />
      )}
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
  emptyLabel = 'Não vincular',
  hint,
}: {
  label: string
  kind: EntryKind
  categories: CategoryGroup[]
  /** The linked category, kept as an option even if inactive */
  current: number | null
  value: string
  onChange: (value: string) => void
  /** The option for no category */
  emptyLabel?: string
  hint?: string
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
        <NativeSelectOption value="">{emptyLabel}</NativeSelectOption>
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
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

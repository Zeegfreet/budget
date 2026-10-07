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
import type { PaymentMethod } from '@/features/payment-methods/types'
import { PaymentMethodSelect } from './PaymentMethodSelect'

interface GroupLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  /** The user's category tree */
  categories: CategoryGroup[]
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
 * and the payment method whose invoice shows the expense shares.
 */
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
  paymentMethods = [],
  initial,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<GroupLinkDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [expense, setExpense] = useState(toValue(initial.expenseCategoryId))
  const [income, setIncome] = useState(toValue(initial.incomeCategoryId))
  const [paymentMethodId, setPaymentMethodId] = useState(initial.paymentMethodId)
  const showMethods = paymentMethods.some((m) => m.active || m.id === initial.paymentMethodId)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit({ expenseCategoryId: toId(expense), incomeCategoryId: toId(income), paymentMethodId })
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

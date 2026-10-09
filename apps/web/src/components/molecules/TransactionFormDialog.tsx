import { useId, useState } from 'react'
import { FormAlert, FormDialogContent, MoneyInput, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select'
import { formatMonthLong } from '@/features/budget/months'
import type { CategoryGroup, EntryKind, Month } from '@/features/budget/types'
import { selectableMethods } from '@/features/payment-methods/labels'
import type { PaymentMethod } from '@/features/payment-methods/types'
import {
  type AdjustmentInput,
  EMPTY_RECURRENCE,
  parseRecurrence,
  type RecurrenceErrors,
} from '@/features/transactions/recurrence'
import { formatAmount, parseMoneyInput } from '@/lib/money'
import { parseWhole } from '@/lib/numbers'
import { INVALID_PAYMENT_URL, MAX_PAYMENT_URL_LENGTH, parsePaymentUrl } from '@/lib/payment-url'
import { FormField } from './FormField'
import { PaymentMethodSelect } from './PaymentMethodSelect'
import { RecurrenceFields } from './RecurrenceFields'

export const MAX_TRANSACTION_DESCRIPTION_LENGTH = 120

export interface TransactionFormValues {
  categoryId: number
  description: string | null
  plannedCents: number
  /** 1 when not recurring (or open-ended) */
  repeatMonths: number
  /** Repeats every month with no end */
  openEnded: boolean
  /** Scheduled adjustment of a recurring launch */
  adjustment: AdjustmentInput | null
  /** Day of the month it is due (1–31) */
  dueDay: number | null
  /** Link to the bill (boleto) or payment portal */
  paymentUrl: string | null
  /** Expenses only; always `null` for incomes */
  paymentMethodId: number | null
}

interface TransactionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: EntryKind
  /** The category tree; only active categories of `kind` are offered */
  groups: CategoryGroup[]
  /** Month of the launch (fixed; recurrence starts here) */
  month: Month
  /** The user's payment methods, offered for expenses (none hides the field) */
  paymentMethods?: PaymentMethod[]
  /** Editing: the current values, and no recurrence fields */
  initial?: Omit<TransactionFormValues, 'repeatMonths' | 'openEnded' | 'adjustment'>
  /** Creating: the category chosen up front */
  defaultCategoryId?: number
  /** Overrides the dialog's description */
  note?: string
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (values: TransactionFormValues) => Promise<void>
  errorMessage: (error: unknown) => string
}

const KIND_LABEL = { INCOME: 'receita', EXPENSE: 'despesa' } as const

/** Launches a new income or expense (optionally repeated for the next months) or edits one. */
export function TransactionFormDialog({ open, onOpenChange, ...props }: TransactionFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent size="md">
        {/* Mounted only while open, so it always starts from `initial` */}
        {open && <TransactionForm onDone={() => onOpenChange(false)} {...props} />}
      </FormDialogContent>
    </Dialog>
  )
}

type Errors = Partial<Record<'categoryId' | 'description' | 'plannedCents' | 'dueDay' | 'paymentUrl', string>> & {
  recurrence?: RecurrenceErrors
}

function TransactionForm({
  kind,
  groups,
  month,
  paymentMethods = [],
  initial,
  defaultCategoryId,
  note: dialogNote,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<TransactionFormDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const editing = initial !== undefined
  const options = groups
    .filter((g) => g.kind === kind && g.active)
    .map((g) => ({ ...g, categories: g.categories.filter((c) => c.active) }))
    .filter((g) => g.categories.length > 0)

  const [categoryId, setCategoryId] = useState((initial?.categoryId ?? defaultCategoryId)?.toString() ?? '')
  const [note, setNote] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial ? formatAmount(initial.plannedCents) : '')
  const [dueDay, setDueDay] = useState(initial?.dueDay?.toString() ?? '')
  const [link, setLink] = useState(initial?.paymentUrl ?? '')
  const [recurrence, setRecurrence] = useState(EMPTY_RECURRENCE)
  const currentMethodId = initial?.paymentMethodId ?? null
  const [paymentMethodId, setPaymentMethodId] = useState(currentMethodId)
  const showMethods = kind === 'EXPENSE' && selectableMethods(paymentMethods, currentMethodId).length > 0
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const id = useId()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const plannedCents = parseMoneyInput(amount)
    const description = note.trim() || null
    const day = parseWhole(dueDay, 1, 31)
    const paymentUrl = parsePaymentUrl(link)
    const next: Errors = {}
    if (!categoryId) next.categoryId = 'Escolha a categoria.'
    if (plannedCents === null || plannedCents <= 0) next.plannedCents = 'Informe um valor maior que zero.'
    if ((description?.length ?? 0) > MAX_TRANSACTION_DESCRIPTION_LENGTH) {
      next.description = `Use até ${MAX_TRANSACTION_DESCRIPTION_LENGTH} caracteres.`
    }
    if (day === undefined) next.dueDay = 'Informe um dia entre 1 e 31.'
    if (paymentUrl === undefined) next.paymentUrl = INVALID_PAYMENT_URL
    const repeat = parseRecurrence(recurrence, month)
    if (!editing && !repeat.values) next.recurrence = repeat.errors
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setPending(true)
    setError(null)
    try {
      await onSubmit({
        categoryId: Number(categoryId),
        description,
        plannedCents: plannedCents!,
        repeatMonths: repeat.values?.repeatMonths ?? 1,
        openEnded: repeat.values?.openEnded ?? false,
        adjustment: repeat.values?.adjustment ?? null,
        dueDay: day!,
        paymentUrl: paymentUrl!,
        paymentMethodId: kind === 'EXPENSE' ? paymentMethodId : null,
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
        <DialogTitle>{editing ? 'Editar lançamento' : `Nova ${KIND_LABEL[kind]}`}</DialogTitle>
        <DialogDescription>
          {dialogNote ?? `${editing ? 'Lançamento de ' : 'Lançamento previsto para '}${formatMonthLong(month)}.`}
        </DialogDescription>
      </DialogHeader>

      <Field data-invalid={!!errors.categoryId || undefined}>
        <FieldLabel htmlFor={`${id}-category`}>Categoria</FieldLabel>
        <NativeSelect
          id={`${id}-category`}
          className="w-full"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-invalid={!!errors.categoryId || undefined}
          autoFocus={!editing}
        >
          <NativeSelectOption value="" disabled>
            Selecione…
          </NativeSelectOption>
          {options.map((g) => (
            <NativeSelectOptGroup key={g.id} label={g.name}>
              {g.categories.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          ))}
        </NativeSelect>
        {options.length === 0 && (
          <FieldDescription>Nenhuma categoria ativa. Crie uma pelo menu Categorias.</FieldDescription>
        )}
        {errors.categoryId && <FieldError>{errors.categoryId}</FieldError>}
      </Field>

      <FormField
        label="Descrição (opcional)"
        placeholder="Ex.: conta de luz"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={MAX_TRANSACTION_DESCRIPTION_LENGTH}
        error={errors.description}
      />

      <Field data-invalid={!!errors.plannedCents || undefined}>
        <FieldLabel htmlFor={`${id}-amount`}>Valor previsto (R$)</FieldLabel>
        <MoneyInput
          id={`${id}-amount`}
          placeholder="0,00"
          value={amount}
          onValueChange={setAmount}
          aria-invalid={!!errors.plannedCents || undefined}
          className="w-40"
        />
        {errors.plannedCents && <FieldError>{errors.plannedCents}</FieldError>}
      </Field>

      <FormField
        label="Dia de vencimento (opcional)"
        description={
          paymentMethodId !== null
            ? 'O vencimento do meio de pagamento tem prioridade.'
            : 'Dia do mês em que vence, de 1 a 31.'
        }
        placeholder="Ex.: 10"
        inputMode="numeric"
        value={dueDay}
        onChange={(e) => setDueDay(e.target.value)}
        error={errors.dueDay}
        className="w-24"
      />

      {showMethods && (
        <PaymentMethodSelect
          methods={paymentMethods}
          current={currentMethodId}
          value={paymentMethodId}
          onChange={setPaymentMethodId}
        />
      )}

      <FormField
        label="Link de pagamento (opcional)"
        description="Boleto ou portal onde a conta é paga."
        type="url"
        inputMode="url"
        placeholder="https://"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        maxLength={MAX_PAYMENT_URL_LENGTH}
        error={errors.paymentUrl}
      />

      {!editing && (
        <RecurrenceFields
          month={month}
          value={recurrence}
          onChange={setRecurrence}
          errors={errors.recurrence ?? {}}
        />
      )}

      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {editing ? 'Salvar' : 'Lançar'}
        </Button>
      </DialogFooter>
    </form>
  )
}

import { useId, useState } from 'react'
import { FormAlert, FormDialogContent, MoneyInput, MoneyText, Spinner } from '@/components/atoms'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { formatMonthLong } from '@/features/budget/months'
import type { EntryKind, Month } from '@/features/budget/types'
import { previewShares, ruleError } from '@/features/groups/split'
import type { GroupCategory, GroupMember, SplitMethod } from '@/features/groups/types'
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
import { RecurrenceFields } from './RecurrenceFields'
import { MAX_TRANSACTION_DESCRIPTION_LENGTH } from './TransactionFormDialog'

export interface GroupTransactionFormValues {
  description: string
  amountCents: number
  splitMethodId: number
  /** Day of the month it is due (1–31); `null` = none */
  dueDay: number | null
  /** Link to the bill (boleto) or payment portal; `null` = none */
  paymentUrl: string | null
  /** The group's category; `null` = none */
  categoryId: number | null
  /** `null` while pending */
  paidByMemberId: number | null
  /** 1 when not recurring (or open-ended) */
  repeatMonths: number
  /** Repeats every month with no end */
  openEnded: boolean
  /** Scheduled adjustment (not with a FIXED rule) */
  adjustment: AdjustmentInput | null
}

interface GroupTransactionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: EntryKind
  month: Month
  /** Active members */
  members: GroupMember[]
  /** The group's rules; only active ones are offered */
  splitMethods: SplitMethod[]
  /** The group's categories; active ones of the kind are offered (plus the current one) */
  categories: GroupCategory[]
  /** Editing: the current values, and no payer or recurrence fields */
  initial?: {
    description: string
    amountCents: number
    splitMethodId: number | null
    dueDay: number | null
    paymentUrl: string | null
    categoryId: number | null
  }
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (values: GroupTransactionFormValues) => Promise<void>
  errorMessage: (error: unknown) => string
}

const KIND_LABEL = { INCOME: 'receita', EXPENSE: 'despesa' } as const

type Errors = Partial<Record<'description' | 'amount' | 'splitMethodId' | 'dueDay' | 'paymentUrl', string>> & {
  recurrence?: RecurrenceErrors
}

/** Launches an income or expense of the group, split by one of its rules, or edits one. */
export function GroupTransactionFormDialog({ open, onOpenChange, ...props }: GroupTransactionFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent size="md">
        {open && <GroupTransactionForm onDone={() => onOpenChange(false)} {...props} />}
      </FormDialogContent>
    </Dialog>
  )
}

function GroupTransactionForm({
  kind,
  month,
  members,
  splitMethods,
  categories,
  initial,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<GroupTransactionFormDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const editing = initial !== undefined
  const rules = splitMethods.filter((m) => m.active)
  const initialRule = rules.find((m) => m.id === initial?.splitMethodId) ?? (editing ? undefined : rules[0])

  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial ? formatAmount(initial.amountCents) : '')
  const [ruleId, setRuleId] = useState(initialRule?.id.toString() ?? '')
  const [dueDay, setDueDay] = useState(initial?.dueDay?.toString() ?? '')
  const [link, setLink] = useState(initial?.paymentUrl ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId?.toString() ?? '')
  const categoryOptions = categories.filter(
    (c) => c.kind === kind && (c.active || c.id === initial?.categoryId),
  )
  const [payer, setPayer] = useState('')
  const [recurrence, setRecurrence] = useState(EMPTY_RECURRENCE)
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const id = useId()
  const income = kind === 'INCOME'

  const cents = parseMoneyInput(amount)
  const rule = rules.find((m) => m.id === Number(ruleId))
  const fitError = rule && cents !== null && cents > 0 ? ruleError(rule.type, rule.shares, cents) : null
  const preview =
    rule && cents !== null && cents > 0 && !fitError
      ? previewShares(cents, rule.type, rule.shares, members.map((m) => m.id))
      : []

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const text = description.trim()
    const next: Errors = {}
    if (!text) next.description = 'Informe a descrição.'
    if (cents === null || cents <= 0) next.amount = 'Informe um valor maior que zero.'
    else if (fitError) next.amount = fitError
    if (!rule) next.splitMethodId = 'Escolha a regra de rateio.'
    const day = parseWhole(dueDay, 1, 31)
    if (day === undefined) next.dueDay = 'Informe um dia entre 1 e 31.'
    const paymentUrl = parsePaymentUrl(link)
    if (paymentUrl === undefined) next.paymentUrl = INVALID_PAYMENT_URL
    const repeat = parseRecurrence(recurrence, month)
    if (!editing && !repeat.values) next.recurrence = repeat.errors
    else if (!editing && repeat.values?.adjustment && rule?.type === 'FIXED') {
      next.recurrence = { percent: 'Uma regra de valores fixos não tem reajuste automático.' }
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setPending(true)
    setError(null)
    try {
      await onSubmit({
        description: text,
        amountCents: cents!,
        splitMethodId: rule!.id,
        dueDay: day ?? null,
        paymentUrl: paymentUrl ?? null,
        categoryId: categoryId ? Number(categoryId) : null,
        paidByMemberId: payer ? Number(payer) : null,
        repeatMonths: repeat.values?.repeatMonths ?? 1,
        openEnded: repeat.values?.openEnded ?? false,
        adjustment: repeat.values?.adjustment ?? null,
      })
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const nameOf = (memberId: number) => members.find((m) => m.id === memberId)?.name ?? 'Ex-membro'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? 'Editar lançamento do grupo' : `Nova ${KIND_LABEL[kind]} do grupo`}</DialogTitle>
        <DialogDescription>
          Lançamento de {formatMonthLong(month)}, dividido entre os membros pela regra escolhida.
        </DialogDescription>
      </DialogHeader>

      <FormField
        label="Descrição"
        placeholder={income ? 'Ex.: sublocação da vaga' : 'Ex.: aluguel'}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={MAX_TRANSACTION_DESCRIPTION_LENGTH}
        error={errors.description}
        autoFocus={!editing}
      />

      <Field data-invalid={!!errors.amount || undefined}>
        <FieldLabel htmlFor={`${id}-amount`}>Valor (R$)</FieldLabel>
        <MoneyInput
          id={`${id}-amount`}
          placeholder="0,00"
          value={amount}
          onValueChange={setAmount}
          aria-invalid={!!errors.amount || undefined}
          className="w-40"
        />
        {errors.amount && <FieldError>{errors.amount}</FieldError>}
      </Field>

      <Field data-invalid={!!errors.splitMethodId || undefined}>
        <FieldLabel htmlFor={`${id}-rule`}>Regra de rateio</FieldLabel>
        <NativeSelect
          id={`${id}-rule`}
          className="w-full"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
          aria-invalid={!!errors.splitMethodId || undefined}
        >
          <NativeSelectOption value="" disabled>
            Selecione…
          </NativeSelectOption>
          {rules.map((m) => (
            <NativeSelectOption key={m.id} value={m.id}>
              {m.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {preview.length > 0 && (
          <FieldDescription aria-label="Divisão">
            {preview.map((s, i) => (
              <span key={s.memberId}>
                {i > 0 && ' · '}
                {nameOf(s.memberId)} <MoneyText cents={s.amountCents} />
              </span>
            ))}
          </FieldDescription>
        )}
        {errors.splitMethodId && <FieldError>{errors.splitMethodId}</FieldError>}
      </Field>

      {categoryOptions.length > 0 && (
        <Field>
          <FieldLabel htmlFor={`${id}-category`}>Categoria do grupo (opcional)</FieldLabel>
          <NativeSelect
            id={`${id}-category`}
            className="w-full"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <NativeSelectOption value="">Sem categoria</NativeSelectOption>
            {categoryOptions.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.active ? c.name : `${c.name} (inativa)`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}

      <FormField
        label="Dia de vencimento (opcional)"
        description="Dia do mês em que vence, de 1 a 31."
        placeholder="Ex.: 10"
        inputMode="numeric"
        value={dueDay}
        onChange={(e) => setDueDay(e.target.value)}
        error={errors.dueDay}
        className="w-24"
      />

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
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-payer`}>{income ? 'Recebido por' : 'Pago por'}</FieldLabel>
            <NativeSelect id={`${id}-payer`} className="w-full" value={payer} onChange={(e) => setPayer(e.target.value)}>
              <NativeSelectOption value="">{income ? 'Ainda não recebido' : 'Ainda não pago'}</NativeSelectOption>
              {members.map((m) => (
                <NativeSelectOption key={m.id} value={m.id}>
                  {m.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <RecurrenceFields
            month={month}
            value={recurrence}
            onChange={setRecurrence}
            errors={errors.recurrence ?? {}}
            note="Só este mês sai como pago."
          />
        </>
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

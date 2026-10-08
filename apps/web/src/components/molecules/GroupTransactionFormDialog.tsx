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
import { Switch } from '@/components/ui/switch'
import { addMonths, formatMonthLabel, formatMonthLong } from '@/features/budget/months'
import type { EntryKind, Month } from '@/features/budget/types'
import { previewShares, ruleError } from '@/features/groups/split'
import type { GroupMember, SplitMethod } from '@/features/groups/types'
import { formatAmount, parseMoneyInput } from '@/lib/money'
import { parseWhole } from '@/lib/numbers'
import { INVALID_PAYMENT_URL, MAX_PAYMENT_URL_LENGTH, parsePaymentUrl } from '@/lib/payment-url'
import { FormField } from './FormField'
import { MAX_REPEAT_MONTHS, MAX_TRANSACTION_DESCRIPTION_LENGTH } from './TransactionFormDialog'

const DEFAULT_REPEAT_MONTHS = 12

export interface GroupTransactionFormValues {
  description: string
  amountCents: number
  splitMethodId: number
  /** Day of the month it is due (1–31); `null` = none */
  dueDay: number | null
  /** Link to the bill (boleto) or payment portal; `null` = none */
  paymentUrl: string | null
  /** `null` while pending */
  paidByMemberId: number | null
  /** 1 when not recurring */
  repeatMonths: number
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
  /** Editing: the current values, and no payer or recurrence fields */
  initial?: {
    description: string
    amountCents: number
    splitMethodId: number | null
    dueDay: number | null
    paymentUrl: string | null
  }
  /** Rejects to show `errorMessage(error)` */
  onSubmit: (values: GroupTransactionFormValues) => Promise<void>
  errorMessage: (error: unknown) => string
}

const KIND_LABEL = { INCOME: 'receita', EXPENSE: 'despesa' } as const

type Errors = Partial<
  Record<'description' | 'amount' | 'splitMethodId' | 'dueDay' | 'paymentUrl' | 'repeatMonths', string>
>

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
  const [payer, setPayer] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [repeatMonths, setRepeatMonths] = useState(String(DEFAULT_REPEAT_MONTHS))
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
  const times = /^\d+$/.test(repeatMonths.trim()) ? Number(repeatMonths) : NaN
  const validTimes = times >= 2 && times <= MAX_REPEAT_MONTHS

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
    if (repeat && !validTimes) next.repeatMonths = `Informe de 2 a ${MAX_REPEAT_MONTHS} meses.`
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
        paidByMemberId: payer ? Number(payer) : null,
        repeatMonths: repeat ? times : 1,
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

          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <Switch id={`${id}-repeat`} checked={repeat} onCheckedChange={setRepeat} />
              <FieldLabel htmlFor={`${id}-repeat`}>Repetir nos próximos meses</FieldLabel>
            </div>
            {repeat && (
              <FormField
                label="Quantidade de meses"
                description={
                  validTimes
                    ? `De ${formatMonthLabel(month)} a ${formatMonthLabel(addMonths(month, times - 1))}. Só este mês sai como pago.`
                    : `De 2 a ${MAX_REPEAT_MONTHS} meses, contando este mês.`
                }
                inputMode="numeric"
                value={repeatMonths}
                onChange={(e) => setRepeatMonths(e.target.value)}
                error={errors.repeatMonths}
                className="w-24"
              />
            )}
          </div>
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

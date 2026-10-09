import { useId } from 'react'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { addMonths, formatMonthLabel } from '@/features/budget/months'
import type { Month } from '@/features/budget/types'
import {
  type AdjustmentErrors,
  MAX_REPEAT_MONTHS,
  type RecurrenceDraft,
  type RecurrenceErrors,
  type RepeatMode,
} from '@/features/transactions/recurrence'
import { parseWhole } from '@/lib/numbers'
import { FormField } from './FormField'

const MODE_LABEL: Record<RepeatMode, string> = {
  NONE: 'Não repetir',
  MONTHS: 'Por alguns meses',
  OPEN: 'Todo mês, sem data de término',
}

interface RecurrenceFieldsProps {
  /** First month of the launch */
  month: Month
  value: RecurrenceDraft
  onChange: (next: RecurrenceDraft) => void
  errors: RecurrenceErrors
  /** Added to the range description (e.g. only the first month comes out paid) */
  note?: string
}

/**
 * How a new launch repeats: not at all, for some months, or every month with
 * no end; a recurring one may have a scheduled adjustment. Parse the value
 * with `parseRecurrence`.
 */
export function RecurrenceFields({ month, value, onChange, errors, note }: RecurrenceFieldsProps) {
  const id = useId()
  const times = parseWhole(value.months, 2, MAX_REPEAT_MONTHS)
  const range =
    typeof times === 'number'
      ? `De ${formatMonthLabel(month)} a ${formatMonthLabel(addMonths(month, times - 1))}, contando este mês.`
      : `De 2 a ${MAX_REPEAT_MONTHS} meses, contando este mês.`

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
      <Field>
        <FieldLabel htmlFor={`${id}-mode`}>Repetir</FieldLabel>
        <NativeSelect
          id={`${id}-mode`}
          className="w-full"
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as RepeatMode })}
        >
          {(Object.keys(MODE_LABEL) as RepeatMode[]).map((mode) => (
            <NativeSelectOption key={mode} value={mode}>
              {MODE_LABEL[mode]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {value.mode === 'OPEN' && (
          <FieldDescription>
            Os próximos meses são criados automaticamente, a partir de {formatMonthLabel(month)}. Para encerrar, ajuste o
            período pelo selo da recorrência.{note ? ` ${note}` : ''}
          </FieldDescription>
        )}
      </Field>

      {value.mode === 'MONTHS' && (
        <FormField
          label="Quantidade de meses"
          description={note ? `${range} ${note}` : range}
          inputMode="numeric"
          value={value.months}
          onChange={(e) => onChange({ ...value, months: e.target.value })}
          error={errors.months}
          className="w-24"
        />
      )}

      {value.mode !== 'NONE' && (
        <AdjustmentFields month={month} value={value} onChange={(next) => onChange({ ...value, ...next })} errors={errors} />
      )}
    </fieldset>
  )
}

type AdjustmentDraft = Pick<RecurrenceDraft, 'adjust' | 'percent' | 'every' | 'firstMonth'>

/** The scheduled adjustment's switch and fields (also in `SeriesRangeDialog`). Parse with `parseAdjustment`. */
export function AdjustmentFields({
  month,
  value,
  onChange,
  errors,
}: {
  /** First month of the series: the default first adjustment is a period after it */
  month: Month
  value: AdjustmentDraft
  onChange: (next: AdjustmentDraft) => void
  errors: AdjustmentErrors
}) {
  const id = useId()
  const every = parseWhole(value.every, 1, MAX_REPEAT_MONTHS)
  const defaultFirst = typeof every === 'number' ? formatMonthLabel(addMonths(month, every)) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Switch id={`${id}-adjust`} checked={value.adjust} onCheckedChange={(adjust) => onChange({ ...value, adjust })} />
        <FieldLabel htmlFor={`${id}-adjust`}>Reajuste automático</FieldLabel>
      </div>
      {value.adjust && (
        <>
          <div className="flex flex-wrap gap-3">
            <FormField
              label="Percentual (%)"
              placeholder="Ex.: 5"
              inputMode="decimal"
              value={value.percent}
              onChange={(e) => onChange({ ...value, percent: e.target.value })}
              error={errors.percent}
              className="w-28"
            />
            <FormField
              label="A cada (meses)"
              inputMode="numeric"
              value={value.every}
              onChange={(e) => onChange({ ...value, every: e.target.value })}
              error={errors.every}
              className="w-28"
            />
          </div>
          <FormField
            label="Primeiro reajuste (opcional)"
            type="month"
            description={
              defaultFirst
                ? `Em branco, o primeiro reajuste é em ${defaultFirst}. Os valores digitados depois servem de base para os próximos.`
                : 'Em branco, um período depois do primeiro mês.'
            }
            value={value.firstMonth}
            onChange={(e) => onChange({ ...value, firstMonth: e.target.value })}
            error={errors.firstMonth}
            className="w-44"
          />
        </>
      )}
    </div>
  )
}

import { MinusIcon, PlusIcon } from 'lucide-react'
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
import { FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { addMonths, currentMonth, formatMonthLabel, formatMonthLong, monthSpan } from '@/features/budget/months'
import type { Month, SeriesPosition } from '@/features/budget/types'
import { formatPercent } from '@/features/groups/split'
import {
  type Adjustment,
  type AdjustmentErrors,
  MAX_REPEAT_MONTHS,
  parseAdjustment,
  resolveAdjustment,
} from '@/features/transactions/recurrence'
import type { SeriesChange } from '@/features/transactions/types'
import { AdjustmentFields } from './RecurrenceFields'

/** Longest plain series the API accepts, in months */
export const MAX_SERIES_MONTHS = MAX_REPEAT_MONTHS

interface SeriesRangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The launch's name */
  title: string
  series: SeriesPosition | null
  /** "realizados" (personal) or "pagos" (group): those are never removed */
  settledLabel: string
  /** Closes when it resolves; a rejection shows `errorMessage(error)` */
  onSubmit: (change: SeriesChange) => Promise<void>
  errorMessage: (error: unknown) => string
}

/**
 * Changes a recurring launch's period: moves its last month, makes it repeat
 * with no end, and sets or removes its scheduled adjustment.
 */
export function SeriesRangeDialog({ open, onOpenChange, ...props }: SeriesRangeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogContent>
        {/* Mounted only while open, so it always starts from the current range */}
        {open && props.series && (
          <SeriesRangeForm {...props} series={props.series} onDone={() => onOpenChange(false)} />
        )}
      </FormDialogContent>
    </Dialog>
  )
}

const sameAdjustment = (a: Adjustment | null, b: Adjustment | null) =>
  a?.percentBp === b?.percentBp && a?.everyMonths === b?.everyMonths && a?.firstMonth === b?.firstMonth

function SeriesRangeForm({
  title,
  series,
  settledLabel,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<SeriesRangeDialogProps, 'open' | 'onOpenChange' | 'series'> & { series: SeriesPosition; onDone: () => void }) {
  const rule = series.recurrence
  const savedAdjustment = rule?.adjustment ?? null
  // The current end: the rule's (`null` = none), or the last occurrence of a plain series
  const savedEnd = rule ? rule.endMonth : series.lastMonth
  const [openEnded, setOpenEnded] = useState(savedEnd === null)
  const [until, setUntil] = useState(savedEnd ?? series.lastMonth)
  const [adjustmentDraft, setAdjustmentDraft] = useState({
    adjust: savedAdjustment !== null,
    percent: savedAdjustment ? formatPercent(savedAdjustment.percentBp) : '',
    every: String(savedAdjustment?.everyMonths ?? 12),
    firstMonth: savedAdjustment?.firstMonth ?? '',
  })
  const [errors, setErrors] = useState<AdjustmentErrors>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const labelId = useId()

  const parsed = parseAdjustment(adjustmentDraft, series.firstMonth)
  const nextAdjustment = parsed.adjustment ? resolveAdjustment(parsed.adjustment, series.firstMonth) : null
  const adjustmentChanged =
    Object.keys(parsed.errors).length > 0 || !sameAdjustment(savedAdjustment, nextAdjustment)
  const nextEnd = openEnded ? null : until
  const endChanged = nextEnd !== savedEnd
  // A plain series is created at once (up to 60 months); one with a rule as months are read
  const capped = !rule && !adjustmentDraft.adjust
  const lastAllowed = capped ? addMonths(series.firstMonth, MAX_SERIES_MONTHS - 1) : null
  const count = monthSpan(series.firstMonth, until)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setErrors(parsed.errors)
    if (Object.keys(parsed.errors).length > 0) return
    setPending(true)
    setError(null)
    try {
      await onSubmit({
        untilMonth: nextEnd,
        ...(adjustmentChanged && { adjustment: parsed.adjustment }),
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
        <DialogTitle>Período da recorrência</DialogTitle>
        <DialogDescription>
          {savedEnd === null
            ? `${title}: lançamento ${series.index}, desde ${formatMonthLabel(series.firstMonth)}, sem data de término.`
            : `${title}: parcela ${series.index} de ${series.count}, de ${formatMonthLabel(series.firstMonth)} a ${formatMonthLabel(series.lastMonth)}.`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-3">
        <Switch id={`${id}-open`} checked={openEnded} onCheckedChange={setOpenEnded} />
        <FieldLabel htmlFor={`${id}-open`}>Sem data de término</FieldLabel>
      </div>

      {!openEnded && (
        <div className="flex flex-col gap-2">
          <span id={labelId} className="text-sm font-medium">
            Último mês
          </span>
          <div className="flex items-center gap-2" role="group" aria-labelledby={labelId}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Mês anterior"
              disabled={until <= series.firstMonth}
              onClick={() => setUntil(addMonths(until, -1))}
            >
              <MinusIcon aria-hidden />
            </Button>
            <span aria-live="polite" className="min-w-36 text-center font-medium">
              {formatMonthLong(until)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Próximo mês"
              disabled={lastAllowed !== null && until >= lastAllowed}
              onClick={() => setUntil(addMonths(until, 1))}
            >
              <PlusIcon aria-hidden />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {count} {count === 1 ? 'lançamento' : 'lançamentos'} no total
            {capped ? ` (até ${MAX_SERIES_MONTHS}).` : '.'}
          </p>
        </div>
      )}

      <AdjustmentFields
        month={series.firstMonth}
        value={adjustmentDraft}
        onChange={setAdjustmentDraft}
        errors={errors}
      />

      {(endChanged || adjustmentChanged) && (
        <div role="status" className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
          {endChanged && <p>{endMessage(nextEnd, series.lastMonth, settledLabel)}</p>}
          {adjustmentChanged && (
            <p>
              Os lançamentos pendentes depois de {formatMonthLong(currentMonth())} serão recalculados
              {nextAdjustment ? ' com o novo reajuste' : ' sem reajuste'}. Os já {settledLabel} não mudam.
            </p>
          )}
        </div>
      )}

      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || (!endChanged && !adjustmentChanged)}>
          {pending && <Spinner />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}

function endMessage(end: Month | null, lastMonth: Month, settledLabel: string): string {
  if (end === null) return 'Os próximos meses passam a ser criados automaticamente, sem data de término.'
  if (end < lastMonth) {
    return `Os lançamentos pendentes depois de ${formatMonthLong(end)} serão excluídos. Os já ${settledLabel} não podem ser removidos.`
  }
  if (end === lastMonth) return `A recorrência termina em ${formatMonthLong(end)}.`
  return `Serão criados ${monthSpan(lastMonth, end) - 1} lançamentos, cópias do último, até ${formatMonthLong(end)}.`
}

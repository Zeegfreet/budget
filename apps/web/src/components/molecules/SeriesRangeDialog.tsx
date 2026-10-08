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
import { addMonths, formatMonthLabel, formatMonthLong, monthSpan } from '@/features/budget/months'
import type { Month, SeriesPosition } from '@/features/budget/types'

/** Longest series the API accepts, in months */
export const MAX_SERIES_MONTHS = 60

interface SeriesRangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The launch's name */
  title: string
  series: SeriesPosition | null
  /** "realizados" (personal) or "pagos" (group): those are never removed */
  settledLabel: string
  /** Closes when it resolves; a rejection shows `errorMessage(error)` */
  onSubmit: (untilMonth: Month) => Promise<void>
  errorMessage: (error: unknown) => string
}

/** Extends or shortens a recurring launch by moving its last month. */
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

function SeriesRangeForm({
  title,
  series,
  settledLabel,
  onSubmit,
  errorMessage,
  onDone,
}: Omit<SeriesRangeDialogProps, 'open' | 'onOpenChange' | 'series'> & { series: SeriesPosition; onDone: () => void }) {
  const [until, setUntil] = useState(series.lastMonth)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const labelId = useId()
  const lastAllowed = addMonths(series.firstMonth, MAX_SERIES_MONTHS - 1)
  const count = monthSpan(series.firstMonth, until)
  const shrinking = until < series.lastMonth

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit(until)
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Período da recorrência</DialogTitle>
        <DialogDescription>
          {title}: parcela {series.index} de {series.count}, de {formatMonthLabel(series.firstMonth)} a{' '}
          {formatMonthLabel(series.lastMonth)}.
        </DialogDescription>
      </DialogHeader>

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
            disabled={until >= lastAllowed}
            onClick={() => setUntil(addMonths(until, 1))}
          >
            <PlusIcon aria-hidden />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {count} {count === 1 ? 'lançamento' : 'lançamentos'} no total (até {MAX_SERIES_MONTHS}).
        </p>
      </div>

      {until !== series.lastMonth && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          {shrinking
            ? `Os lançamentos pendentes depois de ${formatMonthLong(until)} serão excluídos. Os já ${settledLabel} não podem ser removidos.`
            : `Serão criados ${monthSpan(series.lastMonth, until) - 1} lançamentos, cópias do último, até ${formatMonthLong(until)}.`}
        </p>
      )}

      {error && <FormAlert>{error}</FormAlert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || until === series.lastMonth}>
          {pending && <Spinner />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  )
}

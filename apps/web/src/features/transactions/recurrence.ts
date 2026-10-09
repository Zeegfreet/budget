import { addMonths, formatMonthLabel } from '@/features/budget/months'
import type { Month, SeriesPosition } from '@/features/budget/types'
import { formatPercent } from '@/features/groups/split'
import { parseMoneyInput } from '@/lib/money'
import { parseWhole } from '@/lib/numbers'
import type { SeriesChange } from './types'

/** Longest finite series the API creates at once, in months */
export const MAX_REPEAT_MONTHS = 60
export const DEFAULT_REPEAT_MONTHS = 12
const DEFAULT_ADJUSTMENT_EVERY = 12
/** 100% in basis points, the largest adjustment the API accepts */
const MAX_ADJUSTMENT_BP = 10_000

/** Scheduled adjustment of a recurring launch, as the API stores it */
export interface Adjustment {
  /** Basis points: 500 = 5% */
  percentBp: number
  everyMonths: number
  /** First month adjusted; then every `everyMonths` */
  firstMonth: Month
}

/** What creating sends: `firstMonth` omitted = a period after the first month */
export type AdjustmentInput = Omit<Adjustment, 'firstMonth'> & { firstMonth?: Month }

/** How a new launch repeats */
export type RepeatMode = 'NONE' | 'MONTHS' | 'OPEN'

/** The recurrence fields as typed (see `RecurrenceFields`) */
export interface RecurrenceDraft {
  mode: RepeatMode
  months: string
  adjust: boolean
  /** Percent, "5" or "4,5" */
  percent: string
  every: string
  /** `''` = the default (a period after the first month) */
  firstMonth: Month | ''
}

export const EMPTY_RECURRENCE: RecurrenceDraft = {
  mode: 'NONE',
  months: String(DEFAULT_REPEAT_MONTHS),
  adjust: false,
  percent: '',
  every: String(DEFAULT_ADJUSTMENT_EVERY),
  firstMonth: '',
}

/** The recurrence of a new launch, as the create request takes it */
export interface RecurrenceValues {
  /** 1 when not repeated (or open-ended) */
  repeatMonths: number
  openEnded: boolean
  adjustment: AdjustmentInput | null
}

export type AdjustmentErrors = Partial<Record<'percent' | 'every' | 'firstMonth', string>>
export type RecurrenceErrors = AdjustmentErrors & { months?: string }

/** The draft's adjustment, or its errors; `null` when off. */
export function parseAdjustment(
  draft: Pick<RecurrenceDraft, 'adjust' | 'percent' | 'every' | 'firstMonth'>,
  startMonth: Month,
): { adjustment: AdjustmentInput | null; errors: AdjustmentErrors } {
  if (!draft.adjust) return { adjustment: null, errors: {} }
  const errors: AdjustmentErrors = {}
  // Hundredths of a percent are basis points, like the split percentages
  const percentBp = parseMoneyInput(draft.percent)
  if (percentBp === null || percentBp < 1 || percentBp > MAX_ADJUSTMENT_BP) {
    errors.percent = 'Informe um percentual entre 0,01 e 100.'
  }
  const every = parseWhole(draft.every, 1, MAX_REPEAT_MONTHS)
  if (typeof every !== 'number') errors.every = `Informe de 1 a ${MAX_REPEAT_MONTHS} meses.`
  if (draft.firstMonth !== '' && draft.firstMonth <= startMonth) {
    errors.firstMonth = `Escolha um mês depois de ${formatMonthLabel(startMonth)}.`
  }
  if (Object.keys(errors).length > 0) return { adjustment: null, errors }
  return {
    adjustment: {
      percentBp: percentBp!,
      everyMonths: every!,
      ...(draft.firstMonth !== '' && { firstMonth: draft.firstMonth }),
    },
    errors,
  }
}

/** The recurrence of a launch starting in `month`, or the fields' errors. */
export function parseRecurrence(
  draft: RecurrenceDraft,
  month: Month,
): { values: RecurrenceValues | null; errors: RecurrenceErrors } {
  if (draft.mode === 'NONE') {
    return { values: { repeatMonths: 1, openEnded: false, adjustment: null }, errors: {} }
  }
  const errors: RecurrenceErrors = {}
  const times = parseWhole(draft.months, 2, MAX_REPEAT_MONTHS)
  if (draft.mode === 'MONTHS' && typeof times !== 'number') {
    errors.months = `Informe de 2 a ${MAX_REPEAT_MONTHS} meses.`
  }
  const { adjustment, errors: adjustmentErrors } = parseAdjustment(draft, month)
  Object.assign(errors, adjustmentErrors)
  if (Object.keys(errors).length > 0) return { values: null, errors }
  return {
    values: {
      repeatMonths: draft.mode === 'MONTHS' ? times! : 1,
      openEnded: draft.mode === 'OPEN',
      adjustment,
    },
    errors,
  }
}

/** The adjustment with its first month filled in (the API's default). */
export function resolveAdjustment(adjustment: AdjustmentInput, startMonth: Month): Adjustment {
  return { ...adjustment, firstMonth: adjustment.firstMonth ?? addMonths(startMonth, adjustment.everyMonths) }
}

/** Whether the adjustment applies in `month` (its first month, then every N) */
export function isAdjustmentMonth({ firstMonth, everyMonths }: Adjustment, month: Month): boolean {
  if (month < firstMonth) return false
  const [fy, fm] = firstMonth.split('-').map(Number)
  const [y, m] = month.split('-').map(Number)
  return ((y - fy) * 12 + (m - fm)) % everyMonths === 0
}

/** `cents` raised by `percentBp`, rounded half up (mirrors the API) */
export function adjustCents(cents: number, percentBp: number): number {
  return Math.floor((cents * (10_000 + percentBp) + 5_000) / 10_000)
}

/**
 * The amount of each month (ascending, after `baseMonth`) when `baseMonth` is
 * worth `baseCents`, compounding the adjustment at each anniversary in
 * between. Mirrors `projectAmounts` of the API (`recurrence/recurrence.ts`).
 */
export function projectAmounts(
  baseCents: number,
  baseMonth: Month,
  months: Month[],
  adjustment: Adjustment | null,
): number[] {
  let amount = baseCents
  let cursor = baseMonth
  return months.map((month) => {
    while (cursor < month) {
      cursor = addMonths(cursor, 1)
      if (adjustment && isAdjustmentMonth(adjustment, cursor)) {
        amount = adjustCents(amount, adjustment.percentBp)
      }
    }
    return amount
  })
}

/** "+5% a cada 12 meses, desde mar/27" */
export function describeAdjustment({ percentBp, everyMonths, firstMonth }: Adjustment): string {
  const period = everyMonths === 1 ? 'todo mês' : `a cada ${everyMonths} meses`
  return `+${formatPercent(percentBp)}% ${period}, desde ${formatMonthLabel(firstMonth)}`
}

/** Whether the series repeats with no end */
export const isOpenEnded = (series: SeriesPosition | null | undefined): boolean =>
  series?.recurrence?.endMonth === null

/** The series' scheduled adjustment, if any */
export const adjustmentOf = (series: SeriesPosition | null | undefined): Adjustment | null =>
  series?.recurrence?.adjustment ?? null

/** The toast after a series' range changed */
export function seriesToast({ untilMonth }: SeriesChange, count: number): string {
  if (untilMonth === null) return 'Recorrência ajustada: sem data de término'
  return `Recorrência ajustada: ${count} ${count === 1 ? 'lançamento' : 'lançamentos'}`
}

/** The recurrence fields of a create request, only those set */
export function recurrenceRequest({ repeatMonths, openEnded, adjustment }: RecurrenceValues): {
  repeatMonths?: number
  openEnded?: true
  adjustment?: AdjustmentInput
} {
  return {
    ...(repeatMonths > 1 && { repeatMonths }),
    ...(openEnded && { openEnded: true as const }),
    ...(adjustment && { adjustment }),
  }
}

/**
 * What the scope question adds for a series with a rule: deleting the
 * following occurrences ends an open-ended one; a new amount becomes the base
 * of the scheduled adjustment.
 */
export function scopeNote(
  series: SeriesPosition | null | undefined,
  action: 'update' | 'delete',
  amountChanges = false,
): string | undefined {
  if (action === 'delete' && isOpenEnded(series)) {
    return 'Excluir também os próximos encerra a recorrência: nenhum mês novo será criado.'
  }
  const adjustment = adjustmentOf(series)
  if (action === 'update' && amountChanges && adjustment) {
    return `Alterando também os próximos, o reajuste programado (${describeAdjustment(adjustment)}) passa a ser aplicado sobre o novo valor.`
  }
  return undefined
}

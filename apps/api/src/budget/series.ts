import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  type Adjustment,
  adjustmentOf,
  projectAmounts,
  type RecurrenceRule,
} from '../recurrence/recurrence.js';
import {
  addMonths,
  currentMonth,
  MAX_REPEAT_MONTHS,
  monthSpan,
} from './month.js';

/** The rule behind a series with no end or a scheduled adjustment. */
export interface SeriesRecurrence {
  endMonth: string | null;
  adjustment: Adjustment | null;
}

/** Where an occurrence sits in its series (e.g. 3 of 12, Oct/2026 to Sep/2027). */
export interface SeriesPosition {
  index: number;
  count: number;
  firstMonth: string;
  lastMonth: string;
  recurrence: SeriesRecurrence | null;
}

interface Occurrence {
  id: number;
  seriesId: string | null;
  month: string;
}

/** The series' rules by `seriesId`, as the positions carry them. */
export function recurrencesBySeries(
  rules: (RecurrenceRule & { seriesId: string })[],
): Map<string, SeriesRecurrence> {
  return new Map(
    rules.map((rule) => [
      rule.seriesId,
      { endMonth: rule.endMonth, adjustment: adjustmentOf(rule) },
    ]),
  );
}

/**
 * Position of each occurrence by series and id, ordered by month then id,
 * with the series' rule from `recurrences`, if any. A series left with a
 * single occurrence has no position (it is a plain launch).
 */
export function seriesPositions(
  occurrences: Occurrence[],
  recurrences: Map<string, SeriesRecurrence> = new Map(),
): Map<string, Map<number, SeriesPosition>> {
  const bySeries = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    if (!o.seriesId) continue;
    bySeries.set(o.seriesId, [...(bySeries.get(o.seriesId) ?? []), o]);
  }
  const positions = new Map<string, Map<number, SeriesPosition>>();
  for (const [seriesId, list] of bySeries) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.month.localeCompare(b.month) || a.id - b.id);
    const firstMonth = list[0].month;
    const lastMonth = list[list.length - 1].month;
    const recurrence = recurrences.get(seriesId) ?? null;
    positions.set(
      seriesId,
      new Map(
        list.map((o, i) => [
          o.id,
          {
            index: i + 1,
            count: list.length,
            firstMonth,
            lastMonth,
            recurrence,
          },
        ]),
      ),
    );
  }
  return positions;
}

/** The series' occurrences as `planSeriesEnd` needs them. */
export interface SeriesOccurrence {
  id: number;
  month: string;
  /** Realized (personal) or paid (group): never removed by a shorter range */
  settled: boolean;
}

export interface SeriesEndPlan {
  /** The occurrence new ones copy (the latest one kept) */
  templateId: number;
  /** Months to create after the current last one */
  addMonths: string[];
  /** Pending occurrences after the new end */
  removeIds: number[];
}

/**
 * What moving a series' last month to `untilMonth` takes: new months to
 * create (copies of the last occurrence) or pending ones to delete. 400 when
 * the end falls before the first month or the series would pass
 * `MAX_REPEAT_MONTHS`; 409 when a settled occurrence falls after the new end.
 */
export function planSeriesEnd(
  occurrences: SeriesOccurrence[],
  untilMonth: string,
): SeriesEndPlan {
  const sorted = [...occurrences].sort(
    (a, b) => a.month.localeCompare(b.month) || a.id - b.id,
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (untilMonth < first.month) {
    throw new BadRequestException(
      'untilMonth must not be before the first occurrence',
    );
  }
  if (monthSpan(first.month, untilMonth) > MAX_REPEAT_MONTHS) {
    throw new BadRequestException(
      `A series spans at most ${MAX_REPEAT_MONTHS} months`,
    );
  }
  const after = sorted.filter((o) => o.month > untilMonth);
  if (after.some((o) => o.settled)) {
    throw new ConflictException(
      'An occurrence after untilMonth is already settled',
    );
  }
  const kept = sorted.filter((o) => o.month <= untilMonth);
  const extra = Math.max(0, monthSpan(last.month, untilMonth) - 1);
  return {
    templateId: kept[kept.length - 1].id,
    addMonths: Array.from({ length: extra }, (_, i) =>
      addMonths(last.month, i + 1),
    ),
    removeIds: after.map((o) => o.id),
  };
}

/** 400 for a recurrence asked the wrong way (shared by personal and group launches). */
export function assertRecurrenceInput(
  repeatMonths: number,
  openEnded: boolean,
  hasAdjustment: boolean,
): void {
  if (openEnded && repeatMonths > 1) {
    throw new BadRequestException(
      'openEnded and repeatMonths cannot be used together',
    );
  }
  if (hasAdjustment && !openEnded && repeatMonths < 2) {
    throw new BadRequestException('An adjustment needs a recurring launch');
  }
}

/**
 * The adjustment asked for, with its first month defaulting to `everyMonths`
 * after the series' first month; `null` without one.
 */
export function resolveAdjustment(
  input:
    { percentBp: number; everyMonths: number; firstMonth?: string } | undefined,
  seriesFirstMonth: string,
): Adjustment | null {
  if (!input) return null;
  return {
    percentBp: input.percentBp,
    everyMonths: input.everyMonths,
    firstMonth:
      input.firstMonth ?? addMonths(seriesFirstMonth, input.everyMonths),
  };
}

export function sameAdjustment(a: Adjustment | null, b: Adjustment | null) {
  return (
    a?.percentBp === b?.percentBp &&
    a?.everyMonths === b?.everyMonths &&
    a?.firstMonth === b?.firstMonth
  );
}

/** An occurrence as `reproject` needs it. */
export interface AmountOccurrence {
  id: number;
  month: string;
  amountCents: number;
  /** Realized (personal) or paid (group): never recalculated */
  settled: boolean;
}

/**
 * New amounts after a series' adjustment changed: the base is its last
 * occurrence up to `now` (or the first, when all are later), and every pending
 * one after it is projected from the base with `adjustment` (all equal to the
 * base without one). Only the occurrences whose amount changes are returned.
 */
export function reproject(
  occurrences: AmountOccurrence[],
  adjustment: Adjustment | null,
  now: string = currentMonth(),
): { id: number; amountCents: number }[] {
  const sorted = [...occurrences].sort(
    (a, b) => a.month.localeCompare(b.month) || a.id - b.id,
  );
  if (sorted.length === 0) return [];
  const base = sorted.filter((o) => o.month <= now).at(-1) ?? sorted[0];
  const later = sorted.filter((o) => o.month > base.month && !o.settled);
  const amounts = projectAmounts(
    base.amountCents,
    base.month,
    later.map((o) => o.month),
    adjustment,
  );
  return later
    .map((o, i) => ({ id: o.id, amountCents: amounts[i] }))
    .filter((o, i) => o.amountCents !== later[i].amountCents);
}

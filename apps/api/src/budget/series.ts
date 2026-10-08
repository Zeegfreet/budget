import { BadRequestException, ConflictException } from '@nestjs/common';
import { addMonths, MAX_REPEAT_MONTHS, monthSpan } from './month.js';

/** Where an occurrence sits in its series (e.g. 3 of 12, Oct/2026 to Sep/2027). */
export interface SeriesPosition {
  index: number;
  count: number;
  firstMonth: string;
  lastMonth: string;
}

interface Occurrence {
  id: number;
  seriesId: string | null;
  month: string;
}

/**
 * Position of each occurrence by series and id, ordered by month then id.
 * A series left with a single occurrence has no position (it is a plain launch).
 */
export function seriesPositions(
  occurrences: Occurrence[],
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
    positions.set(
      seriesId,
      new Map(
        list.map((o, i) => [
          o.id,
          { index: i + 1, count: list.length, firstMonth, lastMonth },
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

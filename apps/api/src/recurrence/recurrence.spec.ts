import { describe, expect, it } from 'vitest';
import {
  adjust,
  adjustmentOf,
  generationTarget,
  isAdjustmentMonth,
  monthsToGenerate,
  projectAmounts,
  type RecurrenceRule,
} from './recurrence.js';

const rule = (fields: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  endMonth: null,
  generatedUntil: '2026-10',
  adjustPercentBp: null,
  adjustEveryMonths: null,
  adjustFirstMonth: null,
  ...fields,
});

const yearly = { percentBp: 500, everyMonths: 12, firstMonth: '2027-03' };

describe('adjustmentOf', () => {
  it('is null unless every field is set', () => {
    expect(adjustmentOf(null)).toBeNull();
    expect(adjustmentOf(rule({ adjustPercentBp: 500 }))).toBeNull();
    expect(
      adjustmentOf(
        rule({
          adjustPercentBp: 500,
          adjustEveryMonths: 12,
          adjustFirstMonth: '2027-03',
        }),
      ),
    ).toEqual(yearly);
  });
});

describe('isAdjustmentMonth', () => {
  it('matches the first month and every N after it', () => {
    expect(isAdjustmentMonth(yearly, '2026-03')).toBe(false);
    expect(isAdjustmentMonth(yearly, '2027-03')).toBe(true);
    expect(isAdjustmentMonth(yearly, '2027-04')).toBe(false);
    expect(isAdjustmentMonth(yearly, '2028-03')).toBe(true);
    const quarterly = { ...yearly, everyMonths: 3 };
    expect(isAdjustmentMonth(quarterly, '2027-06')).toBe(true);
    expect(isAdjustmentMonth(quarterly, '2027-12')).toBe(true);
    expect(isAdjustmentMonth(quarterly, '2027-11')).toBe(false);
  });
});

describe('adjust', () => {
  it('rounds half up to whole cents', () => {
    expect(adjust(100_000, 500)).toBe(105_000);
    expect(adjust(10, 500)).toBe(11); // 10.5
    expect(adjust(9, 500)).toBe(9); // 9.45
    expect(adjust(12_345, 1)).toBe(12_346); // 12346.2345
  });

  it('stops at the largest Int', () => {
    expect(adjust(2_100_000_000, 10_000)).toBe(2_147_483_647);
  });
});

describe('projectAmounts', () => {
  it('keeps the base without an adjustment', () => {
    expect(
      projectAmounts(1000, '2026-10', ['2026-11', '2030-01'], null),
    ).toEqual([1000, 1000]);
  });

  it('compounds at each adjustment month after the base', () => {
    expect(
      projectAmounts(
        100_000,
        '2026-10',
        ['2027-02', '2027-03', '2028-02', '2028-03', '2029-05'],
        yearly,
      ),
    ).toEqual([100_000, 105_000, 105_000, 110_250, 115_763]);
  });

  it('does not adjust the base month itself', () => {
    expect(projectAmounts(100_000, '2027-03', ['2027-04'], yearly)).toEqual([
      100_000,
    ]);
  });
});

describe('monthsToGenerate', () => {
  it('lists the months after generatedUntil up to the target', () => {
    expect(monthsToGenerate(rule(), '2027-01')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
    expect(monthsToGenerate(rule(), '2026-10')).toEqual([]);
  });

  it('stops at the end month', () => {
    expect(monthsToGenerate(rule({ endMonth: '2026-11' }), '2027-06')).toEqual([
      '2026-11',
    ]);
    expect(monthsToGenerate(rule({ endMonth: '2026-09' }), '2027-06')).toEqual(
      [],
    );
  });
});

describe('generationTarget', () => {
  it('covers the shown horizon from the current month', () => {
    expect(generationTarget(undefined, '2026-10')).toBe('2028-09');
    expect(generationTarget('2027-01', '2026-10')).toBe('2028-09');
  });

  it('reaches a later month read, up to the cap', () => {
    expect(generationTarget('2030-01', '2026-10')).toBe('2030-01');
    expect(generationTarget('2999-01', '2026-10')).toBe('2036-10');
  });
});

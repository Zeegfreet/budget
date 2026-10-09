import { BadRequestException, ConflictException } from '@nestjs/common';
import { planSeriesEnd, seriesPositions } from './series.js';

describe('seriesPositions', () => {
  it('orders each series by month, then id, with its first and last month', () => {
    const positions = seriesPositions([
      { id: 3, seriesId: 's', month: '2026-12' },
      { id: 1, seriesId: 's', month: '2026-10' },
      { id: 2, seriesId: 's', month: '2026-10' },
      { id: 4, seriesId: null, month: '2026-10' },
      { id: 5, seriesId: 'alone', month: '2026-10' },
    ]);

    expect([...positions.get('s')!.entries()]).toEqual([
      [
        1,
        {
          index: 1,
          count: 3,
          firstMonth: '2026-10',
          lastMonth: '2026-12',
          recurrence: null,
        },
      ],
      [
        2,
        {
          index: 2,
          count: 3,
          firstMonth: '2026-10',
          lastMonth: '2026-12',
          recurrence: null,
        },
      ],
      [
        3,
        {
          index: 3,
          count: 3,
          firstMonth: '2026-10',
          lastMonth: '2026-12',
          recurrence: null,
        },
      ],
    ]);
    expect(positions.has('alone')).toBe(false);
  });
});

describe('planSeriesEnd', () => {
  const series = [
    { id: 1, month: '2026-10', settled: true },
    { id: 2, month: '2026-11', settled: false },
    { id: 3, month: '2026-12', settled: false },
  ];

  it('adds the months after the last one, copying it', () => {
    expect(planSeriesEnd(series, '2027-02')).toEqual({
      templateId: 3,
      addMonths: ['2027-01', '2027-02'],
      removeIds: [],
    });
  });

  it('removes the pending occurrences after the new end', () => {
    expect(planSeriesEnd(series, '2026-10')).toEqual({
      templateId: 1,
      addMonths: [],
      removeIds: [2, 3],
    });
  });

  it('changes nothing when the end stays', () => {
    expect(planSeriesEnd(series, '2026-12')).toEqual({
      templateId: 3,
      addMonths: [],
      removeIds: [],
    });
  });

  it('refuses to drop a settled occurrence', () => {
    expect(() =>
      planSeriesEnd(
        [
          { id: 1, month: '2026-10', settled: false },
          { id: 2, month: '2026-11', settled: true },
        ],
        '2026-10',
      ),
    ).toThrow(ConflictException);
  });

  it('refuses an end before the first month or past the limit', () => {
    expect(() => planSeriesEnd(series, '2026-09')).toThrow(BadRequestException);
    expect(() => planSeriesEnd(series, '2031-10')).toThrow(BadRequestException);
    expect(planSeriesEnd(series, '2031-09').addMonths).toHaveLength(57);
  });
});

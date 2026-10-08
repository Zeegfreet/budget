import { addMonths, MONTH_PATTERN, monthSpan } from './month.js';

describe('MONTH_PATTERN', () => {
  it.each(['2026-01', '2026-10', '1999-12'])('accepts %s', (month) => {
    expect(MONTH_PATTERN.test(month)).toBe(true);
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', ''])(
    'rejects %j',
    (month) => {
      expect(MONTH_PATTERN.test(month)).toBe(false);
    },
  );
});

describe('monthSpan', () => {
  it('counts months inclusively, across years', () => {
    expect(monthSpan('2026-10', '2026-10')).toBe(1);
    expect(monthSpan('2026-10', '2027-09')).toBe(12);
    expect(monthSpan('2026-01', '2027-12')).toBe(24);
  });

  it('is zero or negative when from is after to', () => {
    expect(monthSpan('2026-10', '2026-09')).toBe(0);
    expect(monthSpan('2027-01', '2026-10')).toBe(-2);
  });
});

describe('addMonths', () => {
  it('moves forward and back across years', () => {
    expect(addMonths('2026-10', 0)).toBe('2026-10');
    expect(addMonths('2026-10', 3)).toBe('2027-01');
    expect(addMonths('2026-10', 14)).toBe('2027-12');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

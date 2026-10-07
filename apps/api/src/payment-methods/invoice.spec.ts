import { dueDate, invoiceTotals } from './invoice.js';

describe('invoiceTotals', () => {
  it('splits planned, realized and pending amounts', () => {
    expect(
      invoiceTotals(
        [
          { plannedCents: 10000, realizedCents: null },
          { plannedCents: 5000, realizedCents: 4550 },
        ],
        [
          { shareCents: 3000, paid: true },
          { shareCents: 1000, paid: false },
        ],
      ),
    ).toEqual({
      plannedCents: 19000,
      realizedCents: 7550,
      pendingCents: 11000,
      effectiveCents: 18550,
      count: 4,
    });
  });

  it('is all zeros when empty', () => {
    expect(invoiceTotals([])).toEqual({
      plannedCents: 0,
      realizedCents: 0,
      pendingCents: 0,
      effectiveCents: 0,
      count: 0,
    });
  });
});

describe('dueDate', () => {
  it('puts the due day in the month', () => {
    expect(dueDate('2026-10', 12)).toBe('2026-10-12');
    expect(dueDate('2026-10', 5)).toBe('2026-10-05');
  });

  it('falls on the last day of shorter months', () => {
    expect(dueDate('2027-02', 31)).toBe('2027-02-28');
    expect(dueDate('2028-02', 30)).toBe('2028-02-29');
    expect(dueDate('2026-04', 31)).toBe('2026-04-30');
  });

  it('is null without a due day', () => {
    expect(dueDate('2026-10', null)).toBeNull();
  });
});

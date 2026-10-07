import { computeSummary, sumByKind } from './balance.js';

describe('sumByKind', () => {
  const kindOf = new Map([
    [1, 'INCOME' as const],
    [2, 'EXPENSE' as const],
    [3, 'EXPENSE' as const],
  ]);

  it('adds category sums into income and expense totals', () => {
    expect(
      sumByKind(
        [
          { categoryId: 1, amountCents: 500000 },
          { categoryId: 2, amountCents: 180000 },
          { categoryId: 3, amountCents: 20050 },
        ],
        kindOf,
      ),
    ).toEqual({ incomeCents: 500000, expenseCents: 200050 });
  });

  it('ignores categories it does not know', () => {
    expect(sumByKind([{ categoryId: 99, amountCents: 1 }], kindOf)).toEqual({
      incomeCents: 0,
      expenseCents: 0,
    });
  });
});

describe('computeSummary', () => {
  it('opens with the initial balance plus previous months and closes with this month', () => {
    expect(
      computeSummary(
        '2026-10',
        100000,
        { incomeCents: 1000000, expenseCents: 700000 },
        { incomeCents: 500000, expenseCents: 650000 },
      ),
    ).toEqual({
      month: '2026-10',
      initialBalanceCents: 100000,
      openingBalanceCents: 400000,
      incomeCents: 500000,
      expenseCents: 650000,
      monthBalanceCents: -150000,
      closingBalanceCents: 250000,
    });
  });

  it('supports a negative initial balance', () => {
    const summary = computeSummary(
      '2026-10',
      -5000,
      { incomeCents: 0, expenseCents: 0 },
      { incomeCents: 0, expenseCents: 0 },
    );
    expect(summary.openingBalanceCents).toBe(-5000);
    expect(summary.closingBalanceCents).toBe(-5000);
  });
});

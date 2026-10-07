import { computeShares, SplitRuleError, validateRule } from './split.js';

describe('computeShares', () => {
  it('splits equally among every active member when the rule names nobody', () => {
    expect(
      computeShares(1000, { type: 'EQUAL', shares: [] }, [3, 1, 2]),
    ).toEqual([
      { memberId: 1, amountCents: 334 },
      { memberId: 2, amountCents: 333 },
      { memberId: 3, amountCents: 333 },
    ]);
  });

  it('splits equally among the named participants only', () => {
    expect(
      computeShares(
        1001,
        {
          type: 'EQUAL',
          shares: [
            { memberId: 5, value: 1 },
            { memberId: 2, value: 1 },
          ],
        },
        [1, 2, 5],
      ),
    ).toEqual([
      { memberId: 2, amountCents: 501 },
      { memberId: 5, amountCents: 500 },
    ]);
  });

  it('splits by percentage, giving leftover cents to the largest remainders', () => {
    const shares = computeShares(
      10001,
      {
        type: 'PERCENT',
        shares: [
          { memberId: 1, value: 3333 },
          { memberId: 2, value: 3333 },
          { memberId: 3, value: 3334 },
        ],
      },
      [],
    );
    expect(shares).toEqual([
      { memberId: 1, amountCents: 3333 },
      { memberId: 2, amountCents: 3333 },
      { memberId: 3, amountCents: 3335 },
    ]);
    expect(shares.reduce((t, s) => t + s.amountCents, 0)).toBe(10001);
  });

  it('splits 30%/70%', () => {
    expect(
      computeShares(
        200000,
        {
          type: 'PERCENT',
          shares: [
            { memberId: 1, value: 3000 },
            { memberId: 2, value: 7000 },
          ],
        },
        [],
      ),
    ).toEqual([
      { memberId: 1, amountCents: 60000 },
      { memberId: 2, amountCents: 140000 },
    ]);
  });

  it('splits proportionally to weights', () => {
    expect(
      computeShares(
        1000,
        {
          type: 'WEIGHT',
          shares: [
            { memberId: 1, value: 2 },
            { memberId: 2, value: 1 },
          ],
        },
        [],
      ),
    ).toEqual([
      { memberId: 1, amountCents: 667 },
      { memberId: 2, amountCents: 333 },
    ]);
  });

  it('uses fixed values when they add up to the amount', () => {
    const rule = {
      type: 'FIXED' as const,
      shares: [
        { memberId: 1, value: 40000 },
        { memberId: 2, value: 60000 },
      ],
    };
    expect(computeShares(100000, rule, [])).toEqual([
      { memberId: 1, amountCents: 40000 },
      { memberId: 2, amountCents: 60000 },
    ]);
    expect(() => computeShares(90000, rule, [])).toThrow(
      'The amount must equal the fixed values total',
    );
  });

  it('rejects an equal split with nobody to split among', () => {
    expect(() => computeShares(100, { type: 'EQUAL', shares: [] }, [])).toThrow(
      SplitRuleError,
    );
  });
});

describe('validateRule', () => {
  it('requires percentages to add up to 100%', () => {
    expect(() =>
      validateRule({
        type: 'PERCENT',
        shares: [
          { memberId: 1, value: 1500 },
          { memberId: 2, value: 3000 },
        ],
      }),
    ).toThrow('Percentages must add up to 100%');
  });

  it('rejects repeated members, missing members and non-positive values', () => {
    expect(() =>
      validateRule({
        type: 'WEIGHT',
        shares: [
          { memberId: 1, value: 1 },
          { memberId: 1, value: 2 },
        ],
      }),
    ).toThrow('A member appears more than once');
    expect(() => validateRule({ type: 'FIXED', shares: [] })).toThrow(
      'The rule needs at least one member',
    );
    expect(() =>
      validateRule({ type: 'WEIGHT', shares: [{ memberId: 1, value: 0 }] }),
    ).toThrow('Every value must be a positive integer');
    expect(() =>
      validateRule({ type: 'WEIGHT', shares: [{ memberId: 1, value: 1001 }] }),
    ).toThrow("Weights can't exceed 1000");
  });

  it('accepts an equal rule without participants', () => {
    expect(() => validateRule({ type: 'EQUAL', shares: [] })).not.toThrow();
  });
});

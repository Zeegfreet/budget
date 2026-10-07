import { computeGroupBalance, suggestTransfers } from './settlement.js';

describe('computeGroupBalance', () => {
  it('credits the payer of an expense and debits each share', () => {
    const balance = computeGroupBalance(
      [
        {
          kind: 'EXPENSE',
          amountCents: 200000,
          paidByMemberId: 1,
          shares: [
            { memberId: 1, amountCents: 60000 },
            { memberId: 2, amountCents: 140000 },
          ],
        },
      ],
      [1, 2],
    );

    expect(balance.members).toEqual([
      {
        memberId: 1,
        shareCents: 60000,
        paidCents: 200000,
        receivedCents: 0,
        netCents: 140000,
      },
      {
        memberId: 2,
        shareCents: 140000,
        paidCents: 0,
        receivedCents: 0,
        netCents: -140000,
      },
    ]);
    expect(balance.transfers).toEqual([
      { fromMemberId: 2, toMemberId: 1, amountCents: 140000 },
    ]);
    expect(balance).toMatchObject({
      expenseCents: 200000,
      incomeCents: 0,
      pendingCents: 0,
    });
  });

  it('makes whoever received an income owe the others their shares', () => {
    const balance = computeGroupBalance(
      [
        {
          kind: 'INCOME',
          amountCents: 1000,
          paidByMemberId: 2,
          shares: [
            { memberId: 1, amountCents: 500 },
            { memberId: 2, amountCents: 500 },
          ],
        },
      ],
      [1, 2],
    );

    expect(balance.members.map((m) => [m.memberId, m.netCents])).toEqual([
      [1, 500],
      [2, -500],
    ]);
    expect(balance.members[1]).toMatchObject({
      receivedCents: 1000,
      shareCents: -500,
    });
  });

  it('counts pending items in the shares but not in the nets', () => {
    const balance = computeGroupBalance(
      [
        {
          kind: 'EXPENSE',
          amountCents: 300,
          paidByMemberId: null,
          shares: [
            { memberId: 1, amountCents: 150 },
            { memberId: 3, amountCents: 150 },
          ],
        },
      ],
      [1, 2],
    );

    expect(balance.pendingCents).toBe(300);
    expect(
      balance.members.map((m) => [m.memberId, m.shareCents, m.netCents]),
    ).toEqual([
      [1, 150, 0],
      [2, 0, 0],
      [3, 150, 0],
    ]);
    expect(balance.transfers).toEqual([]);
  });

  it('keeps the nets adding up to zero', () => {
    const balance = computeGroupBalance(
      [
        {
          kind: 'EXPENSE',
          amountCents: 1001,
          paidByMemberId: 3,
          shares: [
            { memberId: 1, amountCents: 334 },
            { memberId: 2, amountCents: 334 },
            { memberId: 3, amountCents: 333 },
          ],
        },
        {
          kind: 'EXPENSE',
          amountCents: 500,
          paidByMemberId: 1,
          shares: [
            { memberId: 1, amountCents: 250 },
            { memberId: 2, amountCents: 250 },
          ],
        },
      ],
      [1, 2, 3],
    );

    expect(balance.members.reduce((t, m) => t + m.netCents, 0)).toBe(0);
  });
});

describe('suggestTransfers', () => {
  it('settles everyone with the largest debtor paying the largest creditor', () => {
    expect(
      suggestTransfers([
        { memberId: 1, netCents: 700 },
        { memberId: 2, netCents: -500 },
        { memberId: 3, netCents: -300 },
        { memberId: 4, netCents: 100 },
      ]),
    ).toEqual([
      { fromMemberId: 2, toMemberId: 1, amountCents: 500 },
      { fromMemberId: 3, toMemberId: 1, amountCents: 200 },
      { fromMemberId: 3, toMemberId: 4, amountCents: 100 },
    ]);
  });
});

import { resplitPending } from './resplit.js';

describe('resplitPending', () => {
  const tx = {
    groupTransaction: { findMany: vi.fn(), update: vi.fn() },
    groupMember: { findMany: vi.fn() },
    groupTransactionShare: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const run = (scope?: Parameters<typeof resplitPending>[2]) =>
    resplitPending(tx as never, 5, scope);
  const equal = { type: 'EQUAL', active: true, shares: [] };
  const pending = (
    id: number,
    splitMethod: unknown,
    shares: [number, number][],
    amountCents = 900,
  ) => ({
    id,
    amountCents,
    splitMethod,
    shares: shares.map(([memberId, cents]) => ({
      memberId,
      amountCents: cents,
    })),
  });
  const written = () =>
    tx.groupTransactionShare.createMany.mock.calls.map(([args]) => args.data);

  beforeEach(() => {
    vi.clearAllMocks();
    tx.groupMember.findMany.mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
  });

  it('reads the unpaid transactions in the scope', async () => {
    tx.groupTransaction.findMany.mockResolvedValue([]);

    await run({ fromMonth: '2026-10', splitMethodId: 4 });

    expect(tx.groupTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 5,
          paidByMemberId: null,
          month: { gte: '2026-10' },
          splitMethodId: 4,
        },
      }),
    );
  });

  it('divides again with the rule and the current members', async () => {
    tx.groupTransaction.findMany.mockResolvedValue([
      pending(10, equal, [
        [1, 450],
        [2, 450],
      ]),
    ]);

    await run();

    expect(tx.groupTransactionShare.deleteMany).toHaveBeenCalledWith({
      where: { transactionId: 10 },
    });
    expect(written()).toEqual([
      [
        { memberId: 1, amountCents: 300, transactionId: 10 },
        { memberId: 2, amountCents: 300, transactionId: 10 },
        { memberId: 3, amountCents: 300, transactionId: 10 },
      ],
    ]);
    expect(tx.groupTransaction.update).not.toHaveBeenCalled();
  });

  it('writes nothing when the shares stay the same', async () => {
    tx.groupTransaction.findMany.mockResolvedValue([
      pending(10, equal, [
        [1, 300],
        [2, 300],
        [3, 300],
      ]),
    ]);

    await run();

    expect(tx.groupTransactionShare.deleteMany).not.toHaveBeenCalled();
    expect(tx.groupTransactionShare.createMany).not.toHaveBeenCalled();
  });

  it('sets the amount to the total of a fixed rule', async () => {
    tx.groupTransaction.findMany.mockResolvedValue([
      pending(
        10,
        {
          type: 'FIXED',
          active: true,
          shares: [
            { memberId: 1, value: 700 },
            { memberId: 2, value: 500 },
          ],
        },
        [
          [1, 500],
          [2, 400],
        ],
      ),
    ]);

    await run();

    expect(tx.groupTransaction.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { amountCents: 1200 },
    });
    expect(written()[0]).toEqual([
      { memberId: 1, amountCents: 700, transactionId: 10 },
      { memberId: 2, amountCents: 500, transactionId: 10 },
    ]);
  });

  it('gives a former member’s share to the others when the rule is off or gone', async () => {
    tx.groupTransaction.findMany.mockResolvedValue([
      pending(
        10,
        {
          type: 'PERCENT',
          active: false,
          shares: [
            { memberId: 1, value: 5000 },
            { memberId: 4, value: 5000 },
          ],
        },
        [
          [1, 600],
          [2, 200],
          [4, 100],
        ],
      ),
      pending(11, null, [
        [1, 450],
        [2, 450],
      ]),
    ]);

    await run();

    // 100 from member 4 goes 3:1 to members 1 and 2; transaction 11 has no former member
    expect(written()).toEqual([
      [
        { memberId: 1, amountCents: 675, transactionId: 10 },
        { memberId: 2, amountCents: 225, transactionId: 10 },
      ],
    ]);
  });

  it('splits equally among the active members when nobody of the item is left', async () => {
    tx.groupTransaction.findMany.mockResolvedValue([
      pending(10, null, [[4, 900]]),
    ]);

    await run();

    expect(written()[0]).toEqual([
      { memberId: 1, amountCents: 300, transactionId: 10 },
      { memberId: 2, amountCents: 300, transactionId: 10 },
      { memberId: 3, amountCents: 300, transactionId: 10 },
    ]);
  });
});

import type { GroupMember } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { endMembership, includeInRules } from './membership.js';
import { resplitPending } from './resplit.js';

vi.mock('./resplit.js', () => ({ resplitPending: vi.fn() }));
vi.mock('../budget/month.js', () => ({ currentMonth: () => '2026-10' }));

describe('endMembership', () => {
  const tx = {
    groupMember: { update: vi.fn(), findMany: vi.fn() },
    financeGroup: { delete: vi.fn() },
    splitMethod: { findMany: vi.fn(), update: vi.fn() },
    splitMethodShare: { delete: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  };
  const member = (id: number, role: 'OWNER' | 'MEMBER' = 'MEMBER') =>
    ({ id, groupId: 5, userId: id * 10, role }) as GroupMember;
  const run = (m: GroupMember) =>
    endMembership(prisma as unknown as PrismaService, m);

  beforeEach(() => {
    vi.clearAllMocks();
    tx.splitMethod.findMany.mockResolvedValue([]);
  });

  it('marks the membership as ended', async () => {
    tx.groupMember.findMany.mockResolvedValue([member(2, 'OWNER')]);

    await run(member(1));

    expect(tx.groupMember.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { leftAt: expect.any(Date), role: 'MEMBER' },
    });
    expect(tx.groupMember.update).toHaveBeenCalledTimes(1);
  });

  it('deletes the group when nobody is left', async () => {
    tx.groupMember.findMany.mockResolvedValue([]);

    await run(member(1, 'OWNER'));

    expect(tx.financeGroup.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(tx.splitMethod.findMany).not.toHaveBeenCalled();
    expect(resplitPending).not.toHaveBeenCalled();
  });

  it('makes the oldest remaining member the owner', async () => {
    tx.groupMember.findMany.mockResolvedValue([member(3), member(4)]);

    await run(member(1, 'OWNER'));

    expect(tx.groupMember.update).toHaveBeenLastCalledWith({
      where: { id: 3 },
      data: { role: 'OWNER' },
    });
  });

  it('drops the member from equal and weight rules and turns off the others', async () => {
    tx.groupMember.findMany.mockResolvedValue([member(2, 'OWNER')]);
    tx.splitMethod.findMany.mockResolvedValue([
      { id: 10, type: 'EQUAL', _count: { shares: 2 } },
      { id: 11, type: 'WEIGHT', _count: { shares: 1 } },
      { id: 12, type: 'PERCENT', _count: { shares: 2 } },
      { id: 13, type: 'FIXED', _count: { shares: 2 } },
    ]);

    await run(member(1));

    expect(tx.splitMethodShare.delete).toHaveBeenCalledTimes(2);
    expect(tx.splitMethodShare.delete).toHaveBeenCalledWith({
      where: { splitMethodId_memberId: { splitMethodId: 10, memberId: 1 } },
    });
    expect(
      tx.splitMethod.update.mock.calls.map(([args]) => args.where.id),
    ).toEqual([11, 12, 13]);
  });

  it('divides the pending transactions from the current month on again', async () => {
    tx.groupMember.findMany.mockResolvedValue([member(2, 'OWNER')]);

    await run(member(1));

    expect(resplitPending).toHaveBeenCalledWith(tx, 5, {
      fromMonth: '2026-10',
    });
  });
});

describe('includeInRules', () => {
  const tx = {
    splitMethod: { findMany: vi.fn(), update: vi.fn() },
    splitMethodShare: { create: vi.fn() },
  };
  const run = () => includeInRules(tx as never, 5, 9);

  beforeEach(() => vi.clearAllMocks());

  it('adds the member to equal and weight rules and divides the pending ones again', async () => {
    tx.splitMethod.findMany.mockResolvedValue([
      // The "everyone" rule already covers them
      { id: 10, type: 'EQUAL', active: true, shares: [] },
      { id: 11, type: 'EQUAL', active: true, shares: [{ memberId: 1 }] },
      { id: 12, type: 'WEIGHT', active: true, shares: [{ memberId: 1 }] },
      // Turned off for having nobody left: back on with the new member
      { id: 13, type: 'WEIGHT', active: false, shares: [] },
      // A former membership coming back may already be there
      { id: 14, type: 'WEIGHT', active: true, shares: [{ memberId: 9 }] },
    ]);

    await run();

    expect(tx.splitMethod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 5, type: { in: ['EQUAL', 'WEIGHT'] } },
      }),
    );
    expect(
      tx.splitMethodShare.create.mock.calls.map(([args]) => args.data),
    ).toEqual([
      { splitMethodId: 11, memberId: 9, value: 1 },
      { splitMethodId: 12, memberId: 9, value: 1 },
      { splitMethodId: 13, memberId: 9, value: 1 },
    ]);
    expect(tx.splitMethod.update).toHaveBeenCalledTimes(1);
    expect(tx.splitMethod.update).toHaveBeenCalledWith({
      where: { id: 13 },
      data: { active: true },
    });
    expect(resplitPending).toHaveBeenCalledWith(tx, 5, {
      fromMonth: '2026-10',
    });
  });
});

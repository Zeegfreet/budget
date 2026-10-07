import type { GroupMember } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { endMembership } from './membership.js';

describe('endMembership', () => {
  const tx = {
    groupMember: { update: vi.fn(), findMany: vi.fn() },
    financeGroup: { delete: vi.fn() },
    splitMethod: { findMany: vi.fn(), update: vi.fn() },
    splitMethodShare: { delete: vi.fn() },
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
});

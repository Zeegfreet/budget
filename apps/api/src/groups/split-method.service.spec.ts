import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { resplitPending } from './resplit.js';
import { SplitMethodService } from './split-method.service.js';

vi.mock('./resplit.js', () => ({ resplitPending: vi.fn() }));

describe('SplitMethodService', () => {
  const prisma = {
    $transaction: vi.fn(),
    groupMember: { findFirst: vi.fn(), findMany: vi.fn() },
    splitMethod: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new SplitMethodService(prisma as unknown as PrismaService);
  const percent = {
    name: '30/70',
    type: 'PERCENT' as const,
    shares: [
      { memberId: 1, value: 3000 },
      { memberId: 2, value: 7000 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.groupMember.findFirst.mockResolvedValue({ id: 1, role: 'MEMBER' });
    prisma.groupMember.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
  });

  it('creates a valid rule naming active members', async () => {
    prisma.splitMethod.create.mockResolvedValue({ id: 3 });

    await service.create(7, 5, percent);

    expect(prisma.splitMethod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          groupId: 5,
          name: '30/70',
          type: 'PERCENT',
          shares: { create: percent.shares },
        },
      }),
    );
  });

  it('stores 1 for each participant of an equal rule', async () => {
    await service.create(7, 5, {
      name: 'Dois',
      type: 'EQUAL',
      shares: [{ memberId: 1 }, { memberId: 2, value: 9 }],
    });

    expect(prisma.splitMethod.create.mock.calls[0][0].data.shares).toEqual({
      create: [
        { memberId: 1, value: 1 },
        { memberId: 2, value: 1 },
      ],
    });
  });

  it('rejects invalid rules and non-members with 400', async () => {
    await expect(
      service.create(7, 5, {
        ...percent,
        shares: [{ memberId: 1, value: 5000 }],
      }),
    ).rejects.toThrow(
      new BadRequestException('Percentages must add up to 100%'),
    );

    await expect(
      service.create(7, 5, {
        name: 'X',
        type: 'EQUAL',
        shares: [{ memberId: 99 }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.splitMethod.create).not.toHaveBeenCalled();
  });

  it('turns a duplicate name into 409', async () => {
    prisma.splitMethod.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.create(7, 5, percent)).rejects.toThrow(
      ConflictException,
    );
  });

  it('renames without touching the shares, and revalidates on new shares', async () => {
    prisma.splitMethod.findFirst.mockResolvedValue({ id: 3, ...percent });

    await service.update(7, 5, 3, { name: 'Novo' });
    expect(prisma.splitMethod.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 3 }, data: { name: 'Novo' } }),
    );
    // A new name doesn't change any share
    expect(resplitPending).not.toHaveBeenCalled();

    await service.update(7, 5, 3, { type: 'FIXED' });
    expect(prisma.splitMethod.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          name: undefined,
          type: 'FIXED',
          active: true,
          shares: { deleteMany: {}, create: percent.shares },
        },
      }),
    );
    // Every pending transaction of the rule is divided again
    expect(resplitPending).toHaveBeenCalledWith(prisma, 5, {
      splitMethodId: 3,
    });
  });

  it('returns 404 for rules of other groups', async () => {
    prisma.splitMethod.findFirst.mockResolvedValue(null);

    await expect(service.update(7, 5, 3, { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(7, 5, 3)).rejects.toThrow(NotFoundException);
    expect(prisma.splitMethod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3, groupId: 5 } }),
    );
    expect(prisma.splitMethod.delete).not.toHaveBeenCalled();
  });
});

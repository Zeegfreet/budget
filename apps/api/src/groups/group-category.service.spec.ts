import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { GroupCategoryService } from './group-category.service.js';

describe('GroupCategoryService', () => {
  const prisma = {
    groupMember: { findFirst: vi.fn() },
    groupCategory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new GroupCategoryService(prisma as unknown as PrismaService);
  const aluguel = { id: 20, kind: 'EXPENSE', name: 'Aluguel', active: true };
  const duplicate = () =>
    new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
    });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.groupMember.findFirst.mockResolvedValue({ id: 1, groupId: 5 });
    prisma.groupCategory.findFirst.mockResolvedValue({ id: 20 });
  });

  it('lists the group’s categories for a member', async () => {
    prisma.groupCategory.findMany.mockResolvedValue([aluguel]);

    await expect(service.list(7, 5)).resolves.toEqual([aluguel]);
    expect(prisma.groupMember.findFirst).toHaveBeenCalledWith({
      where: { groupId: 5, userId: 7, leftAt: null },
    });
    expect(prisma.groupCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 5 } }),
    );
  });

  it('returns 404 to non-members', async () => {
    prisma.groupMember.findFirst.mockResolvedValue(null);

    await expect(service.list(9, 5)).rejects.toThrow(NotFoundException);
    await expect(
      service.create(9, 5, { kind: 'EXPENSE', name: 'X' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.groupCategory.create).not.toHaveBeenCalled();
  });

  it('creates in the group and maps a repeated name to 409', async () => {
    prisma.groupCategory.create.mockResolvedValueOnce(aluguel);
    await service.create(7, 5, { kind: 'EXPENSE', name: 'Aluguel' });
    expect(prisma.groupCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { groupId: 5, kind: 'EXPENSE', name: 'Aluguel' },
      }),
    );

    prisma.groupCategory.create.mockRejectedValueOnce(duplicate());
    await expect(
      service.create(7, 5, { kind: 'EXPENSE', name: 'Aluguel' }),
    ).rejects.toThrow(ConflictException);
  });

  it('updates and deletes only a category of the group', async () => {
    await service.update(7, 5, 20, { active: false });
    expect(prisma.groupCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20, groupId: 5 } }),
    );
    expect(prisma.groupCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20 }, data: { active: false } }),
    );
    await service.remove(7, 5, 20);
    expect(prisma.groupCategory.delete).toHaveBeenCalledWith({
      where: { id: 20 },
    });

    prisma.groupCategory.findFirst.mockResolvedValue(null);
    await expect(service.update(7, 5, 30, { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove(7, 5, 30)).rejects.toThrow(NotFoundException);
    expect(prisma.groupCategory.delete).toHaveBeenCalledTimes(1);
  });
});

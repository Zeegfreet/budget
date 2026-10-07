import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { GroupService } from './group.service.js';
import { endMembership } from './membership.js';

vi.mock('./membership.js', () => ({ endMembership: vi.fn() }));

describe('GroupService', () => {
  const prisma = {
    groupMember: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    category: { findMany: vi.fn() },
    financeGroup: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new GroupService(prisma as unknown as PrismaService);
  const owner = {
    id: 1,
    groupId: 5,
    userId: 7,
    role: 'OWNER',
    expenseCategoryId: null,
    incomeCategoryId: null,
  };
  const member = { id: 2, groupId: 5, userId: 8, role: 'MEMBER' };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.financeGroup.findUniqueOrThrow.mockResolvedValue({
      id: 5,
      name: 'República',
      description: null,
      members: [
        {
          id: 1,
          userId: 7,
          role: 'OWNER',
          joinedAt: new Date(0),
          user: { name: 'Ana', email: 'ana@example.com' },
        },
      ],
    });
  });

  it('lists the user’s active groups with their role and member count', async () => {
    prisma.groupMember.findMany.mockResolvedValue([
      {
        role: 'OWNER',
        group: {
          id: 5,
          name: 'República',
          description: null,
          _count: { members: 3 },
        },
      },
    ]);

    await expect(service.list(7)).resolves.toEqual([
      {
        id: 5,
        name: 'República',
        description: null,
        role: 'OWNER',
        memberCount: 3,
      },
    ]);
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7, leftAt: null } }),
    );
  });

  it('creates the group with its creator as owner and an equal rule', async () => {
    prisma.financeGroup.create.mockResolvedValue({ id: 5 });
    prisma.groupMember.findFirst.mockResolvedValue(owner);

    const group = await service.create(7, { name: 'República' });

    expect(prisma.financeGroup.create).toHaveBeenCalledWith({
      data: {
        name: 'República',
        description: null,
        members: { create: { userId: 7, role: 'OWNER' } },
        splitMethods: { create: { name: 'Igualitário', type: 'EQUAL' } },
      },
    });
    expect(group).toMatchObject({
      id: 5,
      role: 'OWNER',
      memberId: 1,
      memberCount: 1,
      members: [{ id: 1, name: 'Ana', email: 'ana@example.com' }],
    });
  });

  it('returns 404 to non-members', async () => {
    prisma.groupMember.findFirst.mockResolvedValue(null);

    await expect(service.get(9, 5)).rejects.toThrow(NotFoundException);
    expect(prisma.groupMember.findFirst).toHaveBeenCalledWith({
      where: { groupId: 5, userId: 9, leftAt: null },
    });
  });

  it('lets only the owner update or delete', async () => {
    prisma.groupMember.findFirst.mockResolvedValue(member);
    await expect(service.update(8, 5, { name: 'X' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.remove(8, 5)).rejects.toThrow(ForbiddenException);
    expect(prisma.financeGroup.update).not.toHaveBeenCalled();
    expect(prisma.financeGroup.delete).not.toHaveBeenCalled();

    prisma.groupMember.findFirst.mockResolvedValue(owner);
    await service.remove(7, 5);
    expect(prisma.financeGroup.delete).toHaveBeenCalledWith({
      where: { id: 5 },
    });
  });

  it('ends the user’s own membership on leave', async () => {
    prisma.groupMember.findFirst.mockResolvedValue(member);

    await service.leave(8, 5);

    expect(endMembership).toHaveBeenCalledWith(prisma, member);
  });

  it('removes another active member of the same group', async () => {
    prisma.groupMember.findFirst
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce(member);

    await service.removeMember(7, 5, 2);

    expect(prisma.groupMember.findFirst).toHaveBeenLastCalledWith({
      where: { id: 2, groupId: 5, leftAt: null },
    });
    expect(endMembership).toHaveBeenCalledWith(prisma, member);
  });

  it('rejects removing oneself or an unknown member', async () => {
    prisma.groupMember.findFirst.mockResolvedValue(owner);
    await expect(service.removeMember(7, 5, 1)).rejects.toThrow(
      BadRequestException,
    );

    prisma.groupMember.findFirst
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce(null);
    await expect(service.removeMember(7, 5, 3)).rejects.toThrow(
      NotFoundException,
    );
    expect(endMembership).not.toHaveBeenCalled();
  });

  describe('setLink', () => {
    const categories = [
      { id: 3, active: true, group: { active: true, kind: 'EXPENSE' } },
      { id: 4, active: true, group: { active: true, kind: 'INCOME' } },
    ];

    it('links the caller’s own membership to their categories', async () => {
      prisma.groupMember.findFirst.mockResolvedValue(owner);
      prisma.category.findMany.mockResolvedValue(categories);

      await service.setLink(7, 5, {
        expenseCategoryId: 3,
        incomeCategoryId: 4,
      });

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7, id: { in: [3, 4] } } }),
      );
      expect(prisma.groupMember.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { expenseCategoryId: 3, incomeCategoryId: 4 },
      });
    });

    it('clears the link with null without checking categories', async () => {
      prisma.groupMember.findFirst.mockResolvedValue(owner);
      prisma.category.findMany.mockResolvedValue([]);

      const group = await service.setLink(7, 5, {
        expenseCategoryId: null,
        incomeCategoryId: null,
      });

      expect(prisma.groupMember.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { expenseCategoryId: null, incomeCategoryId: null },
      });
      expect(group.link).toEqual({
        expenseCategoryId: null,
        incomeCategoryId: null,
      });
    });

    it('keeps a linked category even after it was inactivated', async () => {
      prisma.groupMember.findFirst.mockResolvedValue({
        ...owner,
        expenseCategoryId: 3,
      });
      prisma.category.findMany
        // assertWritableCategories: only the new income category is checked
        .mockResolvedValueOnce([categories[1]])
        .mockResolvedValueOnce(categories);

      await service.setLink(7, 5, {
        expenseCategoryId: 3,
        incomeCategoryId: 4,
      });

      expect(prisma.category.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { userId: 7, id: { in: [4] } } }),
      );
      expect(prisma.groupMember.update).toHaveBeenCalled();
    });

    it('rejects a category of the wrong kind', async () => {
      prisma.groupMember.findFirst.mockResolvedValue(owner);
      prisma.category.findMany.mockResolvedValue(categories);

      await expect(
        service.setLink(7, 5, { expenseCategoryId: 4, incomeCategoryId: 3 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.groupMember.update).not.toHaveBeenCalled();
    });

    it('returns 404 for another user’s category or a non-member', async () => {
      prisma.groupMember.findFirst.mockResolvedValue(owner);
      prisma.category.findMany.mockResolvedValue([]);
      await expect(
        service.setLink(7, 5, { expenseCategoryId: 3, incomeCategoryId: null }),
      ).rejects.toThrow(NotFoundException);

      prisma.groupMember.findFirst.mockResolvedValue(null);
      await expect(
        service.setLink(9, 5, {
          expenseCategoryId: null,
          incomeCategoryId: null,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.groupMember.update).not.toHaveBeenCalled();
    });
  });
});

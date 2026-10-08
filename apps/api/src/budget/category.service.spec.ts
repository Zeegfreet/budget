import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CategoryService } from './category.service.js';

describe('CategoryService', () => {
  const prisma = {
    categoryGroup: {
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
    category: {
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const service = new CategoryService(prisma as unknown as PrismaService);
  const duplicate = () =>
    new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
  const expenseGroup = { kind: 'EXPENSE', active: true };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.categoryGroup.aggregate.mockResolvedValue({ _max: { position: 4 } });
    prisma.category.aggregate.mockResolvedValue({ _max: { position: null } });
  });

  describe('createGroup', () => {
    it('appends the type after the last one of its kind', async () => {
      prisma.categoryGroup.create.mockResolvedValue({ id: 9 });

      await expect(
        service.createGroup(7, {
          kind: 'EXPENSE',
          name: 'Lazer',
          goalPercent: 20,
        }),
      ).resolves.toEqual({ id: 9 });
      expect(prisma.categoryGroup.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7, kind: 'EXPENSE' } }),
      );
      expect(prisma.categoryGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId: 7,
            kind: 'EXPENSE',
            name: 'Lazer',
            goalPercent: 20,
            position: 5,
          },
        }),
      );
    });

    it('rejects a goal on an income type', async () => {
      await expect(
        service.createGroup(7, {
          kind: 'INCOME',
          name: 'Bônus',
          goalPercent: 10,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.categoryGroup.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name to 409', async () => {
      prisma.categoryGroup.create.mockRejectedValue(duplicate());

      await expect(
        service.createGroup(7, { kind: 'INCOME', name: 'Salário' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows other errors', async () => {
      prisma.categoryGroup.create.mockRejectedValue(new Error('disk full'));

      await expect(
        service.createGroup(7, { kind: 'INCOME', name: 'Bônus' }),
      ).rejects.toThrow('disk full');
    });
  });

  describe('updateGroup', () => {
    it('updates only the given fields of the user’s type', async () => {
      prisma.categoryGroup.findFirst.mockResolvedValue(expenseGroup);
      prisma.categoryGroup.update.mockResolvedValue({ id: 3 });

      await service.updateGroup(7, 3, { goalPercent: null, active: false });

      expect(prisma.categoryGroup.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 3, userId: 7 } }),
      );
      expect(prisma.categoryGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3 },
          data: { name: undefined, active: false, goalPercent: null },
        }),
      );
    });

    it('returns 404 for another user’s type', async () => {
      prisma.categoryGroup.findFirst.mockResolvedValue(null);

      await expect(service.updateGroup(7, 3, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.categoryGroup.update).not.toHaveBeenCalled();
    });

    it('rejects a goal on an income type', async () => {
      prisma.categoryGroup.findFirst.mockResolvedValue({
        kind: 'INCOME',
        active: true,
      });

      await expect(
        service.updateGroup(7, 3, { goalPercent: 10 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteGroup', () => {
    it('deletes the user’s type', async () => {
      prisma.categoryGroup.findFirst.mockResolvedValue(expenseGroup);

      await service.deleteGroup(7, 3);

      expect(prisma.categoryGroup.delete).toHaveBeenCalledWith({
        where: { id: 3 },
      });
    });

    it('returns 404 for another user’s type', async () => {
      prisma.categoryGroup.findFirst.mockResolvedValue(null);

      await expect(service.deleteGroup(7, 3)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.categoryGroup.delete).not.toHaveBeenCalled();
    });
  });

  describe('createCategory', () => {
    it('appends the category to the user’s type', async () => {
      prisma.categoryGroup.findFirst.mockResolvedValue(expenseGroup);
      prisma.category.create.mockResolvedValue({ id: 11 });

      await service.createCategory(7, 3, { name: 'Aluguel' });

      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId: 7,
            groupId: 3,
            name: 'Aluguel',
            position: 0,
          },
        }),
      );
    });

    it('returns 404 for another user’s type', async () => {
      prisma.categoryGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.createCategory(7, 3, { name: 'Aluguel' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an inactive type', async () => {
      prisma.categoryGroup.findFirst.mockResolvedValue({
        kind: 'EXPENSE',
        active: false,
      });

      await expect(
        service.createCategory(7, 3, { name: 'Aluguel' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name to 409', async () => {
      prisma.categoryGroup.findFirst.mockResolvedValue(expenseGroup);
      prisma.category.create.mockRejectedValue(duplicate());

      await expect(
        service.createCategory(7, 3, { name: 'Moradia' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateCategory and deleteCategory', () => {
    it('changes only the given fields', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 11 });
      prisma.category.update.mockResolvedValue({ id: 11 });

      await service.updateCategory(7, 11, { active: false });

      expect(prisma.category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 11, userId: 7 } }),
      );
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 11 },
          data: { name: undefined, active: false },
        }),
      );
    });

    it('deletes the user’s category', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 11 });

      await service.deleteCategory(7, 11);

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 11 },
      });
    });

    it('returns 404 for another user’s category', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.updateCategory(7, 11, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      await expect(service.deleteCategory(7, 11)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });
  });
});

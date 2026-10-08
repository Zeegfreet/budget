import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { BudgetService } from './budget.service.js';
import type { CategoryService } from './category.service.js';
import { PlanService } from './plan.service.js';
import type { TransactionService } from './transaction.service.js';

describe('PlanService', () => {
  const tx = { tag: 'tx' };
  const prisma = {
    $transaction: vi.fn((run: (client: unknown) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const calls: string[] = [];
  const track =
    <T>(name: string, result?: (...args: unknown[]) => T) =>
    (...args: unknown[]) => {
      calls.push(name);
      return Promise.resolve(result?.(...args));
    };
  const categories = {
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  };
  const transactions = { create: vi.fn(), update: vi.fn(), remove: vi.fn() };
  const budget = { saveLines: vi.fn() };
  const service = new PlanService(
    prisma as unknown as PrismaService,
    categories as unknown as CategoryService,
    transactions as unknown as TransactionService,
    budget as unknown as BudgetService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    categories.createGroup.mockImplementation(
      track('createGroup', () => ({ id: 50 })),
    );
    categories.updateGroup.mockImplementation(track('updateGroup'));
    categories.deleteGroup.mockImplementation(track('deleteGroup'));
    categories.createCategory.mockImplementation(
      track('createCategory', () => ({ id: 60 })),
    );
    categories.updateCategory.mockImplementation(track('updateCategory'));
    categories.deleteCategory.mockImplementation(track('deleteCategory'));
    transactions.create.mockImplementation(
      track('createLine', () => [{ id: 70 }, { id: 71 }]),
    );
    transactions.update.mockImplementation(track('updateLine'));
    transactions.remove.mockImplementation(track('deleteLine'));
    budget.saveLines.mockImplementation(track('cells'));
  });

  it('applies everything in one transaction, resolving refs to the created ids', async () => {
    await service.save(7, {
      createGroups: [
        { ref: -1, kind: 'EXPENSE', name: 'Lazer', goalPercent: 10 },
      ],
      createCategories: [{ ref: -2, groupId: -1, name: 'Cinema' }],
      createLines: [
        {
          ref: -3,
          categoryId: -2,
          month: '2026-10',
          plannedCents: 5000,
          repeatMonths: 2,
        },
      ],
      updateLines: [{ transactionId: 12, categoryId: -2, plannedCents: 100 }],
      cells: [
        { anchorId: -3, month: '2026-11', amountCents: 6000 },
        { anchorId: 12, month: '2026-10', amountCents: 0 },
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(categories.createGroup).toHaveBeenCalledWith(
      7,
      { kind: 'EXPENSE', name: 'Lazer', goalPercent: 10 },
      tx,
    );
    expect(categories.createCategory).toHaveBeenCalledWith(
      7,
      50,
      { name: 'Cinema' },
      tx,
    );
    expect(transactions.create).toHaveBeenCalledWith(
      7,
      { categoryId: 60, month: '2026-10', plannedCents: 5000, repeatMonths: 2 },
      tx,
    );
    expect(transactions.update).toHaveBeenCalledWith(
      7,
      12,
      { categoryId: 60, plannedCents: 100, scope: 'FOLLOWING' },
      tx,
    );
    expect(budget.saveLines).toHaveBeenCalledWith(
      7,
      [
        { anchorId: 70, month: '2026-11', amountCents: 6000 },
        { anchorId: 12, month: '2026-10', amountCents: 0 },
      ],
      tx,
    );
  });

  it('follows the fixed order: deletes first, inactivations after the values', async () => {
    await service.save(7, {
      deleteGroups: [1],
      deleteCategories: [2],
      cells: [{ anchorId: 12, month: '2026-10', amountCents: 10 }],
      deleteLines: [13],
      updateLines: [{ transactionId: 14, description: 'Luz' }],
      updateCategories: [{ id: 3, name: 'Casa', active: false }],
      createCategories: [{ ref: -2, groupId: 4, name: 'Cinema' }],
      updateGroups: [
        { id: 4, active: false, goalPercent: null },
        { id: 5, active: true },
      ],
      createGroups: [{ ref: -1, kind: 'INCOME', name: 'Extras' }],
      createLines: [
        { ref: -3, categoryId: 9, month: '2026-10', plannedCents: 1 },
      ],
    });

    expect(calls).toEqual([
      'deleteCategory',
      'deleteGroup',
      'createGroup',
      'updateGroup',
      'updateGroup',
      'createCategory',
      'updateCategory',
      'createLine',
      'updateLine',
      'deleteLine',
      'cells',
      'updateCategory',
      'updateGroup',
    ]);
    // The other fields first, the inactivation at the end
    expect(categories.updateGroup).toHaveBeenNthCalledWith(
      1,
      7,
      4,
      { goalPercent: null },
      tx,
    );
    expect(categories.updateGroup).toHaveBeenNthCalledWith(
      2,
      7,
      5,
      { active: true },
      tx,
    );
    expect(categories.updateGroup).toHaveBeenNthCalledWith(
      3,
      7,
      4,
      { active: false },
      tx,
    );
    expect(categories.updateCategory).toHaveBeenNthCalledWith(
      1,
      7,
      3,
      { name: 'Casa' },
      tx,
    );
    expect(categories.updateCategory).toHaveBeenNthCalledWith(
      2,
      7,
      3,
      { active: false },
      tx,
    );
    expect(transactions.remove).toHaveBeenCalledWith(7, 13, 'FOLLOWING', tx);
  });

  it('only inactivates when nothing else changes', async () => {
    await service.save(7, { updateCategories: [{ id: 3, active: false }] });
    expect(categories.updateCategory).toHaveBeenCalledTimes(1);
    expect(categories.updateCategory).toHaveBeenCalledWith(
      7,
      3,
      { active: false },
      tx,
    );
  });

  it('does nothing for an empty plan', async () => {
    await service.save(7, {});
    expect(calls).toEqual([]);
  });

  it('rejects a reference to an item the plan does not create', async () => {
    await expect(
      service.save(7, {
        createCategories: [{ ref: -2, groupId: -1, name: 'X' }],
      }),
    ).rejects.toThrow(new BadRequestException('Unknown type reference'));
    await expect(
      service.save(7, {
        cells: [{ anchorId: -9, month: '2026-10', amountCents: 1 }],
      }),
    ).rejects.toThrow(new BadRequestException('Unknown launch reference'));
    expect(budget.saveLines).not.toHaveBeenCalled();
  });

  it('maps a unique violation that aborted the transaction to 409', async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.save(7, {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets other errors through', async () => {
    categories.deleteGroup.mockRejectedValueOnce(new BadRequestException('x'));
    await expect(service.save(7, { deleteGroups: [1] })).rejects.toThrow('x');
  });
});

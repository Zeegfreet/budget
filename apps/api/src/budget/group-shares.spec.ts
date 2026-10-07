import type { PrismaService } from '../prisma/prisma.service.js';
import {
  linkedCategoryId,
  linkedShareCells,
  sumLinkedShares,
} from './group-shares.js';

const link: {
  expenseCategoryId: number | null;
  incomeCategoryId: number | null;
} = { expenseCategoryId: 3, incomeCategoryId: 4 };
const share = (
  amountCents: number,
  kind: 'INCOME' | 'EXPENSE',
  month = '2026-10',
  member = link,
) => ({ amountCents, member, transaction: { kind, month } });

describe('group shares', () => {
  it('picks the linked category of the share’s kind', () => {
    expect(linkedCategoryId('EXPENSE', link)).toBe(3);
    expect(linkedCategoryId('INCOME', link)).toBe(4);
    expect(
      linkedCategoryId('INCOME', { ...link, incomeCategoryId: null }),
    ).toBeNull();
  });

  it('sums linked shares per category and month and skips unlinked ones', () => {
    expect(
      sumLinkedShares([
        share(1500, 'EXPENSE'),
        share(500, 'EXPENSE'),
        share(700, 'EXPENSE', '2026-11'),
        share(300, 'INCOME'),
        share(999, 'INCOME', '2026-10', { ...link, incomeCategoryId: null }),
      ]),
    ).toEqual([
      { categoryId: 3, month: '2026-10', amountCents: 2000 },
      { categoryId: 3, month: '2026-11', amountCents: 700 },
      { categoryId: 4, month: '2026-10', amountCents: 300 },
    ]);
  });

  it('reads only the user’s linked memberships in the months', async () => {
    const prisma = {
      groupTransactionShare: {
        findMany: vi.fn().mockResolvedValue([share(1500, 'EXPENSE')]),
      },
    };

    await expect(
      linkedShareCells(prisma as unknown as PrismaService, 7, {
        lt: '2026-10',
      }),
    ).resolves.toEqual([
      { categoryId: 3, month: '2026-10', amountCents: 1500 },
    ]);
    expect(prisma.groupTransactionShare.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          member: {
            userId: 7,
            OR: [
              { expenseCategoryId: { not: null } },
              { incomeCategoryId: { not: null } },
            ],
          },
          transaction: { month: { lt: '2026-10' } },
        },
      }),
    );
  });
});

import type { PrismaService } from '../prisma/prisma.service.js';
import {
  linkedCategoryId,
  linkedShareCells,
  type ShareLink,
  sumLinkedShares,
} from './group-shares.js';

const link: ShareLink = {
  expenseCategoryId: 3,
  incomeCategoryId: 4,
  categoryLinks: [],
};
const share = (
  amountCents: number,
  kind: 'INCOME' | 'EXPENSE',
  month = '2026-10',
  member = link,
  categoryId: number | null = null,
) => ({ amountCents, member, transaction: { kind, month, categoryId } });

describe('group shares', () => {
  it('picks the linked category of the share’s kind', () => {
    expect(linkedCategoryId('EXPENSE', link)).toBe(3);
    expect(linkedCategoryId('INCOME', link)).toBe(4);
    expect(
      linkedCategoryId('INCOME', { ...link, incomeCategoryId: null }),
    ).toBeNull();
  });

  it('prefers the category mapped to the group category, else the default', () => {
    const mapped = {
      ...link,
      categoryLinks: [{ groupCategoryId: 20, categoryId: 9 }],
    };
    expect(linkedCategoryId('EXPENSE', mapped, 20)).toBe(9);
    expect(linkedCategoryId('EXPENSE', mapped, 21)).toBe(3);
    expect(linkedCategoryId('EXPENSE', mapped, null)).toBe(3);
    expect(
      linkedCategoryId('EXPENSE', { ...mapped, expenseCategoryId: null }, 20),
    ).toBe(9);
    expect(
      linkedCategoryId('EXPENSE', { ...mapped, expenseCategoryId: null }, 21),
    ).toBeNull();
  });

  it('splits shares by the mapped categories', () => {
    const mapped = {
      ...link,
      categoryLinks: [{ groupCategoryId: 20, categoryId: 9 }],
    };
    expect(
      sumLinkedShares([
        share(1500, 'EXPENSE', '2026-10', mapped, 20),
        share(400, 'EXPENSE', '2026-10', mapped, 21),
        share(100, 'EXPENSE', '2026-10', mapped),
      ]),
    ).toEqual([
      { categoryId: 9, month: '2026-10', amountCents: 1500 },
      { categoryId: 3, month: '2026-10', amountCents: 500 },
    ]);
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
              { categoryLinks: { some: {} } },
            ],
          },
          transaction: { month: { lt: '2026-10' } },
        },
      }),
    );
  });
});

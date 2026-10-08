import type { EntryKind, Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** A membership's link: default categories by kind plus per group category overrides. */
export interface ShareLink {
  expenseCategoryId: number | null;
  incomeCategoryId: number | null;
  categoryLinks: { groupCategoryId: number; categoryId: number }[];
}

/** A share of a group transaction that belongs to the user. */
export interface LinkedShareRow {
  amountCents: number;
  member: ShareLink;
  transaction: { kind: EntryKind; month: string; categoryId: number | null };
}

export interface ShareCell {
  categoryId: number;
  month: string;
  amountCents: number;
}

/**
 * The personal category a share lands in: the one mapped to its group
 * category, or else the member's default of its kind, or `null` (not counted).
 */
export function linkedCategoryId(
  kind: EntryKind,
  link: ShareLink,
  groupCategoryId: number | null = null,
): number | null {
  const mapped =
    groupCategoryId === null
      ? undefined
      : link.categoryLinks.find((l) => l.groupCategoryId === groupCategoryId);
  if (mapped) return mapped.categoryId;
  return kind === 'EXPENSE' ? link.expenseCategoryId : link.incomeCategoryId;
}

/** Adds the linked shares up per category and month; unlinked ones don't count. */
export function sumLinkedShares(rows: LinkedShareRow[]): ShareCell[] {
  const cells = new Map<string, ShareCell>();
  for (const { amountCents, member, transaction } of rows) {
    const categoryId = linkedCategoryId(
      transaction.kind,
      member,
      transaction.categoryId,
    );
    if (categoryId === null) continue;
    const key = `${categoryId}:${transaction.month}`;
    const cell = cells.get(key);
    if (cell) cell.amountCents += amountCents;
    else cells.set(key, { categoryId, month: transaction.month, amountCents });
  }
  return [...cells.values()];
}

/**
 * The user's shares of group transactions in the months, summed into the
 * personal categories they linked. Former memberships count too, so leaving a
 * group doesn't rewrite the user's past balance.
 */
export async function linkedShareCells(
  prisma: PrismaService,
  userId: number,
  month: Prisma.StringFilter,
): Promise<ShareCell[]> {
  const rows = await prisma.groupTransactionShare.findMany({
    where: {
      member: {
        userId,
        OR: [
          { expenseCategoryId: { not: null } },
          { incomeCategoryId: { not: null } },
          { categoryLinks: { some: {} } },
        ],
      },
      transaction: { month },
    },
    select: {
      amountCents: true,
      member: {
        select: {
          expenseCategoryId: true,
          incomeCategoryId: true,
          categoryLinks: {
            select: { groupCategoryId: true, categoryId: true },
          },
        },
      },
      transaction: { select: { kind: true, month: true, categoryId: true } },
    },
  });
  return sumLinkedShares(rows);
}

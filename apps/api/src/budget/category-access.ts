import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Db } from '../prisma/db.js';

/**
 * Ensures every category is the user's (404 otherwise, no existence leak) and
 * takes values: the category and its type are active (400 otherwise).
 */
export async function assertWritableCategories(
  prisma: Db,
  userId: number,
  categoryIds: number[],
): Promise<void> {
  const ids = [...new Set(categoryIds)];
  const owned = await prisma.category.findMany({
    where: { userId, id: { in: ids } },
    select: { active: true, group: { select: { active: true } } },
  });
  if (owned.length !== ids.length) {
    throw new NotFoundException('Category not found');
  }
  if (owned.some((c) => !c.active || !c.group.active)) {
    throw new BadRequestException('Category is inactive');
  }
}

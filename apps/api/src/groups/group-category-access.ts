import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Db } from '../prisma/db.js';
import type { EntryKind } from '../prisma/generated/client.js';

/**
 * Checks a category a group launch is about to use: it must be the group's
 * (404), of the launch's kind (400) and active (400), unless the launch
 * already uses it (`current`), so keeping a now inactive one is fine.
 */
export async function assertUsableGroupCategory(
  db: Db,
  groupId: number,
  categoryId: number,
  kind: EntryKind,
  current: number | null = null,
): Promise<void> {
  const category = await db.groupCategory.findFirst({
    where: { id: categoryId, groupId },
    select: { kind: true, active: true },
  });
  if (!category) throw new NotFoundException('Group category not found');
  if (category.kind !== kind) {
    throw new BadRequestException(
      'categoryId must be a category of the same kind',
    );
  }
  if (!category.active && categoryId !== current) {
    throw new BadRequestException('Group category is inactive');
  }
}

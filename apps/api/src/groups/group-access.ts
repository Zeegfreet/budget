import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { GroupMember } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * The user's active membership of the group. Anyone else (never a member, a
 * pending invitee, a former member) gets a 404, so the group's existence
 * doesn't leak.
 */
export async function assertMember(
  prisma: PrismaService,
  userId: number,
  groupId: number,
): Promise<GroupMember> {
  const member = await prisma.groupMember.findFirst({
    where: { groupId, userId, leftAt: null },
  });
  if (!member) throw new NotFoundException('Group not found');
  return member;
}

/** Like `assertMember`, and only the owner may go on (403 for other members). */
export async function assertOwner(
  prisma: PrismaService,
  userId: number,
  groupId: number,
): Promise<GroupMember> {
  const member = await assertMember(prisma, userId, groupId);
  if (member.role !== 'OWNER') {
    throw new ForbiddenException('Only the group owner can do this');
  }
  return member;
}

/** Active members of the group, oldest first. */
export function activeMembers(prisma: PrismaService, groupId: number) {
  return prisma.groupMember.findMany({
    where: { groupId, leftAt: null },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
  });
}

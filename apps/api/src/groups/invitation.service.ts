import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from '../user/user.service.js';
import type {
  GroupInvitationDto,
  ReceivedInvitationDto,
} from './dto/invitation.dto.js';
import { assertMember } from './group-access.js';

const userSelect = { id: true, name: true, email: true } as const;

const groupInvitationSelect = {
  id: true,
  createdAt: true,
  invitee: { select: userSelect },
  inviter: { select: userSelect },
} satisfies Prisma.GroupInvitationSelect;

const receivedInvitationSelect = {
  id: true,
  createdAt: true,
  group: { select: { id: true, name: true } },
  inviter: { select: userSelect },
} satisfies Prisma.GroupInvitationSelect;

/**
 * Invitations to join a group. Any active member invites a registered user by
 * e-mail; only the invitee can accept or decline, and access starts on accept.
 * A member may cancel the group's pending invitations.
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
  ) {}

  async listForGroup(
    userId: number,
    groupId: number,
  ): Promise<GroupInvitationDto[]> {
    await assertMember(this.prisma, userId, groupId);
    return this.prisma.groupInvitation.findMany({
      where: { groupId, status: 'PENDING' },
      orderBy: { id: 'asc' },
      select: groupInvitationSelect,
    });
  }

  async invite(
    userId: number,
    groupId: number,
    email: string,
  ): Promise<GroupInvitationDto> {
    await assertMember(this.prisma, userId, groupId);
    const invitee = await this.users.findPublicByEmail(email);
    if (!invitee) throw new NotFoundException('No user with this e-mail');
    if (invitee.id === userId) {
      throw new BadRequestException("You can't invite yourself");
    }
    const member = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: invitee.id, leftAt: null },
    });
    if (member) throw new ConflictException('Already a member');
    const pending = await this.prisma.groupInvitation.findFirst({
      where: { groupId, inviteeId: invitee.id, status: 'PENDING' },
    });
    if (pending) throw new ConflictException('Already invited');

    return this.prisma.groupInvitation.create({
      data: { groupId, inviterId: userId, inviteeId: invitee.id },
      select: groupInvitationSelect,
    });
  }

  async cancel(userId: number, groupId: number, id: number): Promise<void> {
    await assertMember(this.prisma, userId, groupId);
    const { count } = await this.prisma.groupInvitation.updateMany({
      where: { id, groupId, status: 'PENDING' },
      data: { status: 'CANCELED', respondedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Invitation not found');
  }

  async listReceived(userId: number): Promise<ReceivedInvitationDto[]> {
    return this.prisma.groupInvitation.findMany({
      where: { inviteeId: userId, status: 'PENDING' },
      orderBy: { id: 'asc' },
      select: receivedInvitationSelect,
    });
  }

  /** Joins the group (a former member gets the old membership back). */
  async accept(userId: number, id: number): Promise<void> {
    const invitation = await this.findReceived(userId, id);
    await this.prisma.$transaction([
      this.prisma.groupInvitation.update({
        where: { id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
      this.prisma.groupMember.upsert({
        where: {
          groupId_userId: { groupId: invitation.groupId, userId },
        },
        create: { groupId: invitation.groupId, userId },
        update: { leftAt: null, joinedAt: new Date(), role: 'MEMBER' },
      }),
    ]);
  }

  async decline(userId: number, id: number): Promise<void> {
    await this.findReceived(userId, id);
    await this.prisma.groupInvitation.update({
      where: { id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
  }

  /** A pending invitation to this user; anything else is a 404. */
  private async findReceived(userId: number, id: number) {
    const invitation = await this.prisma.groupInvitation.findFirst({
      where: { id, inviteeId: userId, status: 'PENDING' },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }
}

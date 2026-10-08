import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../prisma/errors.js';
import type { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from '../user/user.service.js';
import type {
  CreateInvitationDto,
  GroupInvitationDto,
  ReceivedInvitationDto,
} from './dto/invitation.dto.js';
import { assertMember } from './group-access.js';
import { includeInRules } from './membership.js';

const userSelect = { id: true, name: true, email: true } as const;

const groupInvitationSelect = {
  id: true,
  status: true,
  createdAt: true,
  invitee: { select: { ...userSelect, pending: true } },
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
 *
 * An e-mail without an account gets a pre-registration (a pending user named
 * with the given nickname) that joins the group right away, since nobody could
 * accept for it; signing up with that e-mail later takes the place over.
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
    { email, nickname }: CreateInvitationDto,
  ): Promise<GroupInvitationDto> {
    await assertMember(this.prisma, userId, groupId);
    const invitee =
      (await this.users.findPublicByEmail(email)) ??
      (await this.preRegister(email, nickname));
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

    const data = { groupId, inviterId: userId, inviteeId: invitee.id };
    if (!invitee.pending) {
      return this.prisma.groupInvitation.create({
        data,
        select: groupInvitationSelect,
      });
    }
    // A pre-registration can't accept, so it joins now (the invitation stays
    // as the record of who added it)
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.groupInvitation.create({
        data: { ...data, status: 'ACCEPTED', respondedAt: new Date() },
        select: groupInvitationSelect,
      });
      await this.join(tx, groupId, invitee.id);
      return invitation;
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
    await this.prisma.$transaction(async (tx) => {
      await tx.groupInvitation.update({
        where: { id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      await this.join(tx, invitation.groupId, userId);
    });
  }

  async decline(userId: number, id: number): Promise<void> {
    await this.findReceived(userId, id);
    await this.prisma.groupInvitation.update({
      where: { id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
  }

  /**
   * Active membership (a former member gets the old one back), then the
   * member enters the equal/weight rules and the pending transactions.
   */
  private async join(
    tx: Prisma.TransactionClient,
    groupId: number,
    userId: number,
  ) {
    const member = await tx.groupMember.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId },
      update: { leftAt: null, joinedAt: new Date(), role: 'MEMBER' },
    });
    await includeInRules(tx, groupId, member.id);
  }

  /** Pending user for an e-mail without an account (400 without a nickname). */
  private async preRegister(email: string, nickname: string | undefined) {
    if (!nickname) {
      throw new BadRequestException(
        'Nickname required for an unregistered e-mail',
      );
    }
    try {
      return {
        ...(await this.users.createPending(email, nickname)),
        pending: true,
      };
    } catch (error) {
      // Someone else registered the e-mail meanwhile
      if (!isUniqueViolation(error)) throw error;
      const user = await this.users.findPublicByEmail(email);
      if (!user) throw error;
      return user;
    }
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

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UserService } from '../user/user.service.js';
import { InvitationService } from './invitation.service.js';

describe('InvitationService', () => {
  const prisma = {
    $transaction: vi.fn(),
    groupMember: { findFirst: vi.fn(), upsert: vi.fn() },
    groupInvitation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const users = { findPublicByEmail: vi.fn() };
  const service = new InvitationService(
    prisma as unknown as PrismaService,
    users as unknown as UserService,
  );
  const me = { id: 1, groupId: 5, userId: 7, role: 'OWNER' };
  const bruno = { id: 8, name: 'Bruno', email: 'bruno@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    users.findPublicByEmail.mockResolvedValue(bruno);
  });

  describe('invite', () => {
    /** Whether the invitee (user 8) is already an active member */
    let inviteeIsMember = false;

    beforeEach(() => {
      inviteeIsMember = false;
      prisma.groupMember.findFirst.mockImplementation(
        ({ where }: { where: { userId: number } }) =>
          Promise.resolve(
            where.userId === 7 ? me : inviteeIsMember ? { id: 9 } : null,
          ),
      );
      prisma.groupInvitation.findFirst.mockResolvedValue(null);
    });

    it('creates a pending invitation for a registered user', async () => {
      prisma.groupInvitation.create.mockResolvedValue({ id: 3 });

      await expect(service.invite(7, 5, 'bruno@example.com')).resolves.toEqual({
        id: 3,
      });
      expect(prisma.groupInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { groupId: 5, inviterId: 7, inviteeId: 8 },
        }),
      );
    });

    it('rejects unknown e-mails and self', async () => {
      users.findPublicByEmail.mockResolvedValueOnce(null);
      await expect(service.invite(7, 5, 'x@example.com')).rejects.toThrow(
        NotFoundException,
      );

      users.findPublicByEmail.mockResolvedValueOnce({ ...bruno, id: 7 });
      await expect(service.invite(7, 5, 'ana@example.com')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects members and already invited users', async () => {
      prisma.groupInvitation.findFirst.mockResolvedValue({ id: 2 });
      await expect(service.invite(7, 5, 'bruno@example.com')).rejects.toThrow(
        new ConflictException('Already invited'),
      );

      inviteeIsMember = true;
      await expect(service.invite(7, 5, 'bruno@example.com')).rejects.toThrow(
        new ConflictException('Already a member'),
      );
      expect(prisma.groupInvitation.create).not.toHaveBeenCalled();
    });
  });

  it('cancels only a pending invitation of the group', async () => {
    prisma.groupMember.findFirst.mockResolvedValue(me);
    prisma.groupInvitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancel(7, 5, 3)).rejects.toThrow(NotFoundException);
    expect(prisma.groupInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 3, groupId: 5, status: 'PENDING' },
      data: { status: 'CANCELED', respondedAt: expect.any(Date) },
    });
  });

  it('lists the invitations the user received', async () => {
    prisma.groupInvitation.findMany.mockResolvedValue([]);
    await service.listReceived(8);
    expect(prisma.groupInvitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { inviteeId: 8, status: 'PENDING' } }),
    );
  });

  it('accepts by joining (or rejoining) the group', async () => {
    prisma.groupInvitation.findFirst.mockResolvedValue({ id: 3, groupId: 5 });

    await service.accept(8, 3);

    expect(prisma.groupInvitation.findFirst).toHaveBeenCalledWith({
      where: { id: 3, inviteeId: 8, status: 'PENDING' },
    });
    expect(prisma.groupMember.upsert).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: 5, userId: 8 } },
      create: { groupId: 5, userId: 8 },
      update: { leftAt: null, joinedAt: expect.any(Date), role: 'MEMBER' },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('returns 404 when the invitation is not the user’s pending one', async () => {
    prisma.groupInvitation.findFirst.mockResolvedValue(null);

    await expect(service.accept(9, 3)).rejects.toThrow(NotFoundException);
    await expect(service.decline(9, 3)).rejects.toThrow(NotFoundException);
    expect(prisma.groupInvitation.update).not.toHaveBeenCalled();
  });
});

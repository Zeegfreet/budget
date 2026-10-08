import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../prisma/generated/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UserService } from '../user/user.service.js';
import { InvitationService } from './invitation.service.js';
import { includeInRules } from './membership.js';

vi.mock('./membership.js', () => ({ includeInRules: vi.fn() }));

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
  const users = { findPublicByEmail: vi.fn(), createPending: vi.fn() };
  const service = new InvitationService(
    prisma as unknown as PrismaService,
    users as unknown as UserService,
  );
  const me = { id: 1, groupId: 5, userId: 7, role: 'OWNER' };
  const bruno = {
    id: 8,
    name: 'Bruno',
    email: 'bruno@example.com',
    pending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    users.findPublicByEmail.mockResolvedValue(bruno);
    // Interactive transactions run against the same mock
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    prisma.groupMember.upsert.mockResolvedValue({ id: 20 });
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

      await expect(
        service.invite(7, 5, { email: 'bruno@example.com' }),
      ).resolves.toEqual({
        id: 3,
      });
      expect(prisma.groupInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { groupId: 5, inviterId: 7, inviteeId: 8 },
        }),
      );
    });

    it('requires a nickname for an e-mail without account', async () => {
      users.findPublicByEmail.mockResolvedValueOnce(null);
      await expect(
        service.invite(7, 5, { email: 'x@example.com' }),
      ).rejects.toThrow(
        new BadRequestException('Nickname required for an unregistered e-mail'),
      );
      expect(users.createPending).not.toHaveBeenCalled();
    });

    it('pre-registers an unknown e-mail and adds it as a member', async () => {
      users.findPublicByEmail.mockResolvedValueOnce(null);
      users.createPending.mockResolvedValue({
        id: 9,
        name: 'Carla',
        email: 'carla@example.com',
      });
      prisma.groupInvitation.create.mockResolvedValue({
        id: 4,
        status: 'ACCEPTED',
      });

      await expect(
        service.invite(7, 5, { email: 'carla@example.com', nickname: 'Carla' }),
      ).resolves.toEqual({ id: 4, status: 'ACCEPTED' });
      expect(users.createPending).toHaveBeenCalledWith(
        'carla@example.com',
        'Carla',
      );
      expect(prisma.groupInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            groupId: 5,
            inviterId: 7,
            inviteeId: 9,
            status: 'ACCEPTED',
            respondedAt: expect.any(Date),
          },
        }),
      );
      expect(prisma.groupMember.upsert).toHaveBeenCalledWith({
        where: { groupId_userId: { groupId: 5, userId: 9 } },
        create: { groupId: 5, userId: 9 },
        update: { leftAt: null, joinedAt: expect.any(Date), role: 'MEMBER' },
      });
      expect(includeInRules).toHaveBeenCalledWith(prisma, 5, 20);
    });

    it('adds an existing pre-registration right away, keeping its name', async () => {
      users.findPublicByEmail.mockResolvedValueOnce({
        ...bruno,
        pending: true,
      });
      prisma.groupInvitation.create.mockResolvedValue({ id: 4 });

      await service.invite(7, 5, {
        email: 'bruno@example.com',
        nickname: 'Bru',
      });

      expect(users.createPending).not.toHaveBeenCalled();
      expect(prisma.groupMember.upsert).toHaveBeenCalled();
    });

    it('falls back to the user registered meanwhile', async () => {
      users.findPublicByEmail
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(bruno);
      users.createPending.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      prisma.groupInvitation.create.mockResolvedValue({ id: 3 });

      await expect(
        service.invite(7, 5, { email: 'bruno@example.com', nickname: 'Bru' }),
      ).resolves.toEqual({ id: 3 });
      expect(prisma.groupMember.upsert).not.toHaveBeenCalled();
    });

    it('rejects self', async () => {
      users.findPublicByEmail.mockResolvedValueOnce({ ...bruno, id: 7 });
      await expect(
        service.invite(7, 5, { email: 'ana@example.com' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects members and already invited users', async () => {
      prisma.groupInvitation.findFirst.mockResolvedValue({ id: 2 });
      await expect(
        service.invite(7, 5, { email: 'bruno@example.com' }),
      ).rejects.toThrow(new ConflictException('Already invited'));

      inviteeIsMember = true;
      await expect(
        service.invite(7, 5, { email: 'bruno@example.com' }),
      ).rejects.toThrow(new ConflictException('Already a member'));
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
    expect(prisma.groupInvitation.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'ACCEPTED', respondedAt: expect.any(Date) },
    });
    // The member enters the rules and the pending transactions
    expect(includeInRules).toHaveBeenCalledWith(prisma, 5, 20);
  });

  it('returns 404 when the invitation is not the user’s pending one', async () => {
    prisma.groupInvitation.findFirst.mockResolvedValue(null);

    await expect(service.accept(9, 3)).rejects.toThrow(NotFoundException);
    await expect(service.decline(9, 3)).rejects.toThrow(NotFoundException);
    expect(prisma.groupInvitation.update).not.toHaveBeenCalled();
  });
});

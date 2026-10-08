import { NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service.js';
import { authUserSelect } from '../user/user.service.js';
import { PasswordResetService } from './password-reset.service.js';

const now = new Date('2026-10-08T12:00:00Z');
const token = 'a'.repeat(43);
const hash = createHash('sha256').update(token).digest('hex');
const ana = { id: 1, email: 'ana@example.com', name: 'Ana' };

describe('PasswordResetService', () => {
  const prisma = {
    passwordResetToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    activationToken: { deleteMany: vi.fn() },
    user: { updateMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const service = new PasswordResetService(prisma as unknown as PrismaService, {
    ttlHours: 72,
    resetTtlMinutes: 60,
    webUrl: 'http://web.test',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
        : Promise.all(arg as unknown[]),
    );
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it('builds the link to the web', () => {
    expect(service.linkFor('abc')).toBe(
      'http://web.test/redefinir-senha?token=abc',
    );
    expect(service.ttlMinutes).toBe(60);
  });

  it('finds who asked by the normalized e-mail, pre-registrations included', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await service.findTarget(' ANA@example.com ');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ana@example.com' },
      select: { ...authUserSelect, pending: true },
    });
  });

  it('issues a hashed token that lasts 60 minutes and replaces the previous ones', async () => {
    const issued = await service.issue(1, now);

    expect(issued).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1 },
    });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        tokenHash: createHash('sha256').update(issued).digest('hex'),
        expiresAt: new Date('2026-10-08T13:00:00Z'),
      },
    });
  });

  describe('inspect', () => {
    it('finds the registered user of an unexpired link by its hash', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({ user: ana });

      await expect(service.inspect(token, now)).resolves.toEqual(ana);
      expect(prisma.passwordResetToken.findFirst).toHaveBeenCalledWith({
        where: {
          tokenHash: hash,
          expiresAt: { gt: now },
          user: { pending: false },
        },
        select: { user: { select: authUserSelect } },
      });
    });

    it.each([undefined, 42, 'short', `${token}!`])(
      'is null for a malformed token (%s) without a query',
      async (value) => {
        await expect(service.inspect(value)).resolves.toBeNull();
        expect(prisma.passwordResetToken.findFirst).not.toHaveBeenCalled();
      },
    );
  });

  describe('reset', () => {
    beforeEach(() => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({ user: ana });
    });

    it('uses the link, stores the hash, activates if needed and drops the other links', async () => {
      await expect(service.reset(token, 'new-hash', now)).resolves.toEqual(ana);

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { tokenHash: hash, expiresAt: { gt: now } },
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 1, pending: false },
        data: { passwordHash: 'new-hash' },
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 1, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(prisma.activationToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });

    it('is 404 for an unknown link', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(service.reset(token, 'new-hash', now)).rejects.toThrow(
        new NotFoundException('Invalid or expired password reset link'),
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('is 404 when the link was used meanwhile', async () => {
      prisma.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.reset(token, 'new-hash', now),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('revokes the pending links of a user', async () => {
    await service.revokeFor(1);

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1 },
    });
  });
});

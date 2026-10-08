import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service.js';
import { authUserSelect } from '../user/user.service.js';
import { ActivationService } from './activation.service.js';

const now = new Date('2026-10-08T12:00:00Z');
const token = 'a'.repeat(43);
const hash = createHash('sha256').update(token).digest('hex');
const ana = { id: 1, email: 'ana@example.com', name: 'Ana' };

describe('ActivationService', () => {
  const prisma = {
    activationToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    user: { updateMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  const service = new ActivationService(prisma as unknown as PrismaService, {
    ttlHours: 72,
    webUrl: 'http://web.test',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
        : Promise.all(arg as unknown[]),
    );
    prisma.activationToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it('builds the links to the web', () => {
    expect(service.linkFor('abc')).toBe(
      'http://web.test/ativar-conta?token=abc',
    );
    expect(service.webUrlFor('/grupos')).toBe('http://web.test/grupos');
  });

  it('issues a hashed token that replaces the previous ones', async () => {
    const issued = await service.issue(1, now);

    expect(issued).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.activationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1 },
    });
    expect(prisma.activationToken.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        tokenHash: createHash('sha256').update(issued).digest('hex'),
        expiresAt: new Date('2026-10-11T12:00:00Z'),
      },
    });
  });

  describe('inspect', () => {
    it('finds the user of an unexpired link by its hash', async () => {
      prisma.activationToken.findFirst.mockResolvedValue({
        user: { ...ana, pending: false },
      });

      await expect(service.inspect(token, now)).resolves.toEqual({
        ...ana,
        pending: false,
      });
      expect(prisma.activationToken.findFirst).toHaveBeenCalledWith({
        where: { tokenHash: hash, expiresAt: { gt: now } },
        select: { user: { select: { ...authUserSelect, pending: true } } },
      });
    });

    it.each([undefined, 42, 'short', `${token}!`])(
      'is null for a malformed token (%s) without a query',
      async (value) => {
        await expect(service.inspect(value)).resolves.toBeNull();
        expect(prisma.activationToken.findFirst).not.toHaveBeenCalled();
      },
    );
  });

  describe('activate', () => {
    it('uses the link and marks the e-mail verified', async () => {
      prisma.activationToken.findFirst.mockResolvedValue({
        user: { ...ana, pending: false },
      });

      await expect(service.activate(token, now)).resolves.toEqual(ana);
      expect(prisma.activationToken.deleteMany).toHaveBeenCalledWith({
        where: { tokenHash: hash, expiresAt: { gt: now } },
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { pending: false, id: 1 },
        data: { emailVerifiedAt: now },
      });
      expect(prisma.activationToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });

    it('is 404 for an unknown link', async () => {
      prisma.activationToken.findFirst.mockResolvedValue(null);

      await expect(service.activate(token, now)).rejects.toThrow(
        new NotFoundException('Invalid or expired activation link'),
      );
    });

    it('is 400 for a pre-registration', async () => {
      prisma.activationToken.findFirst.mockResolvedValue({
        user: { ...ana, pending: true },
      });

      await expect(service.activate(token, now)).rejects.toThrow(
        new BadRequestException('Sign-up data required'),
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('is 404 when the link was used meanwhile', async () => {
      prisma.activationToken.findFirst.mockResolvedValue({
        user: { ...ana, pending: false },
      });
      prisma.activationToken.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.activate(token, now)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('completeSignup', () => {
    const data = {
      name: 'Carla Lima',
      passwordHash: 'hash',
      birthDate: new Date('1990-05-20T00:00:00Z'),
      cep: '01001000',
      city: 'São Paulo',
      state: 'SP',
    };

    it('turns the pre-registration into an active account', async () => {
      prisma.activationToken.findFirst.mockResolvedValue({
        user: { ...ana, name: 'Carlinha', pending: true },
      });

      await expect(service.completeSignup(token, data, now)).resolves.toEqual({
        ...ana,
        name: 'Carla Lima',
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { pending: true, id: 1 },
        data: { ...data, pending: false, emailVerifiedAt: now },
      });
    });

    it('is 400 for an account that only needs activating', async () => {
      prisma.activationToken.findFirst.mockResolvedValue({
        user: { ...ana, pending: false },
      });

      await expect(service.completeSignup(token, data, now)).rejects.toThrow(
        new BadRequestException('Account already registered'),
      );
    });

    it('is 404 for an unknown link', async () => {
      prisma.activationToken.findFirst.mockResolvedValue(null);

      await expect(
        service.completeSignup(token, data, now),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('finds an account still to activate by its normalized e-mail', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await service.findUnactivated(' ANA@example.com ');

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'ana@example.com', emailVerifiedAt: null },
      select: { ...authUserSelect, pending: true },
    });
  });
});

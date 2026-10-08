import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthConfig } from './auth.config.js';
import {
  parseRefreshToken,
  ROTATION_GRACE_MS,
  SessionService,
} from './session.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const config: AuthConfig = {
  accessSecret: 'secret',
  accessTtlSeconds: 900,
  refreshTtlDays: 7,
  cookieSecure: false,
  refreshCookiePath: '/auth',
};

const SESSION_ID = '0b6b7c1e-6a0e-4f37-9a39-3e2b1c9d8a10';
const SECRET = 'A'.repeat(43);
const hash = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');
const now = new Date('2026-10-06T12:00:00Z');

describe('SessionService', () => {
  const prisma = {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const service = new SessionService(
    prisma as unknown as PrismaService,
    config,
  );

  const session = (overrides: Record<string, unknown> = {}) => ({
    id: SESSION_ID,
    userId: 1,
    tokenHash: hash(SECRET),
    previousTokenHash: null,
    rotatedAt: null,
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('create', () => {
    it('stores only the hash and returns <id>.<secret>', async () => {
      prisma.session.create.mockResolvedValue({ id: SESSION_ID });

      const token = await service.create(
        1,
        { userAgent: 'x'.repeat(300), ip: '::1' },
        now,
      );

      const parsed = parseRefreshToken(token);
      expect(parsed?.id).toBe(SESSION_ID);
      const { data } = prisma.session.create.mock.calls[0][0];
      expect(data).toEqual({
        userId: 1,
        tokenHash: hash(parsed!.secret),
        expiresAt: new Date('2026-10-13T12:00:00Z'),
        userAgent: 'x'.repeat(255),
        ip: '::1',
      });
      expect(JSON.stringify(data)).not.toContain(parsed!.secret);
    });
  });

  describe('rotate', () => {
    const token = `${SESSION_ID}.${SECRET}`;

    it('swaps the secret and slides the expiry', async () => {
      prisma.session.findUnique.mockResolvedValue(session());

      const result = await service.rotate(token, now);

      expect(result.userId).toBe(1);
      const next = parseRefreshToken(result.refreshToken)!;
      expect(next.id).toBe(SESSION_ID);
      expect(next.secret).not.toBe(SECRET);
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: SESSION_ID, tokenHash: hash(SECRET), revokedAt: null },
        data: {
          tokenHash: hash(next.secret),
          previousTokenHash: hash(SECRET),
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt: new Date('2026-10-13T12:00:00Z'),
        },
      });
    });

    it.each([undefined, '', 'garbage', `${SESSION_ID}.short`, 42])(
      'rejects the malformed token %s without a query',
      async (bad) => {
        await expect(service.rotate(bad, now)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
        expect(prisma.session.findUnique).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['unknown', null],
      ['revoked', session({ revokedAt: now })],
      ['expired', session({ expiresAt: now })],
    ])('rejects a %s session', async (_label, found) => {
      prisma.session.findUnique.mockResolvedValue(found);

      await expect(service.rotate(token, now)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('revokes the session when an outdated secret is presented', async () => {
      prisma.session.findUnique.mockResolvedValue(
        session({ tokenHash: hash('B'.repeat(43)) }),
      );

      await expect(service.rotate(token, now)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: SESSION_ID, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    it('tolerates the previous secret within the grace window', async () => {
      prisma.session.findUnique.mockResolvedValue(
        session({
          tokenHash: hash('B'.repeat(43)),
          previousTokenHash: hash(SECRET),
          rotatedAt: new Date(now.getTime() - ROTATION_GRACE_MS + 1000),
        }),
      );

      await expect(service.rotate(token, now)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('treats the previous secret as theft after the grace window', async () => {
      prisma.session.findUnique.mockResolvedValue(
        session({
          tokenHash: hash('B'.repeat(43)),
          previousTokenHash: hash(SECRET),
          rotatedAt: new Date(now.getTime() - ROTATION_GRACE_MS),
        }),
      );

      await expect(service.rotate(token, now)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: now } }),
      );
    });

    it('fails when a concurrent rotation already won', async () => {
      prisma.session.findUnique.mockResolvedValue(session());
      prisma.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.rotate(token, now)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('revoke', () => {
    it('revokes only when the secret matches', async () => {
      await service.revoke(`${SESSION_ID}.${SECRET}`, now);

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: SESSION_ID, tokenHash: hash(SECRET), revokedAt: null },
        data: { revokedAt: now },
      });
    });

    it('ignores malformed tokens', async () => {
      await service.revoke('garbage', now);

      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });
  describe('revokeAllForUser', () => {
    it('revokes every open session of the user', async () => {
      await service.revokeAllForUser(1, now);

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  });
});

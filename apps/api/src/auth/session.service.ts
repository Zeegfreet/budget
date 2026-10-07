import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AUTH_CONFIG, type AuthConfig } from './auth.config.js';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface RotatedSession {
  userId: number;
  refreshToken: string;
}

/** How long the previous refresh token is tolerated after a rotation. */
export const ROTATION_GRACE_MS = 30_000;

const DAY_MS = 24 * 60 * 60 * 1000;

const hashSecret = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');

function sameHash(a: string | null, b: string) {
  if (!a) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Refresh tokens are `<sessionId>.<secret>`; only the secret's hash is stored. */
export function parseRefreshToken(token: unknown) {
  if (typeof token !== 'string') return undefined;
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
  return match ? { id: match[1], secret: match[2] } : undefined;
}

const invalidToken = () => new UnauthorizedException('Invalid refresh token');

/**
 * The only stateful part of auth: refresh-token sessions. Each refresh rotates
 * the secret; presenting an older secret is treated as token theft and
 * revokes the whole session.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /** Opens a session and returns its refresh token. */
  async create(
    userId: number,
    meta: SessionMeta = {},
    now = new Date(),
  ): Promise<string> {
    const secret = this.newSecret();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashSecret(secret),
        expiresAt: this.expiresAt(now),
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
      },
      select: { id: true },
    });
    return `${session.id}.${secret}`;
  }

  /** Validates a refresh token and swaps it for a new one. */
  async rotate(token: unknown, now = new Date()): Promise<RotatedSession> {
    const parsed = parseRefreshToken(token);
    if (!parsed) throw invalidToken();

    const session = await this.prisma.session.findUnique({
      where: { id: parsed.id },
    });
    if (!session || session.revokedAt || session.expiresAt <= now)
      throw invalidToken();

    const presented = hashSecret(parsed.secret);
    if (!sameHash(session.tokenHash, presented)) {
      const benignRace =
        sameHash(session.previousTokenHash, presented) &&
        session.rotatedAt !== null &&
        now.getTime() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
      if (!benignRace) await this.revokeById(session.id, now);
      throw invalidToken();
    }

    const secret = this.newSecret();
    // Conditional update: of two concurrent rotations with the same token, only one wins.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
      data: {
        tokenHash: hashSecret(secret),
        previousTokenHash: session.tokenHash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: this.expiresAt(now),
      },
    });
    if (count === 0) throw invalidToken();

    return { userId: session.userId, refreshToken: `${session.id}.${secret}` };
  }

  /** Ends the session the token belongs to. Invalid tokens are ignored. */
  async revoke(token: unknown, now = new Date()): Promise<void> {
    const parsed = parseRefreshToken(token);
    if (!parsed) return;
    await this.prisma.session.updateMany({
      where: {
        id: parsed.id,
        tokenHash: hashSecret(parsed.secret),
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
  }

  private async revokeById(id: string, now: Date) {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private newSecret() {
    return randomBytes(32).toString('base64url');
  }

  private expiresAt(now: Date) {
    return new Date(now.getTime() + this.config.refreshTtlDays * DAY_MS);
  }
}

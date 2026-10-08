import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AuthUser, authUserSelect } from '../user/user.service.js';
import {
  ACTIVATION_CONFIG,
  type ActivationConfig,
} from './activation.config.js';
import type { ActivationTarget } from './activation.service.js';
import { hashToken, isTokenShaped, newToken } from './token.js';

const MINUTE_MS = 60 * 1000;

export const invalidPasswordResetLink = () =>
  new NotFoundException('Invalid or expired password reset link');

/**
 * One-time links that set a new password. Like the activation links, only the
 * SHA-256 of the secret is stored; issuing a new link for a user replaces the
 * previous ones, and setting the password deletes them all.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACTIVATION_CONFIG) private readonly config: ActivationConfig,
  ) {}

  get ttlMinutes() {
    return this.config.resetTtlMinutes;
  }

  /** Web page the link opens. */
  linkFor(token: string) {
    return `${this.config.webUrl}/redefinir-senha?${new URLSearchParams({ token })}`;
  }

  /** Who asked for a link (a pre-registration included); `null` if unknown. */
  findTarget(email: string): Promise<ActivationTarget | null> {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { ...authUserSelect, pending: true },
    });
  }

  /** New link for the user (the older ones stop working); returns the secret. */
  async issue(userId: number, now = new Date()): Promise<string> {
    const token = newToken();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(
            now.getTime() + this.config.resetTtlMinutes * MINUTE_MS,
          ),
        },
      }),
    ]);
    return token;
  }

  /** The user of a valid, unexpired link; `null` otherwise. */
  async inspect(token: unknown, now = new Date()): Promise<AuthUser | null> {
    if (!isTokenShaped(token)) return null;
    const row = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        expiresAt: { gt: now },
        user: { pending: false },
      },
      select: { user: { select: authUserSelect } },
    });
    return row?.user ?? null;
  }

  /**
   * Uses the link: stores the new password hash and, since the link proves
   * the e-mail, activates an account that wasn't yet (dropping its activation
   * links). All or nothing; an
   * invalid, expired or already used link is a 404.
   */
  async reset(
    token: unknown,
    passwordHash: string,
    now = new Date(),
  ): Promise<AuthUser> {
    const target = await this.inspect(token, now);
    if (!target) throw invalidPasswordResetLink();
    await this.prisma.$transaction(async (tx) => {
      const used = await tx.passwordResetToken.deleteMany({
        where: {
          tokenHash: hashToken(token as string),
          expiresAt: { gt: now },
        },
      });
      const { count } = await tx.user.updateMany({
        where: { id: target.id, pending: false },
        data: { passwordHash },
      });
      if (used.count === 0 || count === 0) throw invalidPasswordResetLink();
      await tx.user.updateMany({
        where: { id: target.id, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: target.id } });
      // The account is active now: an old activation link has nothing to do
      await tx.activationToken.deleteMany({ where: { userId: target.id } });
    });
    return target;
  }

  /** Drops the user's pending links (e.g. after a password change). */
  async revokeFor(userId: number): Promise<void> {
    await this.prisma.passwordResetToken.deleteMany({ where: { userId } });
  }
}

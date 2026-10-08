import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AuthUser, authUserSelect } from '../user/user.service.js';
import {
  ACTIVATION_CONFIG,
  type ActivationConfig,
} from './activation.config.js';
import { hashToken, isTokenShaped, newToken } from './token.js';

const HOUR_MS = 60 * 60 * 1000;

/** Who an activation link belongs to. */
export interface ActivationTarget extends AuthUser {
  /** A pre-registration: activating means finishing the sign-up */
  pending: boolean;
}

/** Sign-up data that turns a pre-registration into an active account. */
export interface CompleteSignupData {
  name: string;
  passwordHash: string;
  birthDate: Date;
  cep: string;
  city: string;
  state: string;
}

export const invalidActivationLink = () =>
  new NotFoundException('Invalid or expired activation link');

/**
 * One-time activation links. Only the SHA-256 of the secret is stored; issuing
 * a new link for a user replaces the previous ones, and using it deletes it.
 */
@Injectable()
export class ActivationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACTIVATION_CONFIG) private readonly config: ActivationConfig,
  ) {}

  get ttlHours() {
    return this.config.ttlHours;
  }

  /** Absolute URL of a web page, for e-mail links. */
  webUrlFor(path: string) {
    return `${this.config.webUrl}${path}`;
  }

  /** Web page the link opens. */
  linkFor(token: string) {
    return this.webUrlFor(`/ativar-conta?${new URLSearchParams({ token })}`);
  }

  /** New link for the user (the older ones stop working); returns the secret. */
  async issue(userId: number, now = new Date()): Promise<string> {
    const token = newToken();
    await this.prisma.$transaction([
      this.prisma.activationToken.deleteMany({ where: { userId } }),
      this.prisma.activationToken.create({
        data: {
          userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + this.config.ttlHours * HOUR_MS),
        },
      }),
    ]);
    return token;
  }

  /** The user of a valid, unexpired link; `null` otherwise. */
  async inspect(
    token: unknown,
    now = new Date(),
  ): Promise<ActivationTarget | null> {
    if (!isTokenShaped(token)) return null;
    const row = await this.prisma.activationToken.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: now } },
      select: { user: { select: { ...authUserSelect, pending: true } } },
    });
    return row?.user ?? null;
  }

  /**
   * Activates an account created by a sign-up. 404 for an invalid link, 400
   * for a pre-registration's link (it needs the sign-up data).
   */
  async activate(token: unknown, now = new Date()): Promise<AuthUser> {
    const target = await this.inspect(token, now);
    if (!target) throw invalidActivationLink();
    if (target.pending) {
      throw new BadRequestException('Sign-up data required');
    }
    return this.useLink(token as string, target, now, {
      where: { pending: false },
      data: {},
    });
  }

  /**
   * Turns a pre-registration into an active account with the sign-up data
   * (same id, so groups and shares stay). 404 for an invalid link, 400 for a
   * link of an account that only needs activating.
   */
  async completeSignup(
    token: unknown,
    data: CompleteSignupData,
    now = new Date(),
  ): Promise<AuthUser> {
    const target = await this.inspect(token, now);
    if (!target) throw invalidActivationLink();
    if (!target.pending) {
      throw new BadRequestException('Account already registered');
    }
    const user = await this.useLink(token as string, target, now, {
      where: { pending: true },
      data: { ...data, pending: false },
    });
    return { ...user, name: data.name };
  }

  /**
   * Account (registered or pre-registered) that still needs activating, to
   * send its link again; `null` for an unknown or active one.
   */
  findUnactivated(email: string): Promise<ActivationTarget | null> {
    return this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), emailVerifiedAt: null },
      select: { ...authUserSelect, pending: true },
    });
  }

  /**
   * Deletes the link and marks the e-mail as verified (plus `update`), all or
   * nothing; a link used meanwhile (or a user that changed) is a 404.
   */
  private async useLink(
    token: string,
    target: ActivationTarget,
    now: Date,
    update: {
      where: Prisma.UserWhereInput;
      data: Prisma.UserUpdateManyMutationInput;
    },
  ): Promise<AuthUser> {
    await this.prisma.$transaction(async (tx) => {
      const used = await tx.activationToken.deleteMany({
        where: { tokenHash: hashToken(token), expiresAt: { gt: now } },
      });
      const { count } = await tx.user.updateMany({
        where: { ...update.where, id: target.id },
        data: { ...update.data, emailVerifiedAt: now },
      });
      if (used.count === 0 || count === 0) throw invalidActivationLink();
      await tx.activationToken.deleteMany({ where: { userId: target.id } });
    });
    return { id: target.id, email: target.email, name: target.name };
  }
}

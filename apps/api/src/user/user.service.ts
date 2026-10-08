import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma, User } from '../prisma/generated/client.js';

/** Public view of a user: never includes the password hash or other private fields. */
export type AuthUser = Pick<User, 'id' | 'email' | 'name'>;

export const authUserSelect = {
  id: true,
  email: true,
  name: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws Prisma `P2002` when the e-mail is already registered. */
  async create(data: Prisma.UserCreateInput): Promise<AuthUser> {
    return this.prisma.user.create({ data, select: authUserSelect });
  }

  /** Full record, including the password hash. Only for credential checks. */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Public view by e-mail (normalized like at sign-up), e.g. to invite
   * someone; `pending` tells a pre-registration apart.
   */
  async findPublicByEmail(
    email: string,
  ): Promise<(AuthUser & Pick<User, 'pending'>) | null> {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { ...authUserSelect, pending: true },
    });
  }

  /**
   * Pre-registers someone invited to a group before having an account: just
   * the e-mail and a nickname, no password. Throws Prisma `P2002` when the
   * e-mail is already taken.
   */
  async createPending(email: string, name: string): Promise<AuthUser> {
    return this.prisma.user.create({
      data: { email: email.trim().toLowerCase(), name, pending: true },
      select: authUserSelect,
    });
  }

  /**
   * Completes the pre-registration of this e-mail with the sign-up data,
   * keeping its id (and so its group memberships). `null` when there is no
   * pre-registration (the e-mail is free or already registered).
   */
  async claimPending(
    email: string,
    data: Omit<Prisma.UserUpdateManyMutationInput, 'email' | 'pending'>,
  ): Promise<AuthUser | null> {
    const { count } = await this.prisma.user.updateMany({
      where: { email, pending: true },
      data: { ...data, pending: false },
    });
    if (count === 0) return null;
    return this.prisma.user.findUnique({
      where: { email },
      select: authUserSelect,
    });
  }

  async findById(id: number): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: authUserSelect,
    });
  }
}

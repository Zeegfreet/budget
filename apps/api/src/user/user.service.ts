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

/**
 * The signed-in user as the auth endpoints return it: the public view plus
 * what the web needs to route them (finish the sign-up, hide the password form).
 */
export interface SessionUser extends AuthUser {
  /** Created by GitHub/Google sign-in and still without birth date/address */
  needsProfile: boolean;
  /** `false` for an account that only signs in with GitHub/Google */
  hasPassword: boolean;
}

/** Sign-up data the user can see and edit (`/users/me`); dates as `YYYY-MM-DD`. */
export interface Profile extends AuthUser {
  birthDate: string;
  cep: string;
  city: string;
  state: string;
}

export interface ProfileChanges {
  name?: string;
  /** `YYYY-MM-DD` */
  birthDate?: string;
  cep?: string;
  city?: string;
  state?: string;
}

export const profileSelect = {
  ...authUserSelect,
  birthDate: true,
  cep: true,
  city: true,
  state: true,
} satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

/** Only a registered user (never a pre-registration) has these fields set. */
export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    birthDate: row.birthDate?.toISOString().slice(0, 10) ?? '',
    cep: row.cep ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
  };
}

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
   * Takes over a not yet activated account of this e-mail with the sign-up
   * data: a pre-registration or a sign-up nobody activated (whoever owns the
   * inbox activates it later). Keeps the id, and so the group memberships.
   * `null` when there is no such account (the e-mail is free or active).
   */
  async claimUnverified(
    email: string,
    data: Omit<
      Prisma.UserUpdateManyMutationInput,
      'email' | 'pending' | 'emailVerifiedAt'
    >,
  ): Promise<AuthUser | null> {
    const { count } = await this.prisma.user.updateMany({
      where: { email, emailVerifiedAt: null },
      data: { ...data, pending: false },
    });
    if (count === 0) return null;
    return this.prisma.user.findUnique({
      where: { email },
      select: authUserSelect,
    });
  }

  /** `null` for an unknown id or a pre-registration (which can't sign in). */
  async findSessionUser(id: number): Promise<SessionUser | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, pending: false },
      select: { ...authUserSelect, birthDate: true, passwordHash: true },
    });
    if (!row) return null;
    const { birthDate, passwordHash, ...user } = row;
    return {
      ...user,
      needsProfile: birthDate === null,
      hasPassword: passwordHash !== null,
    };
  }

  /**
   * Public view plus the password hash, only to check the current password.
   * `null` for an unknown id or a pre-registration (which has no password).
   */
  async findCredentialsById(
    id: number,
  ): Promise<(AuthUser & { passwordHash: string }) | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, pending: false },
      select: { ...authUserSelect, passwordHash: true },
    });
    if (!row?.passwordHash) return null;
    return { ...row, passwordHash: row.passwordHash };
  }

  /** Replaces the password hash of a registered user; `false` if none matched. */
  async updatePasswordHash(id: number, passwordHash: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id, pending: false },
      data: { passwordHash },
    });
    return count > 0;
  }

  /** The user's profile; `null` for an unknown id or a pre-registration. */
  async findProfile(id: number): Promise<Profile | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, pending: false },
      select: profileSelect,
    });
    return row && toProfile(row);
  }

  /**
   * Updates the given fields of the user's profile (the e-mail never changes).
   * `null` for an unknown id or a pre-registration.
   */
  async updateProfile(
    id: number,
    { birthDate, ...changes }: ProfileChanges,
  ): Promise<Profile | null> {
    const data: Prisma.UserUpdateManyMutationInput = {
      ...changes,
      ...(birthDate && { birthDate: new Date(`${birthDate}T00:00:00.000Z`) }),
    };
    // An empty update matches no row in SQLite: just read the profile
    if (Object.values(data).every((value) => value === undefined)) {
      return this.findProfile(id);
    }
    const { count } = await this.prisma.user.updateMany({
      where: { id, pending: false },
      data,
    });
    if (count === 0) return null;
    return this.findProfile(id);
  }
}

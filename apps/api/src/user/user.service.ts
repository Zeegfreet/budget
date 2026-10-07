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

  async findById(id: number): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: authUserSelect,
    });
  }
}

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Prisma } from '../prisma/generated/client.js';
import { type AuthUser, UserService } from '../user/user.service.js';
import type { AuthTokens } from './auth.cookies.js';
import type { RegisterDto } from './dto/register.dto.js';
import { MAX_PASSWORD_LENGTH } from './dto/register.dto.js';
import type { AccessTokenPayload } from './strategies/jwt.strategy.js';
import { type SessionMeta, SessionService } from './session.service.js';

export interface AuthResult {
  user: AuthUser;
  tokens: AuthTokens;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class AuthService {
  /** Verified when the e-mail is unknown, so both failures take the same time. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly users: UserService,
    private readonly sessions: SessionService,
    private readonly jwt: JwtService,
  ) {}

  async register(
    dto: RegisterDto,
    meta: SessionMeta = {},
  ): Promise<AuthResult> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    let user: AuthUser;
    try {
      user = await this.users.create({
        name: dto.name,
        email: normalizeEmail(dto.email),
        passwordHash,
        birthDate: new Date(`${dto.birthDate}T00:00:00.000Z`),
        cep: dto.cep,
        city: dto.city,
        state: dto.state,
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('E-mail already registered');
      throw error;
    }
    return this.signIn(user, meta);
  }

  /** Returns the user for valid credentials, `null` otherwise (whatever the reason). */
  async validateCredentials(
    email: unknown,
    password: unknown,
  ): Promise<AuthUser | null> {
    if (typeof email !== 'string' || typeof password !== 'string') return null;
    if (password.length > MAX_PASSWORD_LENGTH) return null;

    const user = await this.users.findByEmail(normalizeEmail(email));
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, password).catch(() => false);
    if (!user || !valid) return null;
    return { id: user.id, email: user.email, name: user.name };
  }

  /** Issues a new access token and opens a refresh session. */
  async signIn(user: AuthUser, meta: SessionMeta = {}): Promise<AuthResult> {
    const accessToken = await this.signAccessToken(user.id);
    const refreshToken = await this.sessions.create(user.id, meta);
    return { user, tokens: { accessToken, refreshToken } };
  }

  async refresh(refreshToken: unknown): Promise<AuthResult> {
    const session = await this.sessions.rotate(refreshToken);
    const user = await this.users.findById(session.userId);
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    const accessToken = await this.signAccessToken(user.id);
    return {
      user,
      tokens: { accessToken, refreshToken: session.refreshToken },
    };
  }

  async me(userId: number): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  logout(refreshToken: unknown) {
    return this.sessions.revoke(refreshToken);
  }

  private signAccessToken(userId: number) {
    const payload: AccessTokenPayload = { sub: userId };
    return this.jwt.signAsync(payload);
  }

  private getDummyHash() {
    this.dummyHash ??= argon2.hash('budget-dummy-password', {
      type: argon2.argon2id,
    });
    return this.dummyHash;
  }
}

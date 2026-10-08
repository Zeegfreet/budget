import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AccountMailer } from '../activation/account-mailer.js';
import {
  ActivationService,
  invalidActivationLink,
} from '../activation/activation.service.js';
import { isUniqueViolation } from '../prisma/errors.js';
import {
  type AuthUser,
  type SessionUser,
  UserService,
} from '../user/user.service.js';
import type { AuthTokens } from './auth.cookies.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type {
  ActivationInfoDto,
  CompleteSignupDto,
} from './dto/activation.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { MAX_PASSWORD_LENGTH } from './dto/register.dto.js';
import type { AccessTokenPayload } from './strategies/jwt.strategy.js';
import { type SessionMeta, SessionService } from './session.service.js';

export interface AuthResult {
  user: SessionUser;
  tokens: AuthTokens;
}

export interface RegisterResult {
  /** Where the activation link was sent */
  email: string;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** `YYYY-MM-DD` → midnight UTC, how birth dates are stored. */
const toBirthDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

@Injectable()
export class AuthService {
  /** Verified when the e-mail is unknown, so both failures take the same time. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly users: UserService,
    private readonly sessions: SessionService,
    private readonly jwt: JwtService,
    private readonly activation: ActivationService,
    private readonly mailer: AccountMailer,
  ) {}

  /**
   * Creates the account not activated (no session) and e-mails the
   * activation link. An e-mail whose account was never activated (a
   * pre-registration or an earlier sign-up) is taken over: same id, new data,
   * new link. 409 only for an active account.
   */
  async register(dto: RegisterDto): Promise<RegisterResult> {
    const email = normalizeEmail(dto.email);
    const profile = {
      name: dto.name,
      passwordHash: await this.hashPassword(dto.password),
      birthDate: toBirthDate(dto.birthDate),
      cep: dto.cep,
      city: dto.city,
      state: dto.state,
    };
    let user: AuthUser | null;
    try {
      user = await this.users.create({ email, ...profile });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      user = await this.users.claimUnverified(email, profile);
      if (!user) throw new ConflictException('E-mail already registered');
    }
    await this.mailer.sendActivation(user);
    return { email };
  }

  /** What a link is for, so the web shows the right form; 404 if invalid. */
  async activationInfo(token: string): Promise<ActivationInfoDto> {
    const target = await this.activation.inspect(token);
    if (!target) throw invalidActivationLink();
    return {
      email: target.email,
      name: target.name,
      kind: target.pending ? 'COMPLETE_SIGNUP' : 'ACTIVATE',
    };
  }

  /** Activates a signed-up account through its e-mail link and signs it in. */
  async activate(token: string, meta: SessionMeta = {}): Promise<AuthResult> {
    const user = await this.activation.activate(token);
    return this.signIn(user, meta);
  }

  /**
   * Finishes a pre-registration through its e-mail link (the link proves the
   * e-mail, so the account starts active) and signs it in.
   */
  async completeSignup(
    { token, password, birthDate, ...profile }: CompleteSignupDto,
    meta: SessionMeta = {},
  ): Promise<AuthResult> {
    const user = await this.activation.completeSignup(token, {
      ...profile,
      passwordHash: await this.hashPassword(password),
      birthDate: toBirthDate(birthDate),
    });
    return this.signIn(user, meta);
  }

  /** E-mails the link again; silent for unknown or active e-mails. */
  resendActivation(email: string): Promise<void> {
    return this.mailer.resend(normalizeEmail(email));
  }

  /**
   * Returns the user for valid credentials, `null` otherwise (whatever the
   * reason); 403 when they are right but the account is not activated yet.
   */
  async validateCredentials(
    email: unknown,
    password: unknown,
  ): Promise<AuthUser | null> {
    if (typeof email !== 'string' || typeof password !== 'string') return null;
    if (password.length > MAX_PASSWORD_LENGTH) return null;

    const user = await this.users.findByEmail(normalizeEmail(email));
    // A pre-registration has no password and can't sign in
    const usable = user && !user.pending ? user.passwordHash : null;
    const hash = usable ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, password).catch(() => false);
    if (!user || !usable || !valid) return null;
    // Only with the right password, so it doesn't reveal the e-mail exists;
    // 403 (not 401) so the web doesn't take it for an expired session
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Account not activated');
    }
    return { id: user.id, email: user.email, name: user.name };
  }

  /**
   * Checks the current password, stores the new one and ends every session
   * of the user (other devices must sign in again), then opens a new one for
   * this client. 403 (not 401, which the web treats as an expired session)
   * on a wrong current password.
   */
  async changePassword(
    userId: number,
    { currentPassword, newPassword }: ChangePasswordDto,
    meta: SessionMeta = {},
  ): Promise<AuthResult> {
    const user = await this.users.findCredentialsById(userId);
    if (!user) throw new NotFoundException('User not found');
    const valid = await argon2
      .verify(user.passwordHash, currentPassword)
      .catch(() => false);
    if (!valid) throw new ForbiddenException('Current password is incorrect');
    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'New password must differ from the current one',
      );
    }

    const passwordHash = await this.hashPassword(newPassword);
    if (!(await this.users.updatePasswordHash(userId, passwordHash))) {
      throw new NotFoundException('User not found');
    }
    await this.sessions.revokeAllForUser(userId);
    return this.signIn(
      { id: user.id, email: user.email, name: user.name },
      meta,
    );
  }

  /** Issues a new access token and opens a refresh session. */
  async signIn(user: AuthUser, meta: SessionMeta = {}): Promise<AuthResult> {
    const sessionUser = await this.users.findSessionUser(user.id);
    if (!sessionUser) throw new UnauthorizedException();
    const accessToken = await this.signAccessToken(user.id);
    const refreshToken = await this.sessions.create(user.id, meta);
    return { user: sessionUser, tokens: { accessToken, refreshToken } };
  }

  async refresh(refreshToken: unknown): Promise<AuthResult> {
    const session = await this.sessions.rotate(refreshToken);
    const user = await this.users.findSessionUser(session.userId);
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    const accessToken = await this.signAccessToken(user.id);
    return {
      user,
      tokens: { accessToken, refreshToken: session.refreshToken },
    };
  }

  async me(userId: number): Promise<SessionUser> {
    const user = await this.users.findSessionUser(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  logout(refreshToken: unknown) {
    return this.sessions.revoke(refreshToken);
  }

  private hashPassword(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
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

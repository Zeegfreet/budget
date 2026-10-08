import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { AccountMailer } from '../activation/account-mailer.js';
import type { ActivationService } from '../activation/activation.service.js';
import type { PasswordResetService } from '../activation/password-reset.service.js';
import { Prisma } from '../prisma/generated/client.js';
import type { UserService } from '../user/user.service.js';
import { AuthService } from './auth.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { SessionService } from './session.service.js';

const dto: RegisterDto = {
  name: 'Ana Souza',
  email: 'ana@example.com',
  password: 'segredo123',
  birthDate: '1990-05-20',
  cep: '01001000',
  city: 'São Paulo',
  state: 'SP',
};
const authUser = { id: 1, email: 'ana@example.com', name: 'Ana Souza' };
const sessionUser = { ...authUser, needsProfile: false, hasPassword: true };

describe('AuthService', () => {
  const users = {
    create: vi.fn(),
    claimUnverified: vi.fn(),
    findByEmail: vi.fn(),
    findSessionUser: vi.fn(),
    findCredentialsById: vi.fn(),
    updatePasswordHash: vi.fn(),
  };
  const sessions = {
    create: vi.fn(),
    rotate: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
  };
  const jwt = { signAsync: vi.fn() };
  const activation = {
    inspect: vi.fn(),
    activate: vi.fn(),
    completeSignup: vi.fn(),
  };
  const mailer = {
    sendActivation: vi.fn(),
    resend: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendPasswordChanged: vi.fn(),
  };
  const passwordReset = {
    inspect: vi.fn(),
    reset: vi.fn(),
    revokeFor: vi.fn(),
  };
  const service = new AuthService(
    users as unknown as UserService,
    sessions as unknown as SessionService,
    jwt as unknown as JwtService,
    activation as unknown as ActivationService,
    mailer as unknown as AccountMailer,
    passwordReset as unknown as PasswordResetService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    jwt.signAsync.mockResolvedValue('access');
    sessions.create.mockResolvedValue('refresh');
    users.findSessionUser.mockResolvedValue(sessionUser);
  });

  describe('register', () => {
    it('hashes the password, creates the user and e-mails the link, without a session', async () => {
      users.create.mockResolvedValue(authUser);

      await expect(service.register(dto)).resolves.toEqual({
        email: 'ana@example.com',
      });

      const data = users.create.mock.calls[0][0];
      expect(data).toMatchObject({
        name: 'Ana Souza',
        email: 'ana@example.com',
        birthDate: new Date('1990-05-20T00:00:00.000Z'),
        cep: '01001000',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(data).not.toHaveProperty('password');
      expect(data).not.toHaveProperty('emailVerifiedAt');
      await expect(
        argon2.verify(data.passwordHash, 'segredo123'),
      ).resolves.toBe(true);
      expect(mailer.sendActivation).toHaveBeenCalledWith(authUser);
      expect(sessions.create).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    const duplicate = () =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });

    it('maps a duplicate e-mail to 409', async () => {
      users.create.mockRejectedValue(duplicate());
      users.claimUnverified.mockResolvedValue(null);

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mailer.sendActivation).not.toHaveBeenCalled();
    });

    it('takes over an account of the e-mail not yet activated', async () => {
      users.create.mockRejectedValue(duplicate());
      users.claimUnverified.mockResolvedValue(authUser);

      await expect(service.register(dto)).resolves.toEqual({
        email: 'ana@example.com',
      });
      const [email, data] = users.claimUnverified.mock.calls[0];
      expect(email).toBe('ana@example.com');
      expect(data).toMatchObject({
        name: 'Ana Souza',
        birthDate: new Date('1990-05-20T00:00:00.000Z'),
        cep: '01001000',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(data).not.toHaveProperty('email');
      expect(mailer.sendActivation).toHaveBeenCalledWith(authUser);
    });

    it('rethrows other errors', async () => {
      users.create.mockRejectedValue(new Error('db down'));

      await expect(service.register(dto)).rejects.toThrow('db down');
    });
  });

  describe('activation', () => {
    it('describes a link by its account', async () => {
      activation.inspect.mockResolvedValueOnce({ ...authUser, pending: false });
      await expect(service.activationInfo('t')).resolves.toEqual({
        email: 'ana@example.com',
        name: 'Ana Souza',
        kind: 'ACTIVATE',
      });

      activation.inspect.mockResolvedValueOnce({ ...authUser, pending: true });
      await expect(service.activationInfo('t')).resolves.toMatchObject({
        kind: 'COMPLETE_SIGNUP',
      });
    });

    it('is 404 for an invalid link', async () => {
      activation.inspect.mockResolvedValue(null);

      await expect(service.activationInfo('t')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('activates and opens a session', async () => {
      activation.activate.mockResolvedValue(authUser);

      await expect(service.activate('t', { ip: '::1' })).resolves.toEqual({
        user: sessionUser,
        tokens: { accessToken: 'access', refreshToken: 'refresh' },
      });
      expect(activation.activate).toHaveBeenCalledWith('t');
      expect(sessions.create).toHaveBeenCalledWith(1, { ip: '::1' });
    });

    it('finishes a pre-registration with the hashed password and opens a session', async () => {
      activation.completeSignup.mockResolvedValue(authUser);
      const { email: _email, ...profile } = dto;

      const result = await service.completeSignup({ ...profile, token: 't' });

      expect(result.user).toEqual(sessionUser);
      const [token, data] = activation.completeSignup.mock.calls[0];
      expect(token).toBe('t');
      expect(data).toMatchObject({
        name: 'Ana Souza',
        birthDate: new Date('1990-05-20T00:00:00.000Z'),
        cep: '01001000',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(data).not.toHaveProperty('password');
      expect(data).not.toHaveProperty('token');
      await expect(
        argon2.verify(data.passwordHash, 'segredo123'),
      ).resolves.toBe(true);
    });

    it('resends with the normalized e-mail', async () => {
      await service.resendActivation(' ANA@example.com ');

      expect(mailer.resend).toHaveBeenCalledWith('ana@example.com');
    });
  });

  describe('validateCredentials', () => {
    let passwordHash: string;

    beforeAll(async () => {
      passwordHash = await argon2.hash('segredo123');
    });

    const emailVerifiedAt = new Date('2026-01-01');

    it('returns the public user for valid credentials', async () => {
      users.findByEmail.mockResolvedValue({
        ...authUser,
        passwordHash,
        emailVerifiedAt,
      });

      await expect(
        service.validateCredentials(' ANA@example.com', 'segredo123'),
      ).resolves.toEqual(authUser);
      expect(users.findByEmail).toHaveBeenCalledWith('ana@example.com');
    });

    it('returns null for a wrong password', async () => {
      users.findByEmail.mockResolvedValue({
        ...authUser,
        passwordHash,
        emailVerifiedAt,
      });

      await expect(
        service.validateCredentials('ana@example.com', 'errada123'),
      ).resolves.toBeNull();
    });

    it('is 403 for the right password of an account not activated', async () => {
      users.findByEmail.mockResolvedValue({
        ...authUser,
        pending: false,
        passwordHash,
        emailVerifiedAt: null,
      });

      await expect(
        service.validateCredentials('ana@example.com', 'segredo123'),
      ).rejects.toThrow(new ForbiddenException('Account not activated'));
    });

    it('returns null (not 403) for a wrong password of an account not activated', async () => {
      users.findByEmail.mockResolvedValue({
        ...authUser,
        pending: false,
        passwordHash,
        emailVerifiedAt: null,
      });

      await expect(
        service.validateCredentials('ana@example.com', 'errada123'),
      ).resolves.toBeNull();
    });

    it('returns null for a pre-registration, even with a hash', async () => {
      users.findByEmail.mockResolvedValue({
        ...authUser,
        pending: true,
        passwordHash,
      });

      await expect(
        service.validateCredentials('ana@example.com', 'segredo123'),
      ).resolves.toBeNull();
    });

    it('returns null for a user without a password', async () => {
      users.findByEmail.mockResolvedValue({
        ...authUser,
        pending: false,
        passwordHash: null,
      });

      await expect(
        service.validateCredentials('ana@example.com', 'segredo123'),
      ).resolves.toBeNull();
    });

    it('still verifies a hash for an unknown e-mail (same timing)', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.validateCredentials('x@example.com', 'segredo123'),
      ).resolves.toBeNull();
      const dummyHash = await (
        service as unknown as { dummyHash: Promise<string> }
      ).dummyHash;
      expect(dummyHash).toMatch(/^\$argon2id\$/);
    });

    it.each([
      [undefined, 'segredo123'],
      ['ana@example.com', 123],
      ['ana@example.com', 'x'.repeat(129)],
    ])(
      'rejects malformed input %s / %s without a query',
      async (email, password) => {
        await expect(
          service.validateCredentials(email, password),
        ).resolves.toBeNull();
        expect(users.findByEmail).not.toHaveBeenCalled();
      },
    );
  });

  describe('refresh', () => {
    it('rotates the session and issues a new access token', async () => {
      sessions.rotate.mockResolvedValue({
        userId: 1,
        refreshToken: 'refresh-2',
      });
      users.findSessionUser.mockResolvedValue(sessionUser);

      await expect(service.refresh('refresh-1')).resolves.toEqual({
        user: sessionUser,
        tokens: { accessToken: 'access', refreshToken: 'refresh-2' },
      });
      expect(sessions.rotate).toHaveBeenCalledWith('refresh-1');
    });

    it('fails when the user no longer exists', async () => {
      sessions.rotate.mockResolvedValue({
        userId: 1,
        refreshToken: 'refresh-2',
      });
      users.findSessionUser.mockResolvedValue(null);

      await expect(service.refresh('refresh-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  it('signIn refuses a user that is gone or still pre-registered', async () => {
    users.findSessionUser.mockResolvedValue(null);

    await expect(service.signIn(authUser)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.create).not.toHaveBeenCalled();
  });

  describe('me', () => {
    it('returns the user', async () => {
      users.findSessionUser.mockResolvedValue(sessionUser);

      await expect(service.me(1)).resolves.toEqual(sessionUser);
    });

    it('fails for a deleted user', async () => {
      users.findSessionUser.mockResolvedValue(null);

      await expect(service.me(1)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  it('logout revokes the refresh session', async () => {
    await service.logout('refresh');

    expect(sessions.revoke).toHaveBeenCalledWith('refresh');
  });
  describe('changePassword', () => {
    let passwordHash: string;
    const change = {
      currentPassword: 'segredo123',
      newPassword: 'novaSenha456',
    };

    beforeAll(async () => {
      passwordHash = await argon2.hash('segredo123', { type: argon2.argon2id });
    });

    beforeEach(() => {
      users.findCredentialsById.mockResolvedValue({
        ...authUser,
        passwordHash,
      });
      users.updatePasswordHash.mockResolvedValue(true);
    });

    it('stores the new hash, ends every session and opens a new one', async () => {
      const result = await service.changePassword(1, change, { ip: '::1' });

      expect(result).toEqual({
        user: sessionUser,
        tokens: { accessToken: 'access', refreshToken: 'refresh' },
      });
      const [id, hash] = users.updatePasswordHash.mock.calls[0];
      expect(id).toBe(1);
      await expect(argon2.verify(hash, 'novaSenha456')).resolves.toBe(true);
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith(1);
      expect(passwordReset.revokeFor).toHaveBeenCalledWith(1);
      expect(sessions.create).toHaveBeenCalledWith(1, { ip: '::1' });
      expect(
        sessions.revokeAllForUser.mock.invocationCallOrder[0],
      ).toBeLessThan(sessions.create.mock.invocationCallOrder[0]);
    });

    it('rejects a wrong current password with 403', async () => {
      await expect(
        service.changePassword(1, { ...change, currentPassword: 'errada123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
      expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects a new password equal to the current one with 400', async () => {
      await expect(
        service.changePassword(1, { ...change, newPassword: 'segredo123' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('is 404 for an unknown user or a pre-registration', async () => {
      users.findCredentialsById.mockResolvedValue(null);

      await expect(service.changePassword(9, change)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('password reset', () => {
    it('e-mails the link to the normalized e-mail', async () => {
      await service.forgotPassword('  Ana@Example.com ');

      expect(mailer.sendPasswordReset).toHaveBeenCalledWith('ana@example.com');
    });

    it('describes a link by its account', async () => {
      passwordReset.inspect.mockResolvedValue(authUser);

      await expect(service.passwordResetInfo('tok')).resolves.toEqual({
        email: 'ana@example.com',
        name: 'Ana Souza',
      });
    });

    it('is 404 for an invalid link', async () => {
      passwordReset.inspect.mockResolvedValue(null);

      await expect(service.passwordResetInfo('tok')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('stores the hashed password, ends every session, warns and signs in', async () => {
      passwordReset.reset.mockResolvedValue(authUser);

      const result = await service.resetPassword(
        { token: 'tok', password: 'novaSenha456' },
        { ip: '::1' },
      );

      expect(result).toEqual({
        user: sessionUser,
        tokens: { accessToken: 'access', refreshToken: 'refresh' },
      });
      const [token, hash] = passwordReset.reset.mock.calls[0];
      expect(token).toBe('tok');
      await expect(argon2.verify(hash, 'novaSenha456')).resolves.toBe(true);
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith(1);
      expect(mailer.sendPasswordChanged).toHaveBeenCalledWith(authUser);
      expect(sessions.create).toHaveBeenCalledWith(1, { ip: '::1' });
      expect(
        sessions.revokeAllForUser.mock.invocationCallOrder[0],
      ).toBeLessThan(sessions.create.mock.invocationCallOrder[0]);
    });

    it('keeps the sessions when the link is refused', async () => {
      passwordReset.reset.mockRejectedValue(new NotFoundException());

      await expect(
        service.resetPassword({ token: 'tok', password: 'novaSenha456' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
      expect(mailer.sendPasswordChanged).not.toHaveBeenCalled();
    });
  });
});

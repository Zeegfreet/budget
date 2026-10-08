import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
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

describe('AuthService', () => {
  const users = {
    create: vi.fn(),
    claimPending: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
  };
  const sessions = { create: vi.fn(), rotate: vi.fn(), revoke: vi.fn() };
  const jwt = { signAsync: vi.fn() };
  const service = new AuthService(
    users as unknown as UserService,
    sessions as unknown as SessionService,
    jwt as unknown as JwtService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    jwt.signAsync.mockResolvedValue('access');
    sessions.create.mockResolvedValue('refresh');
  });

  describe('register', () => {
    it('hashes the password, creates the user and opens a session', async () => {
      users.create.mockResolvedValue(authUser);

      const result = await service.register(dto, { ip: '::1' });

      expect(result).toEqual({
        user: authUser,
        tokens: { accessToken: 'access', refreshToken: 'refresh' },
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
      await expect(
        argon2.verify(data.passwordHash, 'segredo123'),
      ).resolves.toBe(true);
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 1 });
      expect(sessions.create).toHaveBeenCalledWith(1, { ip: '::1' });
    });

    const duplicate = () =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });

    it('maps a duplicate e-mail to 409', async () => {
      users.create.mockRejectedValue(duplicate());
      users.claimPending.mockResolvedValue(null);

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('takes over the pre-registration of the e-mail', async () => {
      users.create.mockRejectedValue(duplicate());
      users.claimPending.mockResolvedValue(authUser);

      const result = await service.register(dto);

      expect(result.user).toEqual(authUser);
      const [email, data] = users.claimPending.mock.calls[0];
      expect(email).toBe('ana@example.com');
      expect(data).toMatchObject({
        name: 'Ana Souza',
        birthDate: new Date('1990-05-20T00:00:00.000Z'),
        cep: '01001000',
        city: 'São Paulo',
        state: 'SP',
      });
      expect(data).not.toHaveProperty('email');
      expect(sessions.create).toHaveBeenCalledWith(1, {});
    });

    it('rethrows other errors', async () => {
      users.create.mockRejectedValue(new Error('db down'));

      await expect(service.register(dto)).rejects.toThrow('db down');
    });
  });

  describe('validateCredentials', () => {
    let passwordHash: string;

    beforeAll(async () => {
      passwordHash = await argon2.hash('segredo123');
    });

    it('returns the public user for valid credentials', async () => {
      users.findByEmail.mockResolvedValue({ ...authUser, passwordHash });

      await expect(
        service.validateCredentials(' ANA@example.com', 'segredo123'),
      ).resolves.toEqual(authUser);
      expect(users.findByEmail).toHaveBeenCalledWith('ana@example.com');
    });

    it('returns null for a wrong password', async () => {
      users.findByEmail.mockResolvedValue({ ...authUser, passwordHash });

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
      users.findById.mockResolvedValue(authUser);

      await expect(service.refresh('refresh-1')).resolves.toEqual({
        user: authUser,
        tokens: { accessToken: 'access', refreshToken: 'refresh-2' },
      });
      expect(sessions.rotate).toHaveBeenCalledWith('refresh-1');
    });

    it('fails when the user no longer exists', async () => {
      sessions.rotate.mockResolvedValue({
        userId: 1,
        refreshToken: 'refresh-2',
      });
      users.findById.mockResolvedValue(null);

      await expect(service.refresh('refresh-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('me', () => {
    it('returns the user', async () => {
      users.findById.mockResolvedValue(authUser);

      await expect(service.me(1)).resolves.toEqual(authUser);
    });

    it('fails for a deleted user', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.me(1)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  it('logout revokes the refresh session', async () => {
    await service.logout('refresh');

    expect(sessions.revoke).toHaveBeenCalledWith('refresh');
  });
});

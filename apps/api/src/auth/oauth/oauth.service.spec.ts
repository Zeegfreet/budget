import { Prisma } from '../../prisma/generated/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { authUserSelect } from '../../user/user.service.js';
import type { OAuthConfig } from './oauth.config.js';
import type { OAuthState } from './oauth-state.js';
import { OAuthError, OAuthService } from './oauth.service.js';
import { OAuthProviderError, oauthProviders } from './providers.js';

const config: OAuthConfig = {
  webUrl: 'http://web',
  callbackBaseUrl: 'http://web/api',
  clients: { github: { clientId: 'id', clientSecret: 'secret' } },
};
const saved: OAuthState = {
  provider: 'github',
  state: 'st',
  verifier: 'ver',
  redirect: '/',
};
const profile = {
  providerAccountId: '42',
  email: 'Ana@Example.com',
  emailVerified: true,
  name: 'Ana Souza',
};
const user = { id: 1, email: 'ana@example.com', name: 'Ana Souza' };
const account = {
  provider: 'GITHUB',
  providerAccountId: '42',
  email: 'ana@example.com',
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique', {
    code: 'P2002',
    clientVersion: 'test',
  });

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof OAuthError ? error.code : error),
  );

describe('OAuthService', () => {
  const prisma = {
    oAuthAccount: { findUnique: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const service = new OAuthService(config, prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.oAuthAccount.create.mockReturnValue('create-link');
    prisma.user.updateMany.mockReturnValue('claim');
    prisma.$transaction.mockResolvedValue([]);
  });

  it('knows which providers have credentials', () => {
    expect(service.isEnabled('github')).toBe(true);
    expect(service.isEnabled('google')).toBe(false);
  });

  it('points the provider back to the callback with the PKCE challenge', () => {
    const url = new URL(service.authorizationUrl('github', saved));

    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://web/api/auth/oauth/github/callback',
    );
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('code_challenge')).not.toBe('ver');
  });

  describe('authenticate', () => {
    const query = { code: 'code', state: 'st' };

    it('reads the profile with the saved verifier and resolves the user', async () => {
      const fetchProfile = vi
        .spyOn(oauthProviders.github, 'fetchProfile')
        .mockResolvedValue(profile);
      prisma.oAuthAccount.findUnique.mockResolvedValue({ user });

      await expect(service.authenticate('github', query, saved)).resolves.toBe(
        user,
      );
      expect(fetchProfile).toHaveBeenCalledWith({
        client: config.clients.github,
        code: 'code',
        codeVerifier: 'ver',
        redirectUri: 'http://web/api/auth/oauth/github/callback',
      });
    });

    it.each([
      ['no cookie', query, null],
      ['another state', { ...query, state: 'other' }, saved],
      ['no code', { state: 'st' }, saved],
      ['another provider', query, { ...saved, provider: 'google' as const }],
    ])('rejects %s', async (_, q, s) => {
      const fetchProfile = vi.spyOn(oauthProviders.github, 'fetchProfile');

      await expect(codeOf(service.authenticate('github', q, s))).resolves.toBe(
        'oauth_state',
      );
      expect(fetchProfile).not.toHaveBeenCalled();
    });

    it('passes on a cancelled consent', async () => {
      await expect(
        codeOf(
          service.authenticate('github', { error: 'access_denied' }, saved),
        ),
      ).resolves.toBe('access_denied');
      await expect(
        codeOf(
          service.authenticate('github', { error: 'server_error' }, saved),
        ),
      ).resolves.toBe('oauth_failed');
    });

    it('is unavailable without credentials', async () => {
      await expect(
        codeOf(service.authenticate('google', query, saved)),
      ).resolves.toBe('oauth_unavailable');
    });

    it('turns a provider failure into oauth_failed', async () => {
      vi.spyOn(oauthProviders.github, 'fetchProfile').mockRejectedValue(
        new OAuthProviderError('500'),
      );

      await expect(
        codeOf(service.authenticate('github', query, saved)),
      ).resolves.toBe('oauth_failed');
    });
  });

  describe('resolveUser', () => {
    it('signs in the user already linked to the account', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue({ user });

      await expect(service.resolveUser('github', profile)).resolves.toBe(user);
      expect(prisma.oAuthAccount.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerAccountId: {
            provider: 'GITHUB',
            providerAccountId: '42',
          },
        },
        select: { user: { select: authUserSelect } },
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('needs a verified e-mail when nothing is linked', async () => {
      await expect(
        codeOf(
          service.resolveUser('github', { ...profile, emailVerified: false }),
        ),
      ).resolves.toBe('oauth_email');
      await expect(
        codeOf(service.resolveUser('github', { ...profile, email: null })),
      ).resolves.toBe('oauth_email');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('creates a user with only name and e-mail, linked to the account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);

      await expect(service.resolveUser('github', profile)).resolves.toBe(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'ana@example.com' },
        select: { ...authUserSelect, pending: true },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'ana@example.com',
          name: 'Ana Souza',
          oauthAccounts: { create: account },
        },
        select: authUserSelect,
      });
    });

    it('links a registered user with the same e-mail', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        name: 'Ana',
        pending: false,
      });

      await expect(service.resolveUser('github', profile)).resolves.toEqual({
        ...user,
        name: 'Ana',
      });
      expect(prisma.oAuthAccount.create).toHaveBeenCalledWith({
        data: { ...account, userId: 1 },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(['create-link']);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('takes over a pre-registration, replacing the nickname', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        name: 'Aninha',
        pending: true,
      });

      await expect(service.resolveUser('github', profile)).resolves.toEqual(
        user,
      );
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 1, pending: true },
        data: { pending: false, name: 'Ana Souza' },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        'claim',
        'create-link',
      ]);
    });

    it('retries once after losing a race', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValueOnce(uniqueViolation());
      prisma.oAuthAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ user });

      await expect(service.resolveUser('github', profile)).resolves.toBe(user);
      expect(prisma.oAuthAccount.findUnique).toHaveBeenCalledTimes(2);
    });

    it('gives up after a second unique violation', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.resolveUser('github', profile),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(prisma.user.create).toHaveBeenCalledTimes(2);
    });
  });
});

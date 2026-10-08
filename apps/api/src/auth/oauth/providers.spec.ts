import { OAuthProviderError, oauthProviders } from './providers.js';

const client = { clientId: 'id', clientSecret: 'secret' };
const exchange = {
  client,
  code: 'the-code',
  codeVerifier: 'the-verifier',
  redirectUri: 'http://localhost:5173/api/auth/oauth/github/callback',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Answers each fetch by URL prefix. */
function mockFetch(routes: Record<string, () => Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const match = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => url.startsWith(prefix));
    if (!match) throw new Error(`Unexpected fetch ${url}`);
    return Promise.resolve(routes[match]());
  });
}

describe('oauthProviders', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('github', () => {
    const github = oauthProviders.github;
    const token = () => json({ access_token: 'gh-token' });

    it('builds the authorize URL with PKCE', () => {
      const url = new URL(
        github.authorizeUrl({
          clientId: 'id',
          redirectUri: exchange.redirectUri,
          state: 'st',
          codeChallenge: 'ch',
        }),
      );

      expect(url.origin + url.pathname).toBe(
        'https://github.com/login/oauth/authorize',
      );
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: 'id',
        redirect_uri: exchange.redirectUri,
        response_type: 'code',
        scope: 'read:user user:email',
        state: 'st',
        code_challenge: 'ch',
        code_challenge_method: 'S256',
      });
    });

    it('exchanges the code and reads the primary verified e-mail', async () => {
      const fetch = mockFetch({
        'https://github.com/login/oauth/access_token': token,
        'https://api.github.com/user/emails': () =>
          json([
            { email: 'old@example.com', primary: false, verified: true },
            { email: 'Ana@Example.com', primary: true, verified: true },
          ]),
        'https://api.github.com/user': () =>
          json({ id: 42, login: 'ana', name: 'Ana Souza' }),
      });

      await expect(github.fetchProfile(exchange)).resolves.toEqual({
        providerAccountId: '42',
        email: 'Ana@Example.com',
        emailVerified: true,
        name: 'Ana Souza',
      });

      const [, init] = fetch.mock.calls[0];
      const body = new URLSearchParams(init?.body as URLSearchParams);
      expect(Object.fromEntries(body)).toEqual({
        client_id: 'id',
        client_secret: 'secret',
        code: 'the-code',
        code_verifier: 'the-verifier',
        redirect_uri: exchange.redirectUri,
        grant_type: 'authorization_code',
      });
      const userCall = fetch.mock.calls.find(
        ([url]) => url === 'https://api.github.com/user',
      );
      expect(userCall?.[1]?.headers).toMatchObject({
        Authorization: 'Bearer gh-token',
        'User-Agent': 'budget-app',
      });
    });

    it('falls back to the login and any verified e-mail', async () => {
      mockFetch({
        'https://github.com/login/oauth/access_token': token,
        'https://api.github.com/user/emails': () =>
          json([
            { email: 'primary@example.com', primary: true, verified: false },
            { email: 'other@example.com', primary: false, verified: true },
          ]),
        'https://api.github.com/user': () =>
          json({ id: 7, login: 'ana', name: null }),
      });

      await expect(github.fetchProfile(exchange)).resolves.toMatchObject({
        email: 'other@example.com',
        emailVerified: true,
        name: 'ana',
      });
    });

    it('reports no e-mail when none is verified', async () => {
      mockFetch({
        'https://github.com/login/oauth/access_token': token,
        'https://api.github.com/user/emails': () =>
          json([{ email: 'a@example.com', primary: true, verified: false }]),
        'https://api.github.com/user': () => json({ id: 7, login: 'a' }),
      });

      await expect(github.fetchProfile(exchange)).resolves.toMatchObject({
        email: null,
        emailVerified: false,
        name: 'Usuário',
      });
    });

    it('fails on a rejected code (200 with an error)', async () => {
      mockFetch({
        'https://github.com/login/oauth/access_token': () =>
          json({ error: 'bad_verification_code' }),
      });

      await expect(github.fetchProfile(exchange)).rejects.toBeInstanceOf(
        OAuthProviderError,
      );
    });

    it('fails when the API answers with an error', async () => {
      mockFetch({
        'https://github.com/login/oauth/access_token': token,
        'https://api.github.com/user': () => json({}, 500),
      });

      await expect(github.fetchProfile(exchange)).rejects.toBeInstanceOf(
        OAuthProviderError,
      );
    });

    it('fails when the network fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('down'));

      await expect(github.fetchProfile(exchange)).rejects.toBeInstanceOf(
        OAuthProviderError,
      );
    });
  });

  describe('google', () => {
    const google = oauthProviders.google;
    const token = () => json({ access_token: 'g-token' });

    it('builds the authorize URL', () => {
      const url = new URL(
        google.authorizeUrl({
          clientId: 'id',
          redirectUri: 'http://x/cb',
          state: 'st',
          codeChallenge: 'ch',
        }),
      );

      expect(url.origin + url.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('reads the user info', async () => {
      const fetch = mockFetch({
        'https://oauth2.googleapis.com/token': token,
        'https://openidconnect.googleapis.com/v1/userinfo': () =>
          json({
            sub: '1234',
            email: 'ana@gmail.com',
            email_verified: true,
            name: 'Ana Souza',
          }),
      });

      await expect(google.fetchProfile(exchange)).resolves.toEqual({
        providerAccountId: '1234',
        email: 'ana@gmail.com',
        emailVerified: true,
        name: 'Ana Souza',
      });
      expect(fetch.mock.calls[1][1]?.headers).toEqual({
        Authorization: 'Bearer g-token',
      });
    });

    it('flags an unverified e-mail and names the user after it', async () => {
      mockFetch({
        'https://oauth2.googleapis.com/token': token,
        'https://openidconnect.googleapis.com/v1/userinfo': () =>
          json({ sub: '1', email: 'ana@gmail.com', email_verified: false }),
      });

      await expect(google.fetchProfile(exchange)).resolves.toMatchObject({
        emailVerified: false,
        name: 'ana',
      });
    });

    it('fails on an unexpected answer', async () => {
      mockFetch({
        'https://oauth2.googleapis.com/token': token,
        'https://openidconnect.googleapis.com/v1/userinfo': () =>
          new Response('<html>', { status: 200 }),
      });

      await expect(google.fetchProfile(exchange)).rejects.toBeInstanceOf(
        OAuthProviderError,
      );
    });
  });
});

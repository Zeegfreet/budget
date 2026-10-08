import { INestApplication } from '@nestjs/common';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { codeChallenge } from '../src/auth/oauth/oauth-state.js';
import { createGroup } from './groups.js';
import { type Agent, createTestApp, resetDatabase, signUp } from './utils.js';

const WEB = 'http://web.test';

interface GithubAccount {
  id: number;
  login: string;
  name: string | null;
  emails: { email: string; primary: boolean; verified: boolean }[];
}

interface GoogleAccount {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const github = (overrides: Partial<GithubAccount> = {}): GithubAccount => ({
  id: 1001,
  login: 'ana',
  name: 'Ana Souza',
  emails: [{ email: 'Ana@Example.com', primary: true, verified: true }],
  ...overrides,
});

const google = (overrides: Partial<GoogleAccount> = {}): GoogleAccount => ({
  sub: 'google-2002',
  email: 'ana@example.com',
  email_verified: true,
  name: 'Ana do Google',
  ...overrides,
});

function cookie(res: Response, name: string) {
  return (res.get('Set-Cookie') ?? []).find((c) => c.startsWith(`${name}=`));
}

describe('OAuth sign-in (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  /** What the mocked providers answer */
  let githubAccount: GithubAccount;
  let googleAccount: GoogleAccount;
  let tokenStatus: number;
  /** Bodies posted to the token endpoints */
  let tokenRequests: URLSearchParams[];

  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    githubAccount = github();
    googleAccount = google();
    tokenStatus = 200;
    tokenRequests = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      switch (url) {
        case 'https://github.com/login/oauth/access_token':
        case 'https://oauth2.googleapis.com/token':
          tokenRequests.push(new URLSearchParams(init?.body as string));
          return Promise.resolve(
            json({ access_token: 'provider-token' }, tokenStatus),
          );
        case 'https://api.github.com/user':
          return Promise.resolve(
            json({
              id: githubAccount.id,
              login: githubAccount.login,
              name: githubAccount.name,
            }),
          );
        case 'https://api.github.com/user/emails':
          return Promise.resolve(json(githubAccount.emails));
        case 'https://openidconnect.googleapis.com/v1/userinfo':
          return Promise.resolve(json(googleAccount));
        default:
          return realFetch(input, init);
      }
    });

    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  const agent = () => request.agent(app.getHttpServer());

  /** Starts the flow and returns the provider URL it redirected to. */
  async function start(client: Agent, provider: string, redirect?: string) {
    const res = await client
      .get(`/auth/oauth/${provider}`)
      .query(redirect === undefined ? {} : { redirect })
      .expect(302);
    return new URL(res.headers.location);
  }

  /** The full round trip: start, then the provider calls back with a code. */
  async function signInWith(
    provider: 'github' | 'google',
    client: Agent = agent(),
    redirect?: string,
  ) {
    const authorize = await start(client, provider, redirect);
    const res = await client
      .get(`/auth/oauth/${provider}/callback`)
      .query({ code: 'the-code', state: authorize.searchParams.get('state') })
      .expect(302);
    return { client, res };
  }

  const me = async (client: Agent) =>
    (await client.get('/auth/me').expect(200)).body as {
      id: number;
      email: string;
      name: string;
      needsProfile: boolean;
      hasPassword: boolean;
    };

  describe('start', () => {
    it('redirects to GitHub with PKCE and remembers the flow in a cookie', async () => {
      const client = agent();
      const res = await client
        .get('/auth/oauth/github')
        .query({ redirect: '/extrato?month=2026-10' })
        .expect(302);
      const url = new URL(res.headers.location);

      expect(url.origin + url.pathname).toBe(
        'https://github.com/login/oauth/authorize',
      );
      expect(url.searchParams.get('client_id')).toBe('github-test-id');
      expect(url.searchParams.get('redirect_uri')).toBe(
        `${WEB}/api/auth/oauth/github/callback`,
      );
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      const stateCookie = cookie(res, 'oauth_state');
      expect(stateCookie).toMatch(/HttpOnly/);
      expect(stateCookie).toMatch(/Path=\/auth;/);
      expect(stateCookie).toMatch(/SameSite=Lax/);

      // The token request carries the verifier behind the challenge
      await client
        .get('/auth/oauth/github/callback')
        .query({ code: 'c', state: url.searchParams.get('state') })
        .expect(302);
      const verifier = tokenRequests[0].get('code_verifier') ?? '';
      expect(codeChallenge(verifier)).toBe(
        url.searchParams.get('code_challenge'),
      );
      expect(tokenRequests[0].get('code')).toBe('c');
    });

    it('redirects to Google', async () => {
      const url = await start(agent(), 'google');

      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.searchParams.get('client_id')).toBe('google-test-id');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
    });

    it('404s an unknown provider', async () => {
      await agent().get('/auth/oauth/facebook').expect(404);
      await agent().get('/auth/oauth/facebook/callback').expect(404);
    });
  });

  describe('first sign-in', () => {
    it('creates the account, opens a session and asks for the profile', async () => {
      const { client, res } = await signInWith('github', agent(), '/grupos');

      expect(res.headers.location).toBe(`${WEB}/grupos`);
      expect(cookie(res, 'access_token')).toBeDefined();
      expect(cookie(res, 'refresh_token')).toBeDefined();
      expect(cookie(res, 'oauth_state')).toMatch(/oauth_state=;/);
      const user = await me(client);
      expect(user).toMatchObject({
        email: 'ana@example.com',
        name: 'Ana Souza',
        needsProfile: true,
        hasPassword: false,
      });

      // Finishing the sign-up on the web
      await client
        .patch('/users/me')
        .send({
          birthDate: '1990-05-20',
          cep: '01001000',
          city: 'São Paulo',
          state: 'SP',
        })
        .expect(200);
      expect(await me(client)).toMatchObject({ needsProfile: false });
      // The refresh keeps the flags too
      const refreshed = await client.post('/auth/refresh').expect(200);
      expect(refreshed.body).toMatchObject({
        needsProfile: false,
        hasPassword: false,
      });
    });

    it('signs the same account in again, even after the e-mail changed', async () => {
      const first = await signInWith('github');
      const { id } = await me(first.client);

      githubAccount.emails = [
        { email: 'new@example.com', primary: true, verified: true },
      ];
      const second = await signInWith('github');

      expect(second.res.headers.location).toBe(`${WEB}/`);
      expect((await me(second.client)).id).toBe(id);
      expect(await prisma.user.count()).toBe(1);
    });

    it('links GitHub and Google with the same verified e-mail', async () => {
      const { client } = await signInWith('github');
      const fromGoogle = await signInWith('google');

      expect((await me(fromGoogle.client)).id).toBe((await me(client)).id);
      expect(await prisma.oAuthAccount.count()).toBe(2);
    });
  });

  describe('existing accounts', () => {
    it('links a registered account and keeps its data', async () => {
      const ana = await signUp(app, 'Ana', 'ana@example.com');
      const { id } = await me(ana);

      const { client } = await signInWith('google');

      expect(await me(client)).toEqual({
        id,
        email: 'ana@example.com',
        name: 'Ana',
        needsProfile: false,
        hasPassword: true,
      });
      // The password still works
      await agent()
        .post('/auth/login')
        .send({ email: 'ana@example.com', password: 'segredo123' })
        .expect(200);
    });

    it('takes over a pre-registration, keeping the group membership', async () => {
      const owner = await signUp(app, 'Bruno', 'bruno@example.com');
      const group = await createGroup(owner);
      await owner
        .post(`/groups/${group.id}/invitations`)
        .send({ email: 'ana@example.com', nickname: 'Aninha' })
        .expect(201);
      const pending = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });

      const { client } = await signInWith('github');

      expect(await me(client)).toMatchObject({
        id: pending.id,
        name: 'Ana Souza',
        needsProfile: true,
      });
      const detail = await client.get(`/groups/${group.id}`).expect(200);
      expect(detail.body.members).toHaveLength(2);
    });
  });

  describe('failures', () => {
    const loginError = (res: Response) => {
      const url = new URL(res.headers.location);
      expect(url.origin + url.pathname).toBe(`${WEB}/login`);
      return Object.fromEntries(url.searchParams);
    };

    it('rejects a callback whose state does not match', async () => {
      const client = agent();
      await start(client, 'github', '/extrato');
      const res = await client
        .get('/auth/oauth/github/callback')
        .query({ code: 'c', state: 'forged' })
        .expect(302);

      expect(loginError(res)).toEqual({
        error: 'oauth_state',
        redirect: '/extrato',
      });
      expect(cookie(res, 'access_token')).toBeUndefined();
      expect(tokenRequests).toHaveLength(0);
    });

    it('rejects a callback without the flow cookie (another browser)', async () => {
      const authorize = await start(agent(), 'github');
      const res = await agent()
        .get('/auth/oauth/github/callback')
        .query({ code: 'c', state: authorize.searchParams.get('state') })
        .expect(302);

      expect(loginError(res)).toEqual({ error: 'oauth_state' });
    });

    it('does not reuse a flow (the cookie is cleared)', async () => {
      const client = agent();
      const authorize = await start(client, 'github');
      const query = { code: 'c', state: authorize.searchParams.get('state') };
      await client.get('/auth/oauth/github/callback').query(query).expect(302);
      await client.post('/auth/logout').expect(204);

      const again = await client
        .get('/auth/oauth/github/callback')
        .query(query)
        .expect(302);
      expect(loginError(again)).toEqual({ error: 'oauth_state' });
    });

    it('explains a cancelled consent', async () => {
      const client = agent();
      const authorize = await start(client, 'google');
      const res = await client
        .get('/auth/oauth/google/callback')
        .query({
          error: 'access_denied',
          state: authorize.searchParams.get('state'),
        })
        .expect(302);

      expect(loginError(res)).toEqual({ error: 'access_denied' });
    });

    it('refuses an account without a verified e-mail', async () => {
      googleAccount = google({ email_verified: false });
      const { res } = await signInWith('google');

      expect(loginError(res)).toEqual({ error: 'oauth_email' });
      expect(await prisma.user.count()).toBe(0);
    });

    it('does not link an unverified e-mail to an existing account', async () => {
      await signUp(app, 'Ana', 'ana@example.com');
      githubAccount = github({
        emails: [{ email: 'ana@example.com', primary: true, verified: false }],
      });

      const { res } = await signInWith('github');

      expect(loginError(res)).toEqual({ error: 'oauth_email' });
      expect(await prisma.oAuthAccount.count()).toBe(0);
    });

    it('reports a provider failure', async () => {
      tokenStatus = 500;
      const { res } = await signInWith('github');

      expect(loginError(res)).toEqual({ error: 'oauth_failed' });
    });

    it('never redirects to another site', async () => {
      const { res } = await signInWith('github', agent(), '//evil.com');

      expect(res.headers.location).toBe(`${WEB}/`);
    });
  });

  describe('accounts without a password', () => {
    it('cannot sign in or change a password with e-mail/password', async () => {
      const { client } = await signInWith('github');

      await agent()
        .post('/auth/login')
        .send({ email: 'ana@example.com', password: 'segredo123' })
        .expect(401);
      await client
        .post('/auth/password')
        .send({ currentPassword: 'whatever1', newPassword: 'segredo123' })
        .expect(404);
    });

    it('only sees their own data', async () => {
      const bruno = await signUp(app, 'Bruno', 'bruno@example.com');
      const group = await createGroup(bruno);
      const created = await bruno
        .post('/payment-methods')
        .send({ name: 'Cartão', type: 'CREDIT_CARD' })
        .expect(201);
      const { client } = await signInWith('github');

      await client.get(`/groups/${group.id}`).expect(404);
      await client
        .get(`/payment-methods/${created.body.id}/invoice`)
        .query({ month: '2026-10' })
        .expect(404);
      await client.get('/users/me').expect(200);
    });
  });
});

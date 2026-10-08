import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { mailOf, tokenFrom } from './mail.js';
import { createTestApp, resetDatabase } from './utils.js';

const validBody = {
  name: 'Ana Souza',
  email: 'ana@example.com',
  password: 'segredo123',
  birthDate: '1990-05-20',
  cep: '01001000',
  city: 'São Paulo',
  state: 'SP',
};

const otherBody = {
  ...validBody,
  name: 'Bruno Lima',
  email: 'bruno@example.com',
};

function setCookies(res: Response): string[] {
  const header = res.get('Set-Cookie');
  return header ?? [];
}

function cookie(res: Response, name: string) {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}

function cookieValue(res: Response, name: string) {
  return cookie(res, name)
    ?.split(';')[0]
    .slice(name.length + 1);
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());
  const agent = () => request.agent(app.getHttpServer());

  /**
   * Signs up and activates through the e-mailed link; `res` is the
   * activation's answer (the session cookies and the user).
   */
  async function register(body: typeof validBody = validBody) {
    const client = agent();
    await client.post('/auth/register').send(body).expect(201);
    const token = tokenFrom(mailOf(app).lastTo(body.email));
    const res = await client
      .post('/auth/activation')
      .send({ token })
      .expect(200);
    return { client, res };
  }

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('creates the user not activated, e-mails the link and opens no session', async () => {
      const res = await http()
        .post('/auth/register')
        .send(validBody)
        .expect(201);

      expect(res.body).toEqual({ email: 'ana@example.com' });
      expect(setCookies(res)).toEqual([]);

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(validBody.password);
      expect(user.birthDate?.toISOString()).toBe('1990-05-20T00:00:00.000Z');
      expect(user).toMatchObject({
        name: 'Ana Souza',
        cep: '01001000',
        city: 'São Paulo',
        state: 'SP',
        pending: false,
        emailVerifiedAt: null,
      });
      expect(await prisma.session.count()).toBe(0);
      expect(mailOf(app).lastTo('ana@example.com').subject).toBe(
        'Ative sua conta no Budget',
      );
    });

    it('signs in after the activation, never returning private fields', async () => {
      const { client, res } = await register();

      expect(res.body).toEqual({
        id: expect.any(Number),
        email: 'ana@example.com',
        name: 'Ana Souza',
        needsProfile: false,
        hasPassword: true,
      });
      const access = cookie(res, 'access_token');
      const refresh = cookie(res, 'refresh_token');
      expect(access).toMatch(/HttpOnly/);
      expect(access).toMatch(/SameSite=Lax/);
      expect(access).toMatch(/Path=\//);
      expect(refresh).toMatch(/HttpOnly/);
      expect(refresh).toMatch(/SameSite=Lax/);
      expect(refresh).toMatch(/Path=\/auth/);

      const me = await client.get('/auth/me').expect(200);
      expect(me.body).toMatchObject({
        email: 'ana@example.com',
        name: 'Ana Souza',
      });
    });

    it('normalizes e-mail, name, city and state', async () => {
      const res = await http()
        .post('/auth/register')
        .send({
          ...validBody,
          email: '  Ana@Example.COM ',
          name: '  Ana Souza ',
          city: ' São Paulo ',
          state: 'sp',
        })
        .expect(201);

      expect(res.body).toEqual({ email: 'ana@example.com' });
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(user).toMatchObject({
        name: 'Ana Souza',
        city: 'São Paulo',
        state: 'SP',
      });
    });

    it('returns 409 for an e-mail already registered (case-insensitive)', async () => {
      await register();

      const res = await http()
        .post('/auth/register')
        .send({ ...validBody, email: 'ANA@example.com' })
        .expect(409);
      expect(res.body.message).toBe('E-mail already registered');
      expect(setCookies(res)).toEqual([]);
    });

    it.each([
      ['name', { name: 'A' }],
      ['email', { email: 'ana@' }],
      ['password', { password: 'curta12' }],
      ['birthDate', { birthDate: '2010-01-01' }], // under 18
      ['birthDate', { birthDate: '2999-01-01' }], // future
      ['birthDate', { birthDate: '1990-02-30' }], // impossible
      ['birthDate', { birthDate: '20/05/1990' }],
      ['cep', { cep: '01001-000' }],
      ['state', { state: 'XX' }],
      ['city', { city: '   ' }],
    ])('returns 400 for an invalid %s', async (field, overrides) => {
      const res = await http()
        .post('/auth/register')
        .send({ ...validBody, ...overrides })
        .expect(400);

      expect(res.body.message.some((m: string) => m.startsWith(field))).toBe(
        true,
      );
      expect(await prisma.user.count()).toBe(0);
    });

    it('returns 400 for missing fields', async () => {
      const res = await http().post('/auth/register').send({}).expect(400);

      for (const field of Object.keys(validBody)) {
        expect(res.body.message.some((m: string) => m.startsWith(field))).toBe(
          true,
        );
      }
    });

    it('rejects unknown fields (no mass assignment)', async () => {
      const res = await http()
        .post('/auth/register')
        .send({ ...validBody, id: 99, passwordHash: 'x' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'property id should not exist',
          'property passwordHash should not exist',
        ]),
      );
    });

    it('rate limits sign-up attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await http().post('/auth/register').send({}).expect(400);
      }
      await http().post('/auth/register').send(validBody).expect(429);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await register();
    });

    it('signs in and sets both cookies', async () => {
      const client = agent();
      const res = await client
        .post('/auth/login')
        .send({ email: 'ana@example.com', password: 'segredo123' })
        .expect(200);

      expect(res.body).toEqual({
        id: expect.any(Number),
        email: 'ana@example.com',
        name: 'Ana Souza',
        needsProfile: false,
        hasPassword: true,
      });
      expect(cookie(res, 'access_token')).toMatch(/HttpOnly/);
      expect(cookie(res, 'refresh_token')).toMatch(/HttpOnly/);
      await client.get('/auth/me').expect(200);
    });

    it('accepts the e-mail in any case', async () => {
      await http()
        .post('/auth/login')
        .send({ email: ' ANA@example.com ', password: 'segredo123' })
        .expect(200);
    });

    it('gives the same answer for a wrong password and an unknown e-mail', async () => {
      const wrongPassword = await http()
        .post('/auth/login')
        .send({ email: 'ana@example.com', password: 'errada123' })
        .expect(401);
      const unknownEmail = await http()
        .post('/auth/login')
        .send({ email: 'ninguem@example.com', password: 'segredo123' })
        .expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body.message).toBe('Invalid credentials');
      expect(setCookies(wrongPassword)).toEqual([]);
    });

    it.each([
      {},
      { email: 'ana@example.com' },
      { email: 1, password: ['segredo123'] },
    ])('returns 401 for a malformed body %o', async (body) => {
      await http().post('/auth/login').send(body).expect(401);
    });

    it('rate limits login attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/auth/login')
          .send({ email: 'ana@example.com', password: 'errada123' })
          .expect(401);
      }
      await http()
        .post('/auth/login')
        .send({ email: 'ana@example.com', password: 'segredo123' })
        .expect(429);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without a session', async () => {
      await http().get('/auth/me').expect(401);
    });

    it('returns 401 for a token signed with another secret', async () => {
      const { res } = await register();
      const forged = new JwtService({ secret: 'not-the-secret' }).sign({
        sub: res.body.id,
      });

      await http()
        .get('/auth/me')
        .set('Cookie', `access_token=${forged}`)
        .expect(401);
    });

    it('returns 401 for an expired access token', async () => {
      const { res } = await register();
      const expired = app
        .get(JwtService)
        .sign({ sub: res.body.id }, { expiresIn: -10 });

      await http()
        .get('/auth/me')
        .set('Cookie', `access_token=${expired}`)
        .expect(401);
    });

    it('does not accept the token from an Authorization header', async () => {
      const { res } = await register();
      const token = cookieValue(res, 'access_token');

      await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('returns 401 when the user no longer exists', async () => {
      const { client, res } = await register();
      await prisma.user.delete({ where: { id: res.body.id } });

      await client.get('/auth/me').expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates both cookies and keeps the user signed in', async () => {
      const { client, res } = await register();
      const oldRefresh = cookieValue(res, 'refresh_token');

      const refreshed = await client.post('/auth/refresh').expect(200);

      expect(refreshed.body).toMatchObject({ email: 'ana@example.com' });
      expect(cookieValue(refreshed, 'refresh_token')).not.toBe(oldRefresh);
      expect(cookie(refreshed, 'access_token')).toMatch(/HttpOnly/);
      await client.get('/auth/me').expect(200);
    });

    it('works with an expired access token', async () => {
      const { res } = await register();
      const refresh = cookieValue(res, 'refresh_token');
      const expired = app
        .get(JwtService)
        .sign({ sub: res.body.id }, { expiresIn: -10 });

      await http()
        .post('/auth/refresh')
        .set('Cookie', [`access_token=${expired}`, `refresh_token=${refresh}`])
        .expect(200);
    });

    it('returns 401 and clears cookies without a refresh token', async () => {
      const res = await http().post('/auth/refresh').expect(401);

      expect(cookie(res, 'access_token')).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(cookie(res, 'refresh_token')).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it.each(['garbage', 'a.b', `${'0'.repeat(36)}.${'A'.repeat(43)}`])(
      'returns 401 for a malformed or unknown token %s',
      async (token) => {
        await http()
          .post('/auth/refresh')
          .set('Cookie', `refresh_token=${token}`)
          .expect(401);
      },
    );

    it('returns 401 for an expired session', async () => {
      const { client, res } = await register();
      await prisma.session.updateMany({
        where: { userId: res.body.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await client.post('/auth/refresh').expect(401);
    });

    it('tolerates a concurrent refresh with the previous token without ending the session', async () => {
      const { res } = await register();
      const original = cookieValue(res, 'refresh_token');

      const first = await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${original}`)
        .expect(200);
      // e.g. a second tab that still had the old cookie
      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${original}`)
        .expect(401);

      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${cookieValue(first, 'refresh_token')}`)
        .expect(200);
    });

    it('revokes the session when an old token is reused (token theft)', async () => {
      const { res } = await register();
      const stolen = cookieValue(res, 'refresh_token');

      const rotated = await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${stolen}`)
        .expect(200);
      await prisma.session.updateMany({
        where: { userId: res.body.id },
        data: { rotatedAt: new Date(Date.now() - 60_000) },
      });

      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${stolen}`)
        .expect(401);
      // The legitimate, newer token dies with the session
      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${cookieValue(rotated, 'refresh_token')}`)
        .expect(401);
      const session = await prisma.session.findFirstOrThrow({
        where: { userId: res.body.id },
      });
      expect(session.revokedAt).not.toBeNull();
    });
  });

  describe('POST /auth/password', () => {
    const change = {
      currentPassword: validBody.password,
      newPassword: 'novaSenha456',
    };
    const login = (password: string, email = validBody.email) =>
      http().post('/auth/login').send({ email, password });

    it('changes the password and renews this session', async () => {
      const { client, res } = await register();
      const oldRefresh = cookieValue(res, 'refresh_token');

      const changed = await client
        .post('/auth/password')
        .send(change)
        .expect(200);

      expect(changed.body).toEqual({
        id: res.body.id,
        email: 'ana@example.com',
        name: 'Ana Souza',
        needsProfile: false,
        hasPassword: true,
      });
      expect(changed.body).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(changed.body)).not.toContain(change.newPassword);
      expect(cookie(changed, 'refresh_token')).toMatch(/Path=\/auth/);
      expect(cookieValue(changed, 'refresh_token')).not.toBe(oldRefresh);
      // This client stays signed in with the new cookies
      await client.get('/auth/me').expect(200);
      await client.post('/auth/refresh').expect(200);

      await login(validBody.password).expect(401);
      await login(change.newPassword).expect(200);
    });

    it('signs out the other sessions of the user', async () => {
      const { client } = await register();
      const other = await login(validBody.password).expect(200);
      const otherRefresh = cookieValue(other, 'refresh_token');

      await client.post('/auth/password').send(change).expect(200);

      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${otherRefresh}`)
        .expect(401);
    });

    it('returns 403 for a wrong current password and keeps everything', async () => {
      const { client, res } = await register();
      const refresh = cookieValue(res, 'refresh_token');

      const wrong = await client
        .post('/auth/password')
        .send({ ...change, currentPassword: 'errada123' })
        .expect(403);

      expect(wrong.body.message).toBe('Current password is incorrect');
      await login(validBody.password).expect(200);
      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${refresh}`)
        .expect(200);
    });

    it('returns 400 when the new password equals the current one', async () => {
      const { client } = await register();

      const res = await client
        .post('/auth/password')
        .send({ ...change, newPassword: validBody.password })
        .expect(400);

      expect(res.body.message).toBe(
        'New password must differ from the current one',
      );
    });

    it.each([
      ['no body', {}],
      ['a short new password', { ...change, newPassword: 'curta' }],
      ['an empty current password', { ...change, currentPassword: '' }],
      ['a too long new password', { ...change, newPassword: 'a'.repeat(129) }],
      ['a non-string field', { ...change, newPassword: 12345678 }],
      ['an unknown field', { ...change, userId: 2 }],
    ])('returns 400 for %s', async (_, body) => {
      const { client } = await register();

      await client.post('/auth/password').send(body).expect(400);
      await login(validBody.password).expect(200);
    });

    it('requires a session', async () => {
      await http().post('/auth/password').send(change).expect(401);
    });

    it("never changes another user's password", async () => {
      const a = await register(validBody);
      const b = await register(otherBody);

      // The owner always comes from the session, never from the body
      await a.client
        .post('/auth/password')
        .send({ ...change, userId: b.res.body.id })
        .expect(400);
      await a.client.post('/auth/password').send(change).expect(200);

      await login(otherBody.password, otherBody.email).expect(200);
      await login(change.newPassword, otherBody.email).expect(401);
      await b.client.get('/auth/me').expect(200);
      await b.client.post('/auth/refresh').expect(200);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session and clears both cookies', async () => {
      const { client, res } = await register();
      const refresh = cookieValue(res, 'refresh_token');

      const out = await client.post('/auth/logout').expect(204);

      expect(cookie(out, 'access_token')).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(cookie(out, 'refresh_token')).toMatch(
        /Path=\/auth; Expires=Thu, 01 Jan 1970/,
      );
      await client.get('/auth/me').expect(401);
      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${refresh}`)
        .expect(401);
    });

    it('is idempotent without a session', async () => {
      await http().post('/auth/logout').expect(204);
    });
  });

  describe('isolation between users', () => {
    it('each session only sees its own user', async () => {
      const a = await register(validBody);
      const b = await register(otherBody);

      expect((await a.client.get('/auth/me').expect(200)).body.email).toBe(
        'ana@example.com',
      );
      expect((await b.client.get('/auth/me').expect(200)).body.email).toBe(
        'bruno@example.com',
      );
    });

    it("signing out one user keeps the other user's session", async () => {
      const a = await register(validBody);
      const b = await register(otherBody);

      await a.client.post('/auth/logout').expect(204);

      await b.client.get('/auth/me').expect(200);
      await b.client.post('/auth/refresh').expect(200);
    });

    it("one user's refresh secret does not open another user's session", async () => {
      const a = await register(validBody);
      const b = await register(otherBody);
      const [, secretA] = cookieValue(a.res, 'refresh_token')!.split('.');
      const [sessionB] = cookieValue(b.res, 'refresh_token')!.split('.');

      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${sessionB}.${secretA}`)
        .expect(401);
    });

    it('several sign-ins open independent sessions', async () => {
      const { client: first } = await register();
      const second = agent();
      await second
        .post('/auth/login')
        .send({ email: validBody.email, password: validBody.password })
        .expect(200);

      await first.post('/auth/logout').expect(204);

      await second.post('/auth/refresh').expect(200);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createGroup } from './groups.js';
import { mailOf, tokenFrom } from './mail.js';
import { createTestApp, resetDatabase, signUp, userBody } from './utils.js';

const ana = userBody('Ana Souza', 'ana@example.com');
const { email: _email, ...signupData } = userBody(
  'Diego Alves',
  'diego@example.com',
);

describe('Account activation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());
  const login = (email = 'ana@example.com', password = 'segredo123') =>
    http().post('/auth/login').send({ email, password });
  const lastToken = (email = 'ana@example.com') =>
    tokenFrom(mailOf(app).lastTo(email));

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('sign-up', () => {
    beforeEach(async () => {
      await http().post('/auth/register').send(ana).expect(201);
    });

    it('e-mails a link to the web that lasts 72 hours', async () => {
      const mail = mailOf(app).lastTo('ana@example.com');

      expect(mail.subject).toBe('Ative sua conta no Budget');
      expect(mail.text).toContain('Olá, Ana Souza!');
      expect(mail.text).toMatch(
        /http:\/\/web\.test\/ativar-conta\?token=[A-Za-z0-9_-]{43}/,
      );
      expect(mail.text).toContain('72 horas');
      expect(mail.html).toContain('Ativar minha conta');

      const stored = await prisma.activationToken.findFirstOrThrow();
      // Only the hash is stored
      expect(stored.tokenHash).not.toBe(tokenFrom(mail));
      const hours =
        (stored.expiresAt.getTime() - stored.createdAt.getTime()) / 3_600_000;
      expect(Math.round(hours)).toBe(72);
    });

    it('blocks the password sign-in until the activation (403 only with the right password)', async () => {
      const res = await login().expect(403);
      expect(res.body.message).toBe('Account not activated');
      expect(res.get('Set-Cookie')).toBeUndefined();
      await login('ana@example.com', 'errada123').expect(401);
    });

    it('tells what the link is for, without using it', async () => {
      const token = lastToken();

      for (let i = 0; i < 2; i++) {
        const res = await http()
          .get('/auth/activation')
          .query({ token })
          .expect(200);
        expect(res.body).toEqual({
          email: 'ana@example.com',
          name: 'Ana Souza',
          kind: 'ACTIVATE',
        });
      }
    });

    it('activates once, opening a session; then the password works', async () => {
      const token = lastToken();
      const client = request.agent(app.getHttpServer());

      const res = await client
        .post('/auth/activation')
        .send({ token })
        .expect(200);
      expect(res.body).toEqual({
        id: expect.any(Number),
        email: 'ana@example.com',
        name: 'Ana Souza',
        needsProfile: false,
        hasPassword: true,
      });
      await client.get('/auth/me').expect(200);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(user.emailVerifiedAt).toBeInstanceOf(Date);
      expect(await prisma.activationToken.count()).toBe(0);

      await http().post('/auth/activation').send({ token }).expect(404);
      await http().get('/auth/activation').query({ token }).expect(404);
      await login().expect(200);
    });

    it('rejects an expired link', async () => {
      const token = lastToken();
      await prisma.activationToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await http()
        .post('/auth/activation')
        .send({ token })
        .expect(404);
      expect(res.body.message).toBe('Invalid or expired activation link');
      await login().expect(403);
    });

    it.each(['x'.repeat(43), 'not-a-token'])(
      'rejects an unknown link (%s)',
      async (token) => {
        await http().post('/auth/activation').send({ token }).expect(404);
        await http().get('/auth/activation').query({ token }).expect(404);
      },
    );

    it('validates the bodies', async () => {
      await http().post('/auth/activation').send({}).expect(400);
      await http().get('/auth/activation').expect(400);
      const res = await http()
        .post('/auth/activation')
        .send({ token: lastToken(), userId: 1 })
        .expect(400);
      expect(res.body.message).toContain('property userId should not exist');
    });

    it("refuses a sign-up's link on the pre-registration form", async () => {
      const res = await http()
        .post('/auth/activation/signup')
        .send({ ...signupData, token: lastToken() })
        .expect(400);
      expect(res.body.message).toBe('Account already registered');
    });

    it('signing up again takes over the account not yet activated', async () => {
      const first = lastToken();
      await http()
        .post('/auth/register')
        .send({ ...ana, name: 'Ana Lima', password: 'outrasenha1' })
        .expect(201);

      // The first link no longer works, the new one does
      await http().post('/auth/activation').send({ token: first }).expect(404);
      const res = await http()
        .post('/auth/activation')
        .send({ token: lastToken() })
        .expect(200);
      expect(res.body.name).toBe('Ana Lima');
      expect(await prisma.user.count()).toBe(1);
      await login().expect(401);
      await login('ana@example.com', 'outrasenha1').expect(200);

      // Once active, the e-mail is taken
      await http().post('/auth/register').send(ana).expect(409);
    });

    it('still creates the account when the e-mail cannot be sent', async () => {
      mailOf(app).failing = true;
      await http()
        .post('/auth/register')
        .send(userBody('Bruno', 'bruno@example.com'))
        .expect(201);
      mailOf(app).failing = false;

      // The person asks for it again
      await http()
        .post('/auth/activation/resend')
        .send({ email: 'bruno@example.com' })
        .expect(204);
      await http()
        .post('/auth/activation')
        .send({ token: lastToken('bruno@example.com') })
        .expect(200);
    });
  });

  describe('POST /auth/activation/resend', () => {
    it('sends a new link that replaces the previous one', async () => {
      await http().post('/auth/register').send(ana).expect(201);
      const first = lastToken();

      await http()
        .post('/auth/activation/resend')
        .send({ email: ' ANA@example.com ' })
        .expect(204);

      expect(mailOf(app).to('ana@example.com')).toHaveLength(2);
      await http().post('/auth/activation').send({ token: first }).expect(404);
      await http()
        .post('/auth/activation')
        .send({ token: lastToken() })
        .expect(200);
    });

    it('answers the same for unknown and active e-mails, sending nothing', async () => {
      await signUp(app, 'Ana Souza', 'ana@example.com');
      mailOf(app).clear();

      await http()
        .post('/auth/activation/resend')
        .send({ email: 'ana@example.com' })
        .expect(204);
      await http()
        .post('/auth/activation/resend')
        .send({ email: 'ninguem@example.com' })
        .expect(204);
      expect(mailOf(app).outbox).toEqual([]);
    });

    it('validates the e-mail', async () => {
      await http()
        .post('/auth/activation/resend')
        .send({ email: 'ana@' })
        .expect(400);
      await http()
        .post('/auth/activation/resend')
        .send({ email: 'ana@example.com', extra: 1 })
        .expect(400);
    });

    it('is rate limited', async () => {
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/auth/activation/resend')
          .send({ email: 'ana@example.com' })
          .expect(204);
      }
      await http()
        .post('/auth/activation/resend')
        .send({ email: 'ana@example.com' })
        .expect(429);
    });
  });

  describe('pre-registration (added to a group)', () => {
    let groupId: number;

    beforeEach(async () => {
      const owner = await signUp(app, 'Ana Souza', 'ana@example.com');
      groupId = (await createGroup(owner)).id;
      await owner
        .post(`/groups/${groupId}/invitations`)
        .send({ email: 'diego@example.com', nickname: 'Didi' })
        .expect(201);
    });

    it('finishes the sign-up through the link, active and in the group', async () => {
      const client = request.agent(app.getHttpServer());
      const token = lastToken('diego@example.com');

      const res = await client
        .post('/auth/activation/signup')
        .send({ ...signupData, token })
        .expect(200);
      expect(res.body).toEqual({
        id: expect.any(Number),
        email: 'diego@example.com',
        name: 'Diego Alves',
        needsProfile: false,
        hasPassword: true,
      });
      const groups = (await client.get('/groups').expect(200)).body as {
        id: number;
      }[];
      expect(groups.map((g) => g.id)).toEqual([groupId]);
      const profile = await client.get('/users/me').expect(200);
      expect(profile.body).toMatchObject({
        birthDate: '1990-05-20',
        cep: '01001000',
        city: 'São Paulo',
        state: 'SP',
      });

      await http()
        .post('/auth/activation/signup')
        .send({ ...signupData, token })
        .expect(404);
      await login('diego@example.com').expect(200);
    });

    it('needs the sign-up data (400 on the plain activation)', async () => {
      const res = await http()
        .post('/auth/activation')
        .send({ token: lastToken('diego@example.com') })
        .expect(400);
      expect(res.body.message).toBe('Sign-up data required');
    });

    it('validates the sign-up data like the sign-up', async () => {
      const token = lastToken('diego@example.com');

      const invalid = await http()
        .post('/auth/activation/signup')
        .send({ ...signupData, token, password: 'curta', cep: '123' })
        .expect(400);
      expect(invalid.body.message).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^password/),
          expect.stringMatching(/^cep/),
        ]),
      );
      // The e-mail comes from the link, never from the body
      const withEmail = await http()
        .post('/auth/activation/signup')
        .send({ ...signupData, token, email: 'outro@example.com' })
        .expect(400);
      expect(withEmail.body.message).toContain(
        'property email should not exist',
      );
      await http()
        .post('/auth/activation/signup')
        .send({ ...signupData })
        .expect(400);
    });

    it('resends the pre-registration link', async () => {
      await http()
        .post('/auth/activation/resend')
        .send({ email: 'diego@example.com' })
        .expect(204);

      const mail = mailOf(app).lastTo('diego@example.com');
      expect(mail.subject).toBe('Conclua seu cadastro no Budget');
      await http()
        .get('/auth/activation')
        .query({ token: tokenFrom(mail) })
        .expect(200);
    });

    it('rejects an unknown link', async () => {
      await http()
        .post('/auth/activation/signup')
        .send({ ...signupData, token: 'x'.repeat(43) })
        .expect(404);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createGroup } from './groups.js';
import { mailOf, tokenFrom } from './mail.js';
import {
  type Agent,
  createTestApp,
  resetDatabase,
  signUp,
  userBody,
} from './utils.js';

const NEW_PASSWORD = 'novaSenha456';

describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());
  const login = (email = 'ana@example.com', password = 'segredo123') =>
    http().post('/auth/login').send({ email, password });
  const forgot = (email = 'ana@example.com') =>
    http().post('/auth/password/forgot').send({ email });
  const lastResetToken = (email = 'ana@example.com') =>
    tokenFrom(mailOf(app).lastTo(email), 'redefinir-senha');
  const reset = (token: string, password = NEW_PASSWORD, client?: Agent) =>
    (client ?? http()).post('/auth/password/reset').send({ token, password });

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/password/forgot', () => {
    let ana: Agent;

    beforeEach(async () => {
      ana = await signUp(app, 'Ana Souza', 'ana@example.com');
      mailOf(app).clear();
    });

    it('e-mails a link to the web that lasts 60 minutes', async () => {
      await forgot(' Ana@Example.com ').expect(204);

      const mail = mailOf(app).lastTo('ana@example.com');
      expect(mail.subject).toBe('Redefina sua senha no Budget');
      expect(mail.text).toContain('Olá, Ana Souza!');
      expect(mail.text).toMatch(
        /http:\/\/web\.test\/redefinir-senha\?token=[A-Za-z0-9_-]{43}/,
      );
      expect(mail.text).toContain('60 minutos');
      expect(mail.html).toContain('Redefinir senha');
    });

    it('answers the same for an unknown e-mail, sending nothing', async () => {
      await forgot('ninguem@example.com').expect(204);

      expect(mailOf(app).outbox).toHaveLength(0);
    });

    it('still answers 204 when the e-mail cannot be sent', async () => {
      mailOf(app).failing = true;

      await forgot().expect(204);
    });

    it('does not change the password until the link is used', async () => {
      await forgot().expect(204);

      await login().expect(200);
    });

    it.each([
      [{}, 'missing e-mail'],
      [{ email: 'not-an-email' }, 'invalid e-mail'],
      [{ email: 'ana@example.com', extra: 1 }, 'unknown field'],
    ])('rejects %j (%s) with 400', async (body) => {
      await http().post('/auth/password/forgot').send(body).expect(400);
      expect(mailOf(app).outbox).toHaveLength(0);
    });

    it('sends the sign-up link to a pre-registration', async () => {
      const group = await createGroup(ana);
      await ana
        .post(`/groups/${group.id}/invitations`)
        .send({ email: 'diego@example.com', nickname: 'Didi' })
        .expect(201);
      mailOf(app).clear();

      await forgot('diego@example.com').expect(204);

      const mail = mailOf(app).lastTo('diego@example.com');
      expect(mail.subject).toBe('Conclua seu cadastro no Budget');
      expect(tokenFrom(mail)).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await prisma.passwordResetToken.count()).toBe(0);
    });
  });

  describe('GET /auth/password/reset', () => {
    beforeEach(async () => {
      await signUp(app, 'Ana Souza', 'ana@example.com');
      await forgot().expect(204);
    });

    it('describes the link without using it', async () => {
      const token = lastResetToken();

      const res = await http()
        .get('/auth/password/reset')
        .query({ token })
        .expect(200);
      expect(res.body).toEqual({ email: 'ana@example.com', name: 'Ana Souza' });

      await http().get('/auth/password/reset').query({ token }).expect(200);
    });

    it('is 404 for an unknown or malformed token', async () => {
      await http()
        .get('/auth/password/reset')
        .query({ token: 'b'.repeat(43) })
        .expect(404);
      await http()
        .get('/auth/password/reset')
        .query({ token: 'nope' })
        .expect(404);
    });

    it('is 400 without a token', async () => {
      await http().get('/auth/password/reset').expect(400);
    });

    it('is 404 for an expired link', async () => {
      const token = lastResetToken();
      await prisma.passwordResetToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await http().get('/auth/password/reset').query({ token }).expect(404);
      await reset(token).expect(404);
    });

    it('does not accept an activation link', async () => {
      await http()
        .post('/auth/register')
        .send(userBody('Bia Lima', 'bia@example.com'));
      const activationToken = tokenFrom(mailOf(app).lastTo('bia@example.com'));

      await http()
        .get('/auth/password/reset')
        .query({ token: activationToken })
        .expect(404);
    });
  });

  describe('POST /auth/password/reset', () => {
    let ana: Agent;

    beforeEach(async () => {
      ana = await signUp(app, 'Ana Souza', 'ana@example.com');
      await forgot().expect(204);
    });

    it('sets the new password and opens a session', async () => {
      const client = request.agent(app.getHttpServer());

      const res = await reset(lastResetToken(), NEW_PASSWORD, client).expect(
        200,
      );

      expect(res.body).toEqual({
        id: expect.any(Number),
        email: 'ana@example.com',
        name: 'Ana Souza',
        needsProfile: false,
        hasPassword: true,
      });
      await client.get('/auth/me').expect(200);
      await login('ana@example.com', NEW_PASSWORD).expect(200);
      await login().expect(401);
    });

    it('ends the other sessions and warns by e-mail', async () => {
      await reset(lastResetToken()).expect(200);

      await ana.post('/auth/refresh').expect(401);
      const mail = mailOf(app).lastTo('ana@example.com');
      expect(mail.subject).toBe('Sua senha do Budget foi alterada');
      expect(mail.text).toContain('http://web.test/login');
    });

    it('works only once', async () => {
      const token = lastResetToken();
      await reset(token).expect(200);

      await reset(token, 'outraSenha789').expect(404);
      await login('ana@example.com', NEW_PASSWORD).expect(200);
    });

    it('a new request replaces the previous link', async () => {
      const first = lastResetToken();
      await forgot().expect(204);
      const second = lastResetToken();

      await reset(first).expect(404);
      await reset(second).expect(200);
    });

    it('a password change drops a pending link', async () => {
      const token = lastResetToken();
      await ana
        .post('/auth/password')
        .send({ currentPassword: 'segredo123', newPassword: 'trocada123' })
        .expect(200);

      await reset(token).expect(404);
      await login('ana@example.com', 'trocada123').expect(200);
    });

    it.each([
      [{ password: 'curta' }, 'short password'],
      [{ password: 'x'.repeat(129) }, 'long password'],
      [{}, 'missing password'],
      [{ password: NEW_PASSWORD, extra: 1 }, 'unknown field'],
    ])('rejects %j (%s) with 400, keeping the link', async (body) => {
      const token = lastResetToken();

      await http()
        .post('/auth/password/reset')
        .send({ token, ...body })
        .expect(400);
      await http().get('/auth/password/reset').query({ token }).expect(200);
    });

    it('is 404 for an unknown token, changing nothing', async () => {
      await reset('c'.repeat(43)).expect(404);

      await login().expect(200);
    });

    it("only changes the link owner's password", async () => {
      await signUp(app, 'Bruno Costa', 'bruno@example.com');

      await reset(lastResetToken()).expect(200);

      await login('bruno@example.com').expect(200);
    });
  });

  it('activates an account that was not activated yet', async () => {
    await http()
      .post('/auth/register')
      .send(userBody('Ana Souza', 'ana@example.com'))
      .expect(201);
    await login().expect(403);
    await forgot().expect(204);

    await reset(lastResetToken()).expect(200);

    await login('ana@example.com', NEW_PASSWORD).expect(200);
    const activation = await http()
      .get('/auth/activation')
      .query({ token: tokenFrom(mailOf(app).to('ana@example.com')[0]) });
    expect(activation.status).toBe(404);
  });

  it('gives a password to an account created by GitHub/Google sign-in', async () => {
    await prisma.user.create({
      data: {
        email: 'ana@example.com',
        name: 'Ana Souza',
        emailVerifiedAt: new Date(),
      },
    });
    await forgot().expect(204);

    const res = await reset(lastResetToken()).expect(200);

    expect(res.body).toMatchObject({ hasPassword: true, needsProfile: true });
    await login('ana@example.com', NEW_PASSWORD).expect(200);
  });
});

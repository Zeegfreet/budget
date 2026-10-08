import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  type Agent,
  createTestApp,
  resetDatabase,
  signUp,
  userBody,
} from './utils.js';

const anaProfile = {
  id: expect.any(Number),
  email: 'ana@example.com',
  name: 'Ana Souza',
  birthDate: '1990-05-20',
  cep: '01001000',
  city: 'São Paulo',
  state: 'SP',
};

describe('Users / profile (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let bruno: Agent;

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await signUp(app, 'Ana Souza', 'ana@example.com');
    bruno = await signUp(app, 'Bruno Lima', 'bruno@example.com');
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires a session', async () => {
    const anonymous = request(app.getHttpServer());
    await anonymous.get('/users/me').expect(401);
    await anonymous.patch('/users/me').send({ name: 'X' }).expect(401);
  });

  it('returns the sign-up data', async () => {
    const res = await ana.get('/users/me').expect(200);
    expect(res.body).toEqual(anaProfile);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('updates only the given fields', async () => {
    const res = await ana
      .patch('/users/me')
      .send({ name: '  Ana Lima  ', birthDate: '1985-12-31' })
      .expect(200);
    expect(res.body).toEqual({
      ...anaProfile,
      name: 'Ana Lima',
      birthDate: '1985-12-31',
    });

    await ana.get('/users/me').expect(200, res.body);
    const me = await ana.get('/auth/me').expect(200);
    expect(me.body).toMatchObject({ name: 'Ana Lima' });
  });

  it('updates the address as a block', async () => {
    const res = await ana
      .patch('/users/me')
      .send({ cep: '20040002', city: ' Rio de Janeiro ', state: 'rj' })
      .expect(200);
    expect(res.body).toEqual({
      ...anaProfile,
      cep: '20040002',
      city: 'Rio de Janeiro',
      state: 'RJ',
    });
  });

  it('accepts an empty body', async () => {
    const res = await ana.patch('/users/me').send({}).expect(200);
    expect(res.body).toEqual(anaProfile);
  });

  it.each([
    ['an incomplete address', { cep: '20040002' }],
    ['a city without the CEP', { city: 'Recife', state: 'PE' }],
    ['a masked CEP', { cep: '20040-002', city: 'Rio', state: 'RJ' }],
    ['an unknown UF', { cep: '20040002', city: 'Rio', state: 'XX' }],
    [
      'an underage birth date',
      { birthDate: new Date().toISOString().slice(0, 10) },
    ],
    ['an impossible date', { birthDate: '1990-02-30' }],
    ['a short name', { name: ' A ' }],
    ['a null name', { name: null }],
    ['the e-mail', { email: 'other@example.com' }],
    ['the password', { password: 'novaSenha123' }],
    ['the id', { id: 99 }],
  ])('rejects %s with 400', async (_case, body) => {
    await ana.patch('/users/me').send(body).expect(400);
    const res = await ana.get('/users/me').expect(200);
    expect(res.body).toEqual(anaProfile);
  });

  it("never touches another user's profile", async () => {
    await ana.patch('/users/me').send({ name: 'Ana Lima' }).expect(200);

    const res = await bruno.get('/users/me').expect(200);
    expect(res.body).toEqual({
      ...anaProfile,
      email: 'bruno@example.com',
      name: 'Bruno Lima',
    });
  });

  it('keeps the credentials working after an update', async () => {
    await ana.patch('/users/me').send({ name: 'Ana Lima' }).expect(200);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ana@example.com', password: userBody('', '').password })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Ana Lima' });
  });
});

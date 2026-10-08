import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import request from 'supertest';
import { createGroup, type GroupDetail, splitMethods } from './groups.js';
import { mailOf, tokenFrom } from './mail.js';
import {
  type Agent,
  createTestApp,
  resetDatabase,
  signUp,
  userBody,
} from './utils.js';

interface Received {
  id: number;
  group: { id: number; name: string };
  inviter: { id: number; name: string; email: string };
}

describe('Group invitations (e2e)', () => {
  let app: INestApplication<App>;
  let ana: Agent;
  let bruno: Agent;
  let carla: Agent;
  let group: GroupDetail;

  const invite = (
    client: Agent,
    email: string,
    groupId = group.id,
    nickname?: string,
  ) => client.post(`/groups/${groupId}/invitations`).send({ email, nickname });

  const members = async (client: Agent, groupId = group.id) =>
    (
      (await client.get(`/groups/${groupId}`).expect(200)).body as {
        members: {
          id: number;
          userId: number;
          name: string;
          email: string;
          pending: boolean;
        }[];
      }
    ).members;

  const received = async (client: Agent) =>
    (await client.get('/invitations').expect(200)).body as Received[];

  beforeEach(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    ana = await signUp(app, 'Ana Souza', 'ana@example.com');
    bruno = await signUp(app, 'Bruno Lima', 'bruno@example.com');
    carla = await signUp(app, 'Carla Dias', 'carla@example.com');
    group = await createGroup(ana);
  });

  afterEach(async () => {
    await app.close();
  });

  it('invites a registered user, who accepts and gains access', async () => {
    const res = await invite(ana, '  Bruno@Example.com ').expect(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      invitee: {
        name: 'Bruno Lima',
        email: 'bruno@example.com',
        pending: false,
      },
      inviter: { name: 'Ana Souza', email: 'ana@example.com' },
    });
    expect(
      (await ana.get(`/groups/${group.id}/invitations`).expect(200)).body,
    ).toHaveLength(1);

    const [invitation] = await received(bruno);
    expect(invitation).toMatchObject({
      group: { id: group.id, name: 'República' },
      inviter: { name: 'Ana Souza' },
    });

    await bruno.post(`/invitations/${invitation.id}/accept`).expect(204);
    const detail = await bruno.get(`/groups/${group.id}`).expect(200);
    expect(detail.body).toMatchObject({ role: 'MEMBER', memberCount: 2 });
    expect(await received(bruno)).toEqual([]);
    expect(
      (await ana.get(`/groups/${group.id}/invitations`).expect(200)).body,
    ).toEqual([]);
    // Already answered
    await bruno.post(`/invitations/${invitation.id}/accept`).expect(404);
  });

  it('lets a new member invite others too', async () => {
    const res = await invite(ana, 'bruno@example.com').expect(201);
    await bruno.post(`/invitations/${res.body.id}/accept`).expect(204);

    await invite(bruno, 'carla@example.com').expect(201);
    expect(await received(carla)).toHaveLength(1);
  });

  it('declines an invitation without joining', async () => {
    const res = await invite(ana, 'bruno@example.com').expect(201);

    await bruno.post(`/invitations/${res.body.id}/decline`).expect(204);
    await bruno.get(`/groups/${group.id}`).expect(404);
    expect(await received(bruno)).toEqual([]);
    // May be invited again
    await invite(ana, 'bruno@example.com').expect(201);
  });

  it('cancels a pending invitation', async () => {
    const res = await invite(ana, 'bruno@example.com').expect(201);

    await ana
      .delete(`/groups/${group.id}/invitations/${res.body.id}`)
      .expect(204);
    expect(await received(bruno)).toEqual([]);
    await bruno.post(`/invitations/${res.body.id}/accept`).expect(404);
    await ana
      .delete(`/groups/${group.id}/invitations/${res.body.id}`)
      .expect(404);
  });

  it('rejects unknown e-mails without nickname, self, members and duplicate invitations', async () => {
    const missing = await invite(ana, 'nobody@example.com').expect(400);
    expect(missing.body.message).toBe(
      'Nickname required for an unregistered e-mail',
    );
    await invite(ana, 'ana@example.com').expect(400);

    await invite(ana, 'bruno@example.com').expect(201);
    const dup = await invite(ana, 'bruno@example.com').expect(409);
    expect(dup.body.message).toBe('Already invited');

    const [invitation] = await received(bruno);
    await bruno.post(`/invitations/${invitation.id}/accept`).expect(204);
    const member = await invite(ana, 'bruno@example.com').expect(409);
    expect(member.body.message).toBe('Already a member');
  });

  describe('pre-registration', () => {
    const login = (email: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'segredo123' });

    it('pre-registers an unknown e-mail, who joins right away under the nickname', async () => {
      const res = await invite(
        ana,
        ' Diego@Example.com',
        group.id,
        '  Didi ',
      ).expect(201);
      expect(res.body).toMatchObject({
        status: 'ACCEPTED',
        invitee: { name: 'Didi', email: 'diego@example.com', pending: true },
        inviter: { name: 'Ana Souza' },
      });
      // Not a pending invitation
      expect(
        (await ana.get(`/groups/${group.id}/invitations`).expect(200)).body,
      ).toEqual([]);

      const list = await members(ana);
      expect(list).toEqual([
        expect.objectContaining({ name: 'Ana Souza', pending: false }),
        expect.objectContaining({
          name: 'Didi',
          email: 'diego@example.com',
          pending: true,
          role: 'MEMBER',
        }),
      ]);

      // Enters the equal split and the balance
      const [equal] = await splitMethods(ana, group.id);
      const tx = await ana
        .post(`/groups/${group.id}/transactions`)
        .send({
          kind: 'EXPENSE',
          description: 'Aluguel',
          month: '2026-10',
          amountCents: 100000,
          splitMethodId: equal.id,
          paidByMemberId: list[1].id,
        })
        .expect(201);
      expect(tx.body[0]).toMatchObject({
        paidBy: { memberId: list[1].id, name: 'Didi' },
        shares: [
          { name: 'Ana Souza', amountCents: 50000 },
          { name: 'Didi', amountCents: 50000 },
        ],
      });
      await invite(ana, 'diego@example.com').expect(409);
    });

    it('cannot sign in until the person signs up, then takes the place over', async () => {
      await invite(ana, 'diego@example.com', group.id, 'Didi').expect(201);
      const [, placeholder] = await members(ana);
      await login('diego@example.com').expect(401);

      const diego = request.agent(app.getHttpServer());
      await diego
        .post('/auth/register')
        .send(userBody('Diego Alves', 'Diego@example.com'))
        .expect(201);
      // A sign-up (not the invitation's link) still needs activating
      await login('diego@example.com').expect(403);
      const { subject } = mailOf(app).lastTo('diego@example.com');
      expect(subject).toBe('Ative sua conta no Budget');
      const res = await diego
        .post('/auth/activation')
        .send({ token: tokenFrom(mailOf(app).lastTo('diego@example.com')) })
        .expect(200);
      expect(res.body).toMatchObject({
        id: placeholder.userId,
        name: 'Diego Alves',
      });

      // Same membership, with the real name, for everyone
      expect((await members(diego))[1]).toMatchObject({
        id: placeholder.id,
        name: 'Diego Alves',
        pending: false,
      });
      expect(
        ((await diego.get('/groups').expect(200)).body as { id: number }[]).map(
          (g) => g.id,
        ),
      ).toEqual([group.id]);
      await login('diego@example.com').expect(200);

      // Registered once
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(userBody('Outro', 'diego@example.com'))
        .expect(409);
    });

    it('e-mails the pre-registration a link that finishes the sign-up', async () => {
      await invite(ana, 'diego@example.com', group.id, 'Didi').expect(201);

      const mail = mailOf(app).lastTo('diego@example.com');
      expect(mail.subject).toBe(
        'Ana Souza adicionou você ao grupo "República" no Budget',
      );
      expect(mail.text).toContain('Olá, Didi!');
      expect(mail.text).toContain('http://web.test/ativar-conta?token=');

      const http = request(app.getHttpServer());
      const info = await http
        .get('/auth/activation')
        .query({ token: tokenFrom(mail) })
        .expect(200);
      expect(info.body).toEqual({
        email: 'diego@example.com',
        name: 'Didi',
        kind: 'COMPLETE_SIGNUP',
      });
    });

    it('e-mails a registered user a notice of the invitation', async () => {
      mailOf(app).clear();
      await invite(ana, 'carla@example.com').expect(201);

      expect(mailOf(app).outbox).toHaveLength(1);
      const mail = mailOf(app).lastTo('carla@example.com');
      expect(mail.subject).toBe(
        'Ana Souza convidou você para o grupo "República" no Budget',
      );
      expect(mail.text).toContain('http://web.test/grupos');
      expect(mail.text).not.toContain('token=');
    });

    it('e-mails nobody when the invitation is refused', async () => {
      await invite(ana, 'carla@example.com').expect(201);
      mailOf(app).clear();

      await invite(ana, 'carla@example.com').expect(409);
      await invite(ana, 'novo@example.com').expect(400);
      await invite(ana, 'ana@example.com').expect(400);
      expect(mailOf(app).outbox).toEqual([]);
    });

    it('still adds the member when the e-mail cannot be sent', async () => {
      mailOf(app).failing = true;

      await invite(ana, 'diego@example.com', group.id, 'Didi').expect(201);
      expect(await members(ana)).toHaveLength(2);
    });

    it('lets another group add the same pre-registration, keeping its name', async () => {
      await invite(ana, 'diego@example.com', group.id, 'Didi').expect(201);
      const other = await createGroup(bruno, 'Viagem');

      const res = await invite(
        bruno,
        'diego@example.com',
        other.id,
        'Diego',
      ).expect(201);
      expect(res.body.invitee).toMatchObject({ name: 'Didi', pending: true });
      // An existing pre-registration doesn't need a nickname
      const third = await createGroup(carla, 'Trabalho');
      await invite(carla, 'diego@example.com', third.id).expect(201);
      expect((await members(bruno, other.id))[1].name).toBe('Didi');
      // One e-mail per group; only the newest link works
      const mails = mailOf(app).to('diego@example.com');
      expect(mails.map((m) => m.subject)).toEqual([
        'Ana Souza adicionou você ao grupo "República" no Budget',
        expect.stringContaining('"Viagem"'),
        expect.stringContaining('"Trabalho"'),
      ]);
      const http = request(app.getHttpServer());
      await http
        .get('/auth/activation')
        .query({ token: tokenFrom(mails[0]) })
        .expect(404);
      await http
        .get('/auth/activation')
        .query({ token: tokenFrom(mails[2]) })
        .expect(200);
    });

    it('removes a pre-registered member like any other', async () => {
      await invite(ana, 'diego@example.com', group.id, 'Didi').expect(201);
      const [, didi] = await members(ana);

      await ana.delete(`/groups/${group.id}/members/${didi.id}`).expect(204);
      expect(await members(ana)).toHaveLength(1);
      // Adding again brings the same person back
      await invite(ana, 'diego@example.com').expect(201);
      expect((await members(ana))[1]).toMatchObject({ id: didi.id });
    });

    it('validates the nickname and keeps non-members out', async () => {
      await invite(ana, 'diego@example.com', group.id, 'D').expect(400);
      await invite(ana, 'diego@example.com', group.id, 'x'.repeat(101)).expect(
        400,
      );
      await ana
        .post(`/groups/${group.id}/invitations`)
        .send({ email: 'diego@example.com', nickname: 7 })
        .expect(400);
      await invite(carla, 'diego@example.com', group.id, 'Didi').expect(404);
      expect(await members(ana)).toHaveLength(1);
      // Nothing was pre-registered: signing up works as usual
      await signUp(app, 'Diego Alves', 'diego@example.com');
    });
  });

  it('validates the body', async () => {
    await invite(ana, 'not-an-email').expect(400);
    await ana.post(`/groups/${group.id}/invitations`).send({}).expect(400);
    await ana
      .post(`/groups/${group.id}/invitations`)
      .send({ email: 'bruno@example.com', role: 'OWNER' })
      .expect(400);
  });

  describe('isolation between users', () => {
    it('only lets the invitee answer an invitation', async () => {
      const res = await invite(ana, 'bruno@example.com').expect(201);

      await carla.post(`/invitations/${res.body.id}/accept`).expect(404);
      await carla.post(`/invitations/${res.body.id}/decline`).expect(404);
      await ana.post(`/invitations/${res.body.id}/accept`).expect(404);
      expect(await received(carla)).toEqual([]);
      await carla.get(`/groups/${group.id}`).expect(404);
    });

    it("hides a group's invitations from non-members", async () => {
      const res = await invite(ana, 'bruno@example.com').expect(201);

      await carla.get(`/groups/${group.id}/invitations`).expect(404);
      await carla
        .delete(`/groups/${group.id}/invitations/${res.body.id}`)
        .expect(404);
      // The pending invitee isn't a member yet either
      await bruno.get(`/groups/${group.id}/invitations`).expect(404);
      await invite(bruno, 'carla@example.com').expect(404);
    });

    it('cuts a former member off', async () => {
      const res = await invite(ana, 'bruno@example.com').expect(201);
      await bruno.post(`/invitations/${res.body.id}/accept`).expect(204);
      await bruno.post(`/groups/${group.id}/leave`).expect(204);

      await bruno.get(`/groups/${group.id}/invitations`).expect(404);
      await invite(bruno, 'carla@example.com').expect(404);
    });
  });
});

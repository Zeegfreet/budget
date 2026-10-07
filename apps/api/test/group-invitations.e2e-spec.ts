import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { createGroup, type GroupDetail } from './groups.js';
import { type Agent, createTestApp, resetDatabase, signUp } from './utils.js';

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

  const invite = (client: Agent, email: string, groupId = group.id) =>
    client.post(`/groups/${groupId}/invitations`).send({ email });

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
      invitee: { name: 'Bruno Lima', email: 'bruno@example.com' },
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

  it('rejects unknown users, self, members and duplicate invitations', async () => {
    const missing = await invite(ana, 'nobody@example.com').expect(404);
    expect(missing.body.message).toBe('No user with this e-mail');
    await invite(ana, 'ana@example.com').expect(400);

    await invite(ana, 'bruno@example.com').expect(201);
    const dup = await invite(ana, 'bruno@example.com').expect(409);
    expect(dup.body.message).toBe('Already invited');

    const [invitation] = await received(bruno);
    await bruno.post(`/invitations/${invitation.id}/accept`).expect(204);
    const member = await invite(ana, 'bruno@example.com').expect(409);
    expect(member.body.message).toBe('Already a member');
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

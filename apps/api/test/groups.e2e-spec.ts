import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  addMember,
  createGroup,
  type GroupDetail,
  splitMethods,
} from './groups.js';
import { type Agent, createTestApp, resetDatabase, signUp } from './utils.js';

describe('Finance groups (e2e)', () => {
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
    await request(app.getHttpServer()).get('/groups').expect(401);
  });

  it('creates a group owned by its creator, with an equal split rule', async () => {
    const res = await ana
      .post('/groups')
      .send({ name: '  República ', description: 'Rua A, 10' })
      .expect(201);
    const group = res.body as GroupDetail;

    expect(group).toMatchObject({
      name: 'República',
      description: 'Rua A, 10',
      role: 'OWNER',
      memberCount: 1,
      members: [{ name: 'Ana Souza', email: 'ana@example.com', role: 'OWNER' }],
    });
    expect(group.memberId).toBe(group.members[0].id);
    expect(await splitMethods(ana, group.id)).toEqual([
      expect.objectContaining({
        name: 'Igualitário',
        type: 'EQUAL',
        active: true,
        shares: [],
      }),
    ]);

    const list = await ana.get('/groups').expect(200);
    expect(list.body).toEqual([
      {
        id: group.id,
        name: 'República',
        description: 'Rua A, 10',
        role: 'OWNER',
        memberCount: 1,
      },
    ]);
  });

  it('validates the body', async () => {
    await ana.post('/groups').send({ name: '' }).expect(400);
    await ana.post('/groups').send({}).expect(400);
    await ana.post('/groups').send({ name: 'Casa', ownerId: 2 }).expect(400);
    await ana
      .post('/groups')
      .send({ name: 'x'.repeat(61) })
      .expect(400);
    const group = await createGroup(ana);
    await ana.patch(`/groups/${group.id}`).send({ name: null }).expect(400);
    await ana.get('/groups/abc').expect(400);
  });

  it('lets the owner rename and delete the group', async () => {
    const group = await createGroup(ana);
    const res = await ana
      .patch(`/groups/${group.id}`)
      .send({ name: 'Casa da praia', description: null })
      .expect(200);
    expect(res.body).toMatchObject({
      name: 'Casa da praia',
      description: null,
    });

    await ana.delete(`/groups/${group.id}`).expect(204);
    await ana.get(`/groups/${group.id}`).expect(404);
    expect((await ana.get('/groups').expect(200)).body).toEqual([]);
  });

  it('only lets the owner rename, delete or remove members', async () => {
    const group = await createGroup(ana);
    const asBruno = await addMember(ana, bruno, group.id, 'bruno@example.com');
    expect(asBruno).toMatchObject({ role: 'MEMBER', memberCount: 2 });

    await bruno.patch(`/groups/${group.id}`).send({ name: 'X' }).expect(403);
    await bruno.delete(`/groups/${group.id}`).expect(403);
    await bruno
      .delete(`/groups/${group.id}/members/${group.memberId}`)
      .expect(403);
  });

  it('removes a member, revoking their access', async () => {
    const group = await createGroup(ana);
    const asBruno = await addMember(ana, bruno, group.id, 'bruno@example.com');

    await ana
      .delete(`/groups/${group.id}/members/${asBruno.memberId}`)
      .expect(204);

    await bruno.get(`/groups/${group.id}`).expect(404);
    expect((await bruno.get('/groups').expect(200)).body).toEqual([]);
    const detail = await ana.get(`/groups/${group.id}`).expect(200);
    expect((detail.body as GroupDetail).memberCount).toBe(1);
    // Already removed, or not a member of this group
    await ana
      .delete(`/groups/${group.id}/members/${asBruno.memberId}`)
      .expect(404);
    await ana
      .delete(`/groups/${group.id}/members/${group.memberId}`)
      .expect(400);
  });

  it('passes ownership on when the owner leaves, and deletes the group with the last member', async () => {
    const group = await createGroup(ana);
    await addMember(ana, bruno, group.id, 'bruno@example.com');

    await ana.post(`/groups/${group.id}/leave`).expect(204);
    await ana.get(`/groups/${group.id}`).expect(404);
    const res = await bruno.get(`/groups/${group.id}`).expect(200);
    expect(res.body).toMatchObject({ role: 'OWNER', memberCount: 1 });

    await bruno.post(`/groups/${group.id}/leave`).expect(204);
    await bruno.get(`/groups/${group.id}`).expect(404);
    await bruno.post(`/groups/${group.id}/leave`).expect(404);
  });

  it('lets a former member back in through a new invitation', async () => {
    const group = await createGroup(ana);
    await addMember(ana, bruno, group.id, 'bruno@example.com');
    await bruno.post(`/groups/${group.id}/leave`).expect(204);

    const again = await addMember(ana, bruno, group.id, 'bruno@example.com');
    expect(again).toMatchObject({ role: 'MEMBER', memberCount: 2 });
  });

  describe('isolation between users', () => {
    it('hides a group from non-members with 404', async () => {
      const group = await createGroup(ana);
      const base = `/groups/${group.id}`;

      await bruno.get(base).expect(404);
      await bruno.patch(base).send({ name: 'Minha' }).expect(404);
      await bruno.delete(base).expect(404);
      await bruno.post(`${base}/leave`).expect(404);
      await bruno.delete(`${base}/members/${group.memberId}`).expect(404);
      await bruno.get(`${base}/invitations`).expect(404);
      await bruno
        .post(`${base}/invitations`)
        .send({ email: 'bruno@example.com' })
        .expect(404);
      expect((await bruno.get('/groups').expect(200)).body).toEqual([]);

      const res = await ana.get(base).expect(200);
      expect(res.body).toMatchObject({ name: 'República', memberCount: 1 });
    });

    it('keeps a pending invitee out until they accept', async () => {
      const group = await createGroup(ana);
      await ana
        .post(`/groups/${group.id}/invitations`)
        .send({ email: 'bruno@example.com' })
        .expect(201);

      await bruno.get(`/groups/${group.id}`).expect(404);
      await bruno.get(`/groups/${group.id}/split-methods`).expect(404);
    });
  });
});

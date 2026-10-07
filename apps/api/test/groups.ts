import type { Agent } from './utils.js';

export interface Member {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: 'OWNER' | 'MEMBER';
}

export interface GroupDetail {
  id: number;
  name: string;
  description: string | null;
  role: 'OWNER' | 'MEMBER';
  memberId: number;
  memberCount: number;
  members: Member[];
}

export interface SplitMethod {
  id: number;
  name: string;
  type: string;
  active: boolean;
  shares: { memberId: number; value: number }[];
}

/** Creates a group owned by `client`. */
export async function createGroup(client: Agent, name = 'República') {
  const res = await client.post('/groups').send({ name }).expect(201);
  return res.body as GroupDetail;
}

/** `owner` invites `email` and `guest` accepts; returns the group as the guest sees it. */
export async function addMember(
  owner: Agent,
  guest: Agent,
  groupId: number,
  email: string,
) {
  const invitation = await owner
    .post(`/groups/${groupId}/invitations`)
    .send({ email })
    .expect(201);
  await guest
    .post(`/invitations/${(invitation.body as { id: number }).id}/accept`)
    .expect(204);
  const res = await guest.get(`/groups/${groupId}`).expect(200);
  return res.body as GroupDetail;
}

export async function splitMethods(client: Agent, groupId: number) {
  const res = await client.get(`/groups/${groupId}/split-methods`).expect(200);
  return res.body as SplitMethod[];
}

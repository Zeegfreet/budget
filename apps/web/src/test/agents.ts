import type { AgentGrant, AuthorizationRequest } from '@/features/agents/types'

/** A consent request from Claude asking for read and write access. */
export const makeAuthorizationRequest = (
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest => ({
  id: '22222222-2222-4222-8222-222222222222',
  client: { name: 'Claude' },
  redirectHost: 'claude.ai',
  scopes: ['budget:read', 'budget:write'],
  expiresAt: '2026-10-12T15:10:00.000Z',
  ...overrides,
})

export const makeGrant = (overrides: Partial<AgentGrant> = {}): AgentGrant => ({
  id: 1,
  client: { name: 'Claude' },
  scopes: ['budget:read', 'budget:write'],
  createdAt: '2026-10-01T12:00:00.000Z',
  lastUsedAt: '2026-10-11T12:00:00.000Z',
  ...overrides,
})

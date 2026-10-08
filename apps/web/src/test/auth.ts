import type { AuthUser } from '@/features/auth/types'

/** The signed-in user as `GET /auth/me` returns it: a complete account with a password. */
export const makeAuthUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 1,
  name: 'Ana Souza',
  email: 'ana@example.com',
  needsProfile: false,
  hasPassword: true,
  ...overrides,
})

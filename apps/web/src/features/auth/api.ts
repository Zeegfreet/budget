import { api } from '@/lib/api/client'
import type { AuthUser, ChangePasswordInput, LoginInput, RegisterInput } from './types'

// The session lives in an httpOnly cookie set by the API, so none of these
// calls ever see or store a token.

export async function login(input: LoginInput): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/login', input)
  return data
}

/** Creates the account and opens a session (the API sets the cookie). */
export async function register(input: RegisterInput): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/register', input)
  return data
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me')
  return data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

/** Changes the password; the API ends the other sessions and renews this one's cookies. */
export async function changePassword(input: ChangePasswordInput): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/password', input)
  return data
}

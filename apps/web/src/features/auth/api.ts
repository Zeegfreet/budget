import { api } from '@/lib/api/client'
import type {
  ActivationInfo,
  AuthUser,
  ChangePasswordInput,
  CompleteSignupInput,
  LoginInput,
  RegisterInput,
  RegisterResult,
} from './types'

// The session lives in an httpOnly cookie set by the API, so none of these
// calls ever see or store a token.

export async function login(input: LoginInput): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/login', input)
  return data
}

/** Creates the account, not activated: the API e-mails the activation link (no session yet). */
export async function register(input: RegisterInput): Promise<RegisterResult> {
  const { data } = await api.post<RegisterResult>('/auth/register', input)
  return data
}

/** What an activation link is for; 404 when invalid or expired. */
export async function fetchActivation(token: string): Promise<ActivationInfo> {
  const { data } = await api.get<ActivationInfo>('/auth/activation', { params: { token } })
  return data
}

/** Activates a signed-up account with its link and opens a session. */
export async function activate(token: string): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/activation', { token })
  return data
}

/** Finishes the sign-up of someone added to a group (the link proves the e-mail) and opens a session. */
export async function completeSignup(input: CompleteSignupInput): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/activation/signup', input)
  return data
}

/** E-mails the activation link again (the API answers the same for any e-mail). */
export async function resendActivation(email: string): Promise<void> {
  await api.post('/auth/activation/resend', { email })
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

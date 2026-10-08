export type OAuthProvider = 'github' | 'google'

export interface OAuthProviderOption {
  id: OAuthProvider
  label: string
  /** Extra context shown to assistive tech, e.g. which accounts the provider covers */
  hint?: string
}

/** The signed-in user, as returned by `GET /auth/me` and `POST /auth/login`. */
export interface AuthUser {
  id: number
  email: string
  name: string
}

export interface LoginInput {
  email: string
  password: string
}

/** Body of `POST /auth/register`. */
export interface RegisterInput {
  name: string
  email: string
  password: string
  /** ISO date, `YYYY-MM-DD` */
  birthDate: string
  /** 8 digits, no mask */
  cep: string
  city: string
  /** UF, e.g. `SP` */
  state: string
}

/** Body of `POST /auth/password`. */
export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

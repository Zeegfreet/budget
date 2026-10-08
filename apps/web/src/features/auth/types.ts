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
  /** Signed up with GitHub/Google and must still fill in birth date and address */
  needsProfile: boolean
  /** `false` when the account only signs in with GitHub/Google */
  hasPassword: boolean
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

/** Answer of `POST /auth/register`: no session until the e-mailed link is used. */
export interface RegisterResult {
  /** Where the activation link was sent */
  email: string
}

/**
 * What an activation link is for (`GET /auth/activation`): `ACTIVATE` a
 * sign-up, or `COMPLETE_SIGNUP` of someone added to a group by e-mail.
 */
export type ActivationKind = 'ACTIVATE' | 'COMPLETE_SIGNUP'

export interface ActivationInfo {
  email: string
  /** For a pre-registration, the nickname given by whoever added them */
  name: string
  kind: ActivationKind
}

/** Body of `POST /auth/activation/signup`: the sign-up data minus the e-mail (it comes from the link). */
export type CompleteSignupInput = Omit<RegisterInput, 'email'> & { token: string }

/** Body of `POST /auth/password`. */
export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

/** Whose password a reset link sets (`GET /auth/password/reset`). */
export interface PasswordResetInfo {
  email: string
  name: string
}

/** Body of `POST /auth/password/reset`. */
export interface ResetPasswordInput {
  token: string
  password: string
}

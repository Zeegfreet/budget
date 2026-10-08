import { ApiError } from '@/lib/api/client'

/** Friendly messages for the `?error=` code the API sends back after a failed OAuth callback. */
const loginErrorMessages: Record<string, string> = {
  access_denied: 'Você cancelou o login. Tente novamente quando quiser.',
  oauth_unavailable: 'Este login ainda não está disponível. Entre com e-mail e senha.',
  oauth_state: 'Sua tentativa de login expirou. Tente novamente.',
  oauth_email:
    'Sua conta do provedor não tem um e-mail verificado. Verifique o e-mail lá ou entre com e-mail e senha.',
  oauth_failed: 'Não foi possível entrar com o provedor. Tente novamente.',
}

export const defaultLoginErrorMessage = 'Não foi possível entrar. Tente novamente.'
export const invalidCredentialsMessage = 'E-mail ou senha inválidos.'
export const tooManyAttemptsMessage = 'Muitas tentativas. Aguarde um pouco e tente de novo.'
export const notActivatedMessage =
  'Sua conta ainda não foi ativada. Use o link que enviamos para o seu e-mail.'
export const serverUnavailableMessage = 'Não foi possível conectar ao servidor. Tente novamente em instantes.'

export function getLoginErrorMessage(code: string) {
  return loginErrorMessages[code] ?? defaultLoginErrorMessage
}

/**
 * Message for a failed e-mail/password sign-in. Deliberately generic for bad
 * credentials so the UI never reveals whether an e-mail is registered.
 */
export function getCredentialsErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 401) return invalidCredentialsMessage
    if (isNotActivated(error)) return notActivatedMessage
    if (error.status === 429) return tooManyAttemptsMessage
    // 0 = network error; 404 = auth routes not deployed; 5xx = API/proxy down
    if (error.status === 0 || error.status === 404 || error.status >= 500) {
      return serverUnavailableMessage
    }
  }
  return defaultLoginErrorMessage
}

/** The right credentials of an account still waiting for its activation link. */
export function isNotActivated(error: unknown) {
  return error instanceof ApiError && error.status === 403
}

export const emailTakenMessage = 'Este e-mail já está cadastrado.'
export const invalidRegisterDataMessage = 'Confira os dados informados.'
export const defaultRegisterErrorMessage = 'Não foi possível criar sua conta. Tente novamente.'

/** Message for a failed sign-up. */
export function getRegisterErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 409) return emailTakenMessage
    if (error.status === 400) return invalidRegisterDataMessage
    if (error.status === 429) return tooManyAttemptsMessage
    if (error.status === 0 || error.status === 404 || error.status >= 500) {
      return serverUnavailableMessage
    }
  }
  return defaultRegisterErrorMessage
}

export const wrongCurrentPasswordMessage = 'Senha atual incorreta.'
export const samePasswordMessage = 'A nova senha deve ser diferente da atual.'
export const invalidPasswordChangeMessage = 'Confira os dados informados.'
export const defaultPasswordChangeErrorMessage = 'Não foi possível alterar a senha. Tente novamente.'

export interface PasswordChangeError {
  currentPassword?: string
  newPassword?: string
  /** Shown above the form */
  form?: string
}

/** Where to show a failed password change: a field (wrong/same password) or the form. */
export function getPasswordChangeError(error: unknown): PasswordChangeError {
  if (error instanceof ApiError) {
    if (error.status === 403) return { currentPassword: wrongCurrentPasswordMessage }
    if (error.status === 400) {
      if (error.messages.some((m) => /differ from the current/.test(m))) {
        return { newPassword: samePasswordMessage }
      }
      return { form: invalidPasswordChangeMessage }
    }
    if (error.status === 429) return { form: tooManyAttemptsMessage }
    if (error.status === 0 || error.status === 404 || error.status >= 500) {
      return { form: serverUnavailableMessage }
    }
  }
  return { form: defaultPasswordChangeErrorMessage }
}

export const invalidActivationLinkMessage =
  'Este link de ativação é inválido ou expirou. Peça um novo abaixo.'
export const defaultActivationErrorMessage = 'Não foi possível ativar sua conta. Tente novamente.'

/** Whether an activation link was refused for being invalid, expired or already used. */
export function isInvalidActivationLink(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

/** Message for a failed activation (link check, activation or the pre-registration form). */
export function getActivationErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404) return invalidActivationLinkMessage
    if (error.status === 400) return invalidRegisterDataMessage
    if (error.status === 429) return tooManyAttemptsMessage
    if (error.status === 0 || error.status >= 500) return serverUnavailableMessage
  }
  return defaultActivationErrorMessage
}

export const activationSentMessage = 'Se houver uma conta aguardando ativação, enviamos um novo link.'
export const defaultResendErrorMessage = 'Não foi possível reenviar o e-mail. Tente novamente.'

export function getResendErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429) return tooManyAttemptsMessage
    if (error.status === 0 || error.status === 404 || error.status >= 500) {
      return serverUnavailableMessage
    }
  }
  return defaultResendErrorMessage
}

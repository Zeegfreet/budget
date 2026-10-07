import { ApiError } from '@/lib/api/client'

/** Friendly messages for the `?error=` code the API sends back after a failed OAuth callback. */
const loginErrorMessages: Record<string, string> = {
  access_denied: 'Você cancelou o login. Tente novamente quando quiser.',
}

export const defaultLoginErrorMessage = 'Não foi possível entrar. Tente novamente.'
export const invalidCredentialsMessage = 'E-mail ou senha inválidos.'
export const tooManyAttemptsMessage = 'Muitas tentativas. Aguarde um pouco e tente de novo.'
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
    if (error.status === 429) return tooManyAttemptsMessage
    // 0 = network error; 404 = auth routes not deployed; 5xx = API/proxy down
    if (error.status === 0 || error.status === 404 || error.status >= 500) {
      return serverUnavailableMessage
    }
  }
  return defaultLoginErrorMessage
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

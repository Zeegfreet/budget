import { ApiError } from '@/lib/api/client'

/** The `?error=` codes the API sends to the consent screen before trusting the agent. */
const consentErrorMessages: Record<string, string> = {
  invalid_client: 'Este agente não está registrado. Volte ao aplicativo e tente conectar de novo.',
  invalid_redirect_uri:
    'O endereço de retorno deste agente não confere com o registrado. Volte ao aplicativo e tente conectar de novo.',
}

export const defaultConsentErrorMessage = 'Não foi possível conectar o agente. Tente novamente.'
export const expiredRequestMessage =
  'Este pedido de acesso expirou ou já foi respondido. Volte ao aplicativo e conecte de novo.'

export function getConsentErrorMessage(code: string) {
  return consentErrorMessages[code] ?? defaultConsentErrorMessage
}

/** Message for a request that can't be read or decided. */
export function getRequestErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 404) return expiredRequestMessage
  return defaultConsentErrorMessage
}

export function getRevokeErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 404) {
    return 'Este agente já estava desconectado.'
  }
  return 'Não foi possível desconectar o agente. Tente novamente.'
}

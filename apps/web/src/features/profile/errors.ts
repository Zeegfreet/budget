import { serverUnavailableMessage } from '@/features/auth/errors'
import { ApiError } from '@/lib/api/client'

export const invalidProfileMessage = 'Confira os dados informados.'
export const defaultProfileErrorMessage = 'Não foi possível salvar o perfil. Tente novamente.'

/** Message for a failed profile update. */
export function getProfileErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 400) return invalidProfileMessage
    if (error.status === 0 || error.status >= 500) return serverUnavailableMessage
  }
  return defaultProfileErrorMessage
}

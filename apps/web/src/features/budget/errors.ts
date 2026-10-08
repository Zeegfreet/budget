import { ApiError } from '@/lib/api/client'

/** Message for a failed change of the category tree */
export function categoryErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.status === 409 ? 'Já existe um item com esse nome.' : error.messages.join(' ')
  }
  return fallback
}

import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import {
  defaultConsentErrorMessage,
  expiredRequestMessage,
  getConsentErrorMessage,
  getRequestErrorMessage,
  getRevokeErrorMessage,
} from './errors'

describe('agent errors', () => {
  it('translates the consent screen codes, with a fallback', () => {
    expect(getConsentErrorMessage('invalid_client')).toContain('não está registrado')
    expect(getConsentErrorMessage('whatever')).toBe(defaultConsentErrorMessage)
  })

  it('tells an expired request apart from other failures', () => {
    expect(getRequestErrorMessage(new ApiError(404, ['x']))).toBe(expiredRequestMessage)
    expect(getRequestErrorMessage(new ApiError(500, ['x']))).toBe(defaultConsentErrorMessage)
  })

  it('treats a missing connection as already disconnected', () => {
    expect(getRevokeErrorMessage(new ApiError(404, ['x']))).toBe('Este agente já estava desconectado.')
    expect(getRevokeErrorMessage(new Error('x'))).toContain('Tente novamente')
  })
})

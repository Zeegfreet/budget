import { describe, expect, it } from 'vitest'
import { serverUnavailableMessage } from '@/features/auth/errors'
import { ApiError } from '@/lib/api/client'
import { defaultProfileErrorMessage, getProfileErrorMessage, invalidProfileMessage } from './errors'

describe('getProfileErrorMessage', () => {
  it.each([
    [new ApiError(400, ['cep must have exactly 8 digits']), invalidProfileMessage],
    [new ApiError(0, ['Network Error']), serverUnavailableMessage],
    [new ApiError(503, ['Service Unavailable']), serverUnavailableMessage],
    [new ApiError(404, ['User not found']), defaultProfileErrorMessage],
    [new Error('boom'), defaultProfileErrorMessage],
  ])('maps %o', (error, message) => {
    expect(getProfileErrorMessage(error)).toBe(message)
  })
})

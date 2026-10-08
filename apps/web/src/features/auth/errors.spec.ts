import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import {
  defaultLoginErrorMessage,
  defaultPasswordChangeErrorMessage,
  getPasswordChangeError,
  invalidPasswordChangeMessage,
  samePasswordMessage,
  wrongCurrentPasswordMessage,
  defaultRegisterErrorMessage,
  emailTakenMessage,
  getCredentialsErrorMessage,
  getRegisterErrorMessage,
  invalidRegisterDataMessage,
  getLoginErrorMessage,
  invalidCredentialsMessage,
  serverUnavailableMessage,
  tooManyAttemptsMessage,
} from './errors'

describe('getLoginErrorMessage', () => {
  it('maps known OAuth error codes', () => {
    expect(getLoginErrorMessage('access_denied')).toMatch(/cancelou/)
  })

  it('falls back to a generic message', () => {
    expect(getLoginErrorMessage('server_error')).toBe(defaultLoginErrorMessage)
  })
})

describe('getCredentialsErrorMessage', () => {
  it.each([400, 401])('hides the reason for %i (no user enumeration)', (status) => {
    expect(getCredentialsErrorMessage(new ApiError(status, ['User not found']))).toBe(
      invalidCredentialsMessage,
    )
  })

  it('explains rate limiting', () => {
    expect(getCredentialsErrorMessage(new ApiError(429, ['Too Many Requests']))).toBe(
      tooManyAttemptsMessage,
    )
  })

  it.each([0, 404, 500, 502])('reports the server as unavailable on %i', (status) => {
    expect(getCredentialsErrorMessage(new ApiError(status, ['x']))).toBe(serverUnavailableMessage)
  })

  it.each([new ApiError(403, ['Forbidden']), new Error('x')])(
    'uses the generic message for other failures',
    (error) => {
      expect(getCredentialsErrorMessage(error)).toBe(defaultLoginErrorMessage)
    },
  )
})

describe('getRegisterErrorMessage', () => {
  it.each([
    [409, emailTakenMessage],
    [400, invalidRegisterDataMessage],
    [429, tooManyAttemptsMessage],
    [0, serverUnavailableMessage],
    [404, serverUnavailableMessage],
    [503, serverUnavailableMessage],
    [403, defaultRegisterErrorMessage],
  ])('maps %i', (status, message) => {
    expect(getRegisterErrorMessage(new ApiError(status, ['x']))).toBe(message)
  })

  it('uses the generic message for non-API errors', () => {
    expect(getRegisterErrorMessage(new Error('x'))).toBe(defaultRegisterErrorMessage)
  })
})

describe('getPasswordChangeError', () => {
  it('puts a wrong current password on its field', () => {
    expect(getPasswordChangeError(new ApiError(403, ['Current password is incorrect']))).toEqual({
      currentPassword: wrongCurrentPasswordMessage,
    })
  })

  it('puts a repeated password on the new password field', () => {
    expect(
      getPasswordChangeError(new ApiError(400, ['New password must differ from the current one'])),
    ).toEqual({ newPassword: samePasswordMessage })
  })

  it.each([
    [400, invalidPasswordChangeMessage],
    [429, tooManyAttemptsMessage],
    [0, serverUnavailableMessage],
    [503, serverUnavailableMessage],
    [418, defaultPasswordChangeErrorMessage],
  ])('shows %i above the form', (status, message) => {
    expect(getPasswordChangeError(new ApiError(status, ['x']))).toEqual({ form: message })
  })
})

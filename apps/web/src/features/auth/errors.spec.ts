import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import {
  defaultActivationErrorMessage,
  defaultLoginErrorMessage,
  defaultResendErrorMessage,
  getActivationErrorMessage,
  getResendErrorMessage,
  invalidActivationLinkMessage,
  isInvalidActivationLink,
  isNotActivated,
  notActivatedMessage,
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
  defaultForgotPasswordErrorMessage,
  defaultPasswordResetErrorMessage,
  getForgotPasswordErrorMessage,
  getPasswordResetErrorMessage,
  invalidPasswordMessage,
  invalidPasswordResetLinkMessage,
  isInvalidPasswordResetLink,
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

  it('explains an account not activated yet (403)', () => {
    expect(getCredentialsErrorMessage(new ApiError(403, ['Account not activated']))).toBe(
      notActivatedMessage,
    )
    expect(isNotActivated(new ApiError(403, ['Account not activated']))).toBe(true)
    expect(isNotActivated(new ApiError(401, ['Invalid credentials']))).toBe(false)
  })

  it.each([new ApiError(418, ['Teapot']), new Error('x')])(
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

describe('getActivationErrorMessage', () => {
  it.each([
    [404, invalidActivationLinkMessage],
    [400, invalidRegisterDataMessage],
    [429, tooManyAttemptsMessage],
    [0, serverUnavailableMessage],
    [500, serverUnavailableMessage],
    [418, defaultActivationErrorMessage],
  ])('maps %i', (status, message) => {
    expect(getActivationErrorMessage(new ApiError(status, ['x']))).toBe(message)
  })

  it('tells an invalid link apart', () => {
    expect(isInvalidActivationLink(new ApiError(404, ['x']))).toBe(true)
    expect(isInvalidActivationLink(new ApiError(400, ['x']))).toBe(false)
    expect(getActivationErrorMessage(new Error('x'))).toBe(defaultActivationErrorMessage)
  })
})

describe('getResendErrorMessage', () => {
  it.each([
    [429, tooManyAttemptsMessage],
    [0, serverUnavailableMessage],
    [502, serverUnavailableMessage],
    [400, defaultResendErrorMessage],
  ])('maps %i', (status, message) => {
    expect(getResendErrorMessage(new ApiError(status, ['x']))).toBe(message)
  })
})

describe('getForgotPasswordErrorMessage', () => {
  it.each([
    [400, 'Informe um e-mail válido.'],
    [429, tooManyAttemptsMessage],
    [0, serverUnavailableMessage],
    [404, serverUnavailableMessage],
    [503, serverUnavailableMessage],
    [418, defaultForgotPasswordErrorMessage],
  ])('maps %i', (status, message) => {
    expect(getForgotPasswordErrorMessage(new ApiError(status, ['x']))).toBe(message)
  })
})

describe('getPasswordResetErrorMessage', () => {
  it.each([
    [404, invalidPasswordResetLinkMessage],
    [400, invalidPasswordMessage],
    [429, tooManyAttemptsMessage],
    [0, serverUnavailableMessage],
    [500, serverUnavailableMessage],
    [418, defaultPasswordResetErrorMessage],
  ])('maps %i', (status, message) => {
    expect(getPasswordResetErrorMessage(new ApiError(status, ['x']))).toBe(message)
  })

  it('tells an invalid link apart', () => {
    expect(isInvalidPasswordResetLink(new ApiError(404, ['x']))).toBe(true)
    expect(isInvalidPasswordResetLink(new ApiError(400, ['x']))).toBe(false)
    expect(getPasswordResetErrorMessage(new Error('x'))).toBe(defaultPasswordResetErrorMessage)
  })
})

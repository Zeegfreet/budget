import { describe, expect, it } from 'vitest'
import { validatePasswordChange } from './password-validation'

const valid = {
  currentPassword: 'segredo123',
  newPassword: 'novaSenha456',
  passwordConfirmation: 'novaSenha456',
}

describe('validatePasswordChange', () => {
  it('accepts valid data', () => {
    expect(validatePasswordChange(valid)).toEqual({})
  })

  it('requires every field', () => {
    expect(
      validatePasswordChange({ currentPassword: '', newPassword: '', passwordConfirmation: '' }),
    ).toEqual({
      currentPassword: 'Informe sua senha atual.',
      newPassword: 'Crie uma senha.',
      passwordConfirmation: 'Confirme sua senha.',
    })
  })

  it('checks the length and the confirmation', () => {
    expect(
      validatePasswordChange({ ...valid, newPassword: 'curta', passwordConfirmation: 'outra' }),
    ).toEqual({
      newPassword: 'Use pelo menos 8 caracteres.',
      passwordConfirmation: 'As senhas não coincidem.',
    })
  })

  it('rejects a new password equal to the current one', () => {
    expect(
      validatePasswordChange({ ...valid, newPassword: 'segredo123', passwordConfirmation: 'segredo123' }),
    ).toEqual({ newPassword: 'A nova senha deve ser diferente da atual.' })
  })
})

import { samePasswordMessage } from './errors'
import { validateNewPassword } from './register-validation'

export interface PasswordChangeValues {
  currentPassword: string
  newPassword: string
  passwordConfirmation: string
}

export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeValues, string>>

/** Client-side checks for the password change. The API checks the current password. */
export function validatePasswordChange(values: PasswordChangeValues): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {}
  if (!values.currentPassword) errors.currentPassword = 'Informe sua senha atual.'

  const { password, passwordConfirmation } = validateNewPassword(
    values.newPassword,
    values.passwordConfirmation,
  )
  if (password) errors.newPassword = password
  else if (values.newPassword === values.currentPassword) errors.newPassword = samePasswordMessage
  if (passwordConfirmation) errors.passwordConfirmation = passwordConfirmation
  return errors
}

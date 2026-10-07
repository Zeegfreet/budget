import { isBrazilianState, isCompleteCep } from '@/features/address/cep'
import { EMAIL_PATTERN } from './validation'

export const MIN_AGE = 18
export const MAX_AGE = 120
export const MIN_PASSWORD_LENGTH = 8

export interface RegisterValues {
  name: string
  email: string
  password: string
  passwordConfirmation: string
  /** `YYYY-MM-DD`, as given by `<input type="date">` */
  birthDate: string
  cep: string
  city: string
  state: string
}

export type RegisterFieldErrors = Partial<Record<keyof RegisterValues, string>>

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parses `YYYY-MM-DD` as a local calendar date, rejecting impossible dates (e.g. 02-30). */
export function parseIsoDate(value: string): Date | undefined {
  const match = ISO_DATE.exec(value)
  if (!match) return undefined
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined
  }
  return date
}

export function toIsoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Completed years between `birth` and `today`. */
export function ageOn(birth: Date, today: Date) {
  let age = today.getFullYear() - birth.getFullYear()
  const hadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!hadBirthday) age -= 1
  return age
}

/** Latest birth date allowed today (for the date input's `max`). */
export function latestBirthDate(today: Date) {
  return toIsoDate(new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate()))
}

function validateBirthDate(value: string, today: Date) {
  if (!value) return 'Informe sua data de nascimento.'
  const birth = parseIsoDate(value)
  if (!birth) return 'Informe uma data válida.'
  if (birth > today) return 'A data não pode estar no futuro.'
  const age = ageOn(birth, today)
  if (age < MIN_AGE) return `Você precisa ter pelo menos ${MIN_AGE} anos.`
  if (age > MAX_AGE) return 'Informe uma data válida.'
  return undefined
}

/**
 * Client-side checks for the sign-up form. Expects `name`, `email` and `city`
 * already trimmed. The API must validate everything again.
 */
export function validateRegister(values: RegisterValues, today = new Date()): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {}

  if (!values.name) errors.name = 'Informe seu nome.'
  else if (values.name.length < 2) errors.name = 'Informe seu nome completo.'
  else if (values.name.length > 100) errors.name = 'Use no máximo 100 caracteres.'

  if (!values.email) errors.email = 'Informe seu e-mail.'
  else if (!EMAIL_PATTERN.test(values.email)) errors.email = 'Informe um e-mail válido.'

  if (!values.password) errors.password = 'Crie uma senha.'
  else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  }
  if (!values.passwordConfirmation) errors.passwordConfirmation = 'Confirme sua senha.'
  else if (values.password !== values.passwordConfirmation) {
    errors.passwordConfirmation = 'As senhas não coincidem.'
  }

  const birthDateError = validateBirthDate(values.birthDate, today)
  if (birthDateError) errors.birthDate = birthDateError

  if (!values.cep) errors.cep = 'Informe seu CEP.'
  else if (!isCompleteCep(values.cep)) errors.cep = 'O CEP deve ter 8 dígitos.'

  if (!values.city) errors.city = 'Informe sua cidade.'
  if (!values.state) errors.state = 'Informe a UF.'
  else if (!isBrazilianState(values.state)) errors.state = 'UF inválida.'

  return errors
}

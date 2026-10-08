import { describe, expect, it } from 'vitest'
import {
  ageOn,
  latestBirthDate,
  parseIsoDate,
  validatePersonalData,
  validateRegister,
  type RegisterValues,
} from './register-validation'

const today = new Date(2026, 9, 6) // 2026-10-06

const valid: RegisterValues = {
  name: 'Ana Souza',
  email: 'ana@example.com',
  password: 'segredo123',
  passwordConfirmation: 'segredo123',
  birthDate: '1990-05-20',
  cep: '01001000',
  city: 'São Paulo',
  state: 'SP',
}

const errorsFor = (overrides: Partial<RegisterValues>) =>
  validateRegister({ ...valid, ...overrides }, today)

describe('validateRegister', () => {
  it('accepts valid data', () => {
    expect(validateRegister(valid, today)).toEqual({})
  })

  it('requires every field', () => {
    const empty = Object.fromEntries(Object.keys(valid).map((k) => [k, ''])) as unknown as RegisterValues
    expect(Object.keys(validateRegister(empty, today)).sort()).toEqual(Object.keys(valid).sort())
  })

  it.each([
    [{ name: 'A' }, 'name', 'Informe seu nome completo.'],
    [{ name: 'A'.repeat(101) }, 'name', 'Use no máximo 100 caracteres.'],
    [{ email: 'ana@' }, 'email', 'Informe um e-mail válido.'],
    [{ password: 'curta12', passwordConfirmation: 'curta12' }, 'password', 'Use pelo menos 8 caracteres.'],
    [{ passwordConfirmation: 'outra1234' }, 'passwordConfirmation', 'As senhas não coincidem.'],
    [{ birthDate: '2026-02-30' }, 'birthDate', 'Informe uma data válida.'],
    [{ birthDate: '1900-01-01' }, 'birthDate', 'Informe uma data válida.'],
    [{ birthDate: '2026-10-07' }, 'birthDate', 'A data não pode estar no futuro.'],
    [{ birthDate: '2010-01-01' }, 'birthDate', 'Você precisa ter pelo menos 18 anos.'],
    [{ cep: '0100100' }, 'cep', 'O CEP deve ter 8 dígitos.'],
    [{ state: 'XX' }, 'state', 'UF inválida.'],
  ] as const)('rejects %o', (overrides, field, message) => {
    expect(errorsFor(overrides)).toEqual({ [field]: message })
  })

  it('accepts someone turning 18 today and rejects one day earlier', () => {
    expect(errorsFor({ birthDate: '2008-10-06' })).toEqual({})
    expect(errorsFor({ birthDate: '2008-10-07' }).birthDate).toMatch(/18 anos/)
  })
})

describe('date helpers', () => {
  it('parses only real ISO dates', () => {
    expect(parseIsoDate('2000-02-29')).toEqual(new Date(2000, 1, 29))
    expect(parseIsoDate('2001-02-29')).toBeUndefined()
    expect(parseIsoDate('06/10/2026')).toBeUndefined()
  })

  it('computes completed years', () => {
    expect(ageOn(new Date(1990, 9, 7), today)).toBe(35)
    expect(ageOn(new Date(1990, 9, 6), today)).toBe(36)
  })

  it('gives the latest allowed birth date', () => {
    expect(latestBirthDate(today)).toBe('2008-10-06')
  })
})

describe('validatePersonalData', () => {
  const personal = {
    name: 'Ana Souza',
    birthDate: '1990-05-20',
    cep: '01001000',
    city: 'São Paulo',
    state: 'SP',
  }

  it('accepts valid data without e-mail or password', () => {
    expect(validatePersonalData(personal, today)).toEqual({})
  })

  it('checks name, birth date and address like the sign-up', () => {
    expect(
      validatePersonalData({ name: '', birthDate: '2010-01-01', cep: '0100', city: '', state: 'XX' }, today),
    ).toEqual({
      name: 'Informe seu nome.',
      birthDate: 'Você precisa ter pelo menos 18 anos.',
      cep: 'O CEP deve ter 8 dígitos.',
      city: 'Informe sua cidade.',
      state: 'UF inválida.',
    })
  })
})

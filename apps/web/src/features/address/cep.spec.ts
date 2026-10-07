import { describe, expect, it } from 'vitest'
import { BRAZILIAN_STATES, formatCep, isBrazilianState, isCompleteCep, normalizeCep } from './cep'

describe('cep helpers', () => {
  it('normalizes to at most 8 digits', () => {
    expect(normalizeCep('01001-000')).toBe('01001000')
    expect(normalizeCep(' 01.001-0009 ')).toBe('01001000')
    expect(normalizeCep('abc')).toBe('')
  })

  it.each([
    ['', ''],
    ['01001', '01001'],
    ['010010', '01001-0'],
    ['01001000', '01001-000'],
    ['01001-0001', '01001-000'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatCep(input)).toBe(expected)
  })

  it('detects a complete CEP', () => {
    expect(isCompleteCep('01001-000')).toBe(true)
    expect(isCompleteCep('01001-00')).toBe(false)
  })

  it('knows the 27 UFs', () => {
    expect(BRAZILIAN_STATES).toHaveLength(27)
    expect(isBrazilianState('SP')).toBe(true)
    expect(isBrazilianState('sp')).toBe(false)
    expect(isBrazilianState('XX')).toBe(false)
  })
})

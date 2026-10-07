import { describe, expect, it } from 'vitest'
import { formatAmount, formatCents, parseMoneyInput } from './money'

describe('formatCents', () => {
  it('formats integer cents as BRL by default', () => {
    expect(formatCents(123456)).toMatch(/^R\$\s1\.234,56$/)
  })

  it('formats zero and negative amounts', () => {
    expect(formatCents(0)).toMatch(/^R\$\s0,00$/)
    expect(formatCents(-1050)).toMatch(/^-R\$\s10,50$/)
  })

  it('supports other locales and currencies', () => {
    expect(formatCents(999, 'en-US', 'USD')).toBe('$9.99')
  })

  it('rejects non-integer values to avoid float money', () => {
    expect(() => formatCents(10.5)).toThrow(TypeError)
  })
})

describe('formatAmount', () => {
  it('formats cents as a plain pt-BR number', () => {
    expect(formatAmount(180000)).toBe('1.800,00')
    expect(formatAmount(5)).toBe('0,05')
    expect(formatAmount(-1050)).toBe('-10,50')
  })
})

describe('parseMoneyInput', () => {
  it.each([
    ['1800', 180000],
    ['1.800', 180000],
    ['1.800,5', 180050],
    ['1800,50', 180050],
    ['1.234.567,89', 123456789],
    ['R$ 10', 1000],
    ['R$ 1.800,00', 180000],
    ['10.5', 1050],
    ['10.50', 1050],
    ['0,01', 1],
    [' 0 ', 0],
  ])('%j → %d cents', (input, cents) => {
    expect(parseMoneyInput(input)).toBe(cents)
  })

  it.each(['', 'abc', '1,234', '1.80.0', '10,5,0', '1.8000', '12,345', ',5', '-10', '1e3'])(
    'rejects %j',
    (input) => {
      expect(parseMoneyInput(input)).toBeNull()
    },
  )

  it('accepts negative amounts only when allowed', () => {
    expect(parseMoneyInput('-1.000,00', { allowNegative: true })).toBe(-100000)
    expect(parseMoneyInput('-R$ 5', { allowNegative: true })).toBe(-500)
    expect(parseMoneyInput('-0', { allowNegative: true })).toBe(0)
  })

  it('stays exact where float math would not', () => {
    // 0.1 + 0.2 style errors: 1.15 * 100 = 114.99999999999999 in floats
    expect(parseMoneyInput('1,15')).toBe(115)
    expect(parseMoneyInput('4,35')).toBe(435)
  })
})

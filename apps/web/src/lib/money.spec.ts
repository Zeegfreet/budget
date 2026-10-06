import { describe, expect, it } from 'vitest'
import { formatCents } from './money'

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

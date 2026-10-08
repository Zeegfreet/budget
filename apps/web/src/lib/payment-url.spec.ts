import { describe, expect, it } from 'vitest'
import { MAX_PAYMENT_URL_LENGTH, parsePaymentUrl, paymentUrlHost } from './payment-url'

describe('parsePaymentUrl', () => {
  it('returns null for a blank text', () => {
    expect(parsePaymentUrl('')).toBeNull()
    expect(parsePaymentUrl('   ')).toBeNull()
  })

  it('keeps http(s) links, trimmed', () => {
    expect(parsePaymentUrl('  https://www.banco.com.br/boleto?id=1 ')).toBe('https://www.banco.com.br/boleto?id=1')
    expect(parsePaymentUrl('http://portal.agua.sp.gov.br')).toBe('http://portal.agua.sp.gov.br/')
  })

  it('adds https:// to a link typed without protocol', () => {
    expect(parsePaymentUrl('www.banco.com.br/boleto')).toBe('https://www.banco.com.br/boleto')
    expect(parsePaymentUrl('energia.com.br')).toBe('https://energia.com.br/')
  })

  it.each([
    ['a plain text', 'boleto do mês'],
    ['another protocol', 'ftp://banco.com.br/boleto'],
    ['a script', 'javascript:alert(1)'],
    ['a host without domain', 'https://boleto'],
  ])('rejects %s', (_case, text) => {
    expect(parsePaymentUrl(text)).toBeUndefined()
  })

  it('rejects a link longer than the API accepts', () => {
    expect(parsePaymentUrl(`https://banco.com.br/${'a'.repeat(MAX_PAYMENT_URL_LENGTH)}`)).toBeUndefined()
  })
})

describe('paymentUrlHost', () => {
  it('shows the host without www.', () => {
    expect(paymentUrlHost('https://www.banco.com.br/boleto/1')).toBe('banco.com.br')
    expect(paymentUrlHost('https://portal.energia.com.br')).toBe('portal.energia.com.br')
  })
})

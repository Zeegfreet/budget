import { describe, expect, it } from 'vitest'
import { CepNotFoundError, parseViaCepResponse } from './api'

describe('parseViaCepResponse', () => {
  it('maps city and UF', () => {
    expect(
      parseViaCepResponse('01001000', { cep: '01001-000', localidade: 'São Paulo', uf: 'SP' }),
    ).toEqual({ cep: '01001000', city: 'São Paulo', state: 'SP' })
  })

  it.each([{ erro: true }, { erro: 'true' }, {}])('treats %o as an unknown CEP', (data) => {
    expect(() => parseViaCepResponse('99999999', data)).toThrow(CepNotFoundError)
  })
})

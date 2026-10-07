import { describe, expect, it } from 'vitest'
import { describeRule, formatPercent, previewShares, ruleError } from './split'

const members = [
  { id: 1, name: 'Ana' },
  { id: 2, name: 'Bruno' },
]

describe('previewShares', () => {
  it('splits equally among all members, leftover cents to the lowest id', () => {
    expect(previewShares(1001, 'EQUAL', [], [2, 1])).toEqual([
      { memberId: 1, amountCents: 501 },
      { memberId: 2, amountCents: 500 },
    ])
  })

  it('splits by percentage and weight like the API', () => {
    const percent = [
      { memberId: 1, value: 3000 },
      { memberId: 2, value: 7000 },
    ]
    expect(previewShares(200000, 'PERCENT', percent, [])).toEqual([
      { memberId: 1, amountCents: 60000 },
      { memberId: 2, amountCents: 140000 },
    ])
    expect(
      previewShares(1000, 'WEIGHT', [
        { memberId: 1, value: 2 },
        { memberId: 2, value: 1 },
      ], []),
    ).toEqual([
      { memberId: 1, amountCents: 667 },
      { memberId: 2, amountCents: 333 },
    ])
  })

  it('uses fixed values as they are', () => {
    expect(previewShares(999, 'FIXED', [{ memberId: 2, value: 400 }], [])).toEqual([{ memberId: 2, amountCents: 400 }])
  })
})

describe('ruleError', () => {
  it('requires percentages to add up to 100%', () => {
    expect(ruleError('PERCENT', [{ memberId: 1, value: 1500 }, { memberId: 2, value: 3000 }])).toBe(
      'Os percentuais somam 45%, e devem somar 100%.',
    )
    expect(ruleError('PERCENT', [{ memberId: 1, value: 10000 }])).toBeNull()
  })

  it('requires fixed values to match the amount when there is one', () => {
    const shares = [{ memberId: 1, value: 40000 }]
    expect(ruleError('FIXED', shares)).toBeNull()
    expect(ruleError('FIXED', shares, 50000)).toMatch(/^O valor deve ser R\$\s400,00, a soma dos valores fixos da regra\.$/)
  })

  it('needs members with positive values', () => {
    expect(ruleError('WEIGHT', [])).toBe('Inclua ao menos um membro.')
    expect(ruleError('WEIGHT', [{ memberId: 1, value: 0 }])).toBe('Use valores maiores que zero.')
    expect(ruleError('EQUAL', [])).toBeNull()
  })
})

describe('describeRule', () => {
  it('describes each kind of rule', () => {
    expect(describeRule('EQUAL', [], members)).toBe('Todos os membros, em partes iguais')
    expect(describeRule('EQUAL', [{ memberId: 2, value: 1 }], members)).toBe('Bruno')
    expect(
      describeRule('PERCENT', [{ memberId: 1, value: 3333 }, { memberId: 3, value: 6667 }], members),
    ).toBe('Ana 33,33% · Ex-membro 66,67%')
    expect(describeRule('FIXED', [{ memberId: 1, value: 40000 }], members)).toMatch(/^Ana R\$\s400,00$/)
    expect(describeRule('WEIGHT', [{ memberId: 1, value: 2 }], members)).toBe('Ana 2')
  })

  it('formats percentages without needless decimals', () => {
    expect(formatPercent(3000)).toBe('30')
    expect(formatPercent(3333)).toBe('33,33')
  })
})

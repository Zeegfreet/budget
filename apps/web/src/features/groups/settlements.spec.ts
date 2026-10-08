import { describe, expect, it } from 'vitest'
import { settlementPairs } from './settlements'
import type { SettlementItem } from './types'

const item = (extra: Partial<SettlementItem>): SettlementItem => ({
  transactionId: 1,
  kind: 'EXPENSE',
  description: 'Aluguel',
  memberId: 2,
  payerMemberId: 1,
  amountCents: 1000,
  settled: false,
  canSettle: true,
  ...extra,
})

describe('settlementPairs', () => {
  it('groups the shares by who owes whom, totaling the open ones', () => {
    const pairs = settlementPairs([
      item({ transactionId: 1 }),
      item({ transactionId: 2, amountCents: 500, settled: true }),
      // An income held by member 1: they owe member 2's share
      item({ transactionId: 3, kind: 'INCOME', amountCents: 300 }),
      item({ transactionId: 4, memberId: 3, amountCents: 700 }),
    ])

    expect(pairs.map(({ fromMemberId, toMemberId, openCents, items }) => [
      fromMemberId,
      toMemberId,
      openCents,
      items.map((i) => i.transactionId),
    ])).toEqual([
      [2, 1, 1000, [1, 2]],
      [1, 2, 300, [3]],
      [3, 1, 700, [4]],
    ])
  })
})

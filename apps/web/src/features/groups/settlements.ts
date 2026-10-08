import type { SettlementItem } from './types'

/** The shares one member owes another (debtor → who receives the money) */
export interface SettlementPair {
  fromMemberId: number
  toMemberId: number
  items: SettlementItem[]
  openCents: number
}

/**
 * Groups the shares by who owes whom: an expense's share is owed by its member
 * to the payer; an income's share is owed by the receiver to the member.
 */
export function settlementPairs(items: SettlementItem[]): SettlementPair[] {
  const pairs = new Map<string, SettlementPair>()
  for (const item of items) {
    const [fromMemberId, toMemberId] =
      item.kind === 'EXPENSE' ? [item.memberId, item.payerMemberId] : [item.payerMemberId, item.memberId]
    const key = `${fromMemberId}-${toMemberId}`
    let pair = pairs.get(key)
    if (!pair) pairs.set(key, (pair = { fromMemberId, toMemberId, items: [], openCents: 0 }))
    pair.items.push(item)
    if (!item.settled) pair.openCents += item.amountCents
  }
  return [...pairs.values()]
}

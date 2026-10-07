import { formatAmount, formatCents } from '@/lib/money'
import type { GroupMember, SplitShare, SplitType } from './types'

/** 100% in basis points */
export const FULL_PERCENT = 10_000
export const MAX_WEIGHT = 1_000

export const SPLIT_TYPE_LABEL: Record<SplitType, string> = {
  EQUAL: 'Igualitário',
  PERCENT: 'Percentual',
  WEIGHT: 'Pesos',
  FIXED: 'Valores fixos',
}

/** "30" for 3000 basis points, "33,33" for 3333 */
export function formatPercent(basisPoints: number): string {
  return basisPoints % 100 === 0 ? String(basisPoints / 100) : formatAmount(basisPoints)
}

/**
 * Why the rule can't divide `totalCents`, or `null` when it can. Mirrors the
 * API (`apps/api/src/groups/split.ts`); pass no total to check the rule alone.
 */
export function ruleError(type: SplitType, shares: SplitShare[], totalCents?: number): string | null {
  if (type === 'EQUAL') return null
  if (shares.length === 0) return 'Inclua ao menos um membro.'
  if (shares.some((s) => !Number.isInteger(s.value) || s.value < 1)) return 'Use valores maiores que zero.'
  const sum = shares.reduce((t, s) => t + s.value, 0)
  if (type === 'PERCENT' && sum !== FULL_PERCENT) return `Os percentuais somam ${formatPercent(sum)}%, e devem somar 100%.`
  if (type === 'WEIGHT' && shares.some((s) => s.value > MAX_WEIGHT)) return `Use pesos de até ${MAX_WEIGHT}.`
  if (type === 'FIXED' && totalCents !== undefined && sum !== totalCents) {
    return `O valor deve ser ${formatCents(sum)}, a soma dos valores fixos da regra.`
  }
  return null
}

/**
 * Each member's share of `totalCents`, the same way the API computes it
 * (largest remainder, ties to the lowest member id), for previews.
 */
export function previewShares(
  totalCents: number,
  type: SplitType,
  shares: SplitShare[],
  activeMemberIds: number[],
): { memberId: number; amountCents: number }[] {
  const parts = (
    type === 'EQUAL'
      ? (shares.length > 0 ? shares.map((s) => s.memberId) : activeMemberIds).map((memberId) => ({ memberId, value: 1 }))
      : shares
  )
    .slice()
    .sort((a, b) => a.memberId - b.memberId)
  if (type === 'FIXED') return parts.map((s) => ({ memberId: s.memberId, amountCents: s.value }))
  const weights = parts.reduce((t, s) => t + s.value, 0)
  if (weights === 0) return []
  const result = parts.map((s, index) => ({
    index,
    memberId: s.memberId,
    amountCents: Math.floor((totalCents * s.value) / weights),
    remainder: (totalCents * s.value) % weights,
  }))
  let left = totalCents - result.reduce((t, p) => t + p.amountCents, 0)
  for (const part of [...result].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (left === 0) break
    part.amountCents += 1
    left -= 1
  }
  return result.map(({ memberId, amountCents }) => ({ memberId, amountCents }))
}

/** "Ana 30% · Bruno 70%", "Todos os membros", "Ana 2 · Bruno 1"… */
export function describeRule(type: SplitType, shares: SplitShare[], members: Pick<GroupMember, 'id' | 'name'>[]): string {
  const name = (id: number) => members.find((m) => m.id === id)?.name ?? 'Ex-membro'
  if (type === 'EQUAL') {
    return shares.length === 0 ? 'Todos os membros, em partes iguais' : shares.map((s) => name(s.memberId)).join(' · ')
  }
  const value = (v: number) =>
    type === 'PERCENT' ? `${formatPercent(v)}%` : type === 'FIXED' ? formatCents(v) : String(v)
  return shares.map((s) => `${name(s.memberId)} ${value(s.value)}`).join(' · ')
}

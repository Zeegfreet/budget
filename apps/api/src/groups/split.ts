import type { SplitType } from '../prisma/generated/enums.js';

/** 100% in basis points: `PERCENT` shares add up to this. */
export const FULL_PERCENT = 10_000;

/** Largest weight a `WEIGHT` share may have. */
export const MAX_WEIGHT = 1_000;

export interface SplitRule {
  type: SplitType;
  /** Explicit participants; an `EQUAL` rule without any splits among `activeMemberIds` */
  shares: { memberId: number; value: number }[];
}

export interface MemberShare {
  memberId: number;
  amountCents: number;
}

/** A rule that can't divide an amount (e.g. percentages not adding up to 100%). */
export class SplitRuleError extends Error {}

/** Checks a rule's own values, regardless of the amount it will divide. */
export function validateRule({ type, shares }: SplitRule): void {
  const ids = shares.map((s) => s.memberId);
  if (new Set(ids).size !== ids.length) {
    throw new SplitRuleError('A member appears more than once');
  }
  if (type === 'EQUAL') return;
  if (shares.length === 0) {
    throw new SplitRuleError('The rule needs at least one member');
  }
  if (shares.some((s) => !Number.isInteger(s.value) || s.value < 1)) {
    throw new SplitRuleError('Every value must be a positive integer');
  }
  if (type === 'PERCENT' && sum(shares.map((s) => s.value)) !== FULL_PERCENT) {
    throw new SplitRuleError('Percentages must add up to 100%');
  }
  if (type === 'WEIGHT' && shares.some((s) => s.value > MAX_WEIGHT)) {
    throw new SplitRuleError(`Weights can't exceed ${MAX_WEIGHT}`);
  }
}

/**
 * Divides `totalCents` among the rule's members. Proportional rules use the
 * largest remainder method (ties go to the lowest member id), so the shares
 * are whole cents that always add up to the total.
 */
export function computeShares(
  totalCents: number,
  rule: SplitRule,
  activeMemberIds: number[],
): MemberShare[] {
  validateRule(rule);
  const shares =
    rule.type === 'EQUAL'
      ? (rule.shares.length > 0
          ? rule.shares.map((s) => s.memberId)
          : activeMemberIds
        ).map((memberId) => ({ memberId, value: 1 }))
      : rule.shares;
  if (shares.length === 0) {
    throw new SplitRuleError('The rule needs at least one member');
  }
  const ordered = [...shares].sort((a, b) => a.memberId - b.memberId);

  if (rule.type === 'FIXED') {
    if (sum(ordered.map((s) => s.value)) !== totalCents) {
      throw new SplitRuleError('The amount must equal the fixed values total');
    }
    return ordered.map((s) => ({ memberId: s.memberId, amountCents: s.value }));
  }

  return distribute(totalCents, ordered);
}

/**
 * Divides `totalCents` in proportion to the weights with the largest remainder
 * method: whole cents adding up to the total, the leftover cents going to the
 * largest remainders (ties to the earlier entry). Entries keep their order.
 */
export function distribute(
  totalCents: number,
  weights: { memberId: number; value: number }[],
): MemberShare[] {
  const weightTotal = sum(weights.map((w) => w.value));
  const parts = weights.map((w, index) => ({
    index,
    memberId: w.memberId,
    amountCents: Math.floor((totalCents * w.value) / weightTotal),
    remainder: (totalCents * w.value) % weightTotal,
  }));
  let left = totalCents - sum(parts.map((p) => p.amountCents));
  for (const part of [...parts].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  )) {
    if (left === 0) break;
    part.amountCents += 1;
    left -= 1;
  }
  return parts.map(({ memberId, amountCents }) => ({ memberId, amountCents }));
}

/**
 * Divides `totalCents` among the members of `shares` still in `keepIds`, in
 * proportion to their current shares (equally when those are all zero). Used
 * when a member leaves and the item's rule can't divide it anymore. `null`
 * when nobody is kept.
 */
export function redistribute(
  totalCents: number,
  shares: MemberShare[],
  keepIds: number[],
): MemberShare[] | null {
  const kept = shares
    .filter((s) => keepIds.includes(s.memberId))
    .sort((a, b) => a.memberId - b.memberId);
  if (kept.length === 0) return null;
  const allZero = kept.every((s) => s.amountCents === 0);
  return distribute(
    totalCents,
    kept.map((s) => ({
      memberId: s.memberId,
      value: allZero ? 1 : s.amountCents,
    })),
  );
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

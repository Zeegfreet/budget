/**
 * Money is handled as integer minor units (cents) end to end, matching the API.
 * Only convert to a decimal string at the display edge.
 */
export function formatCents(
  cents: number,
  locale = 'pt-BR',
  currency = 'BRL',
): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`Expected integer cents, received ${cents}`)
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    cents / 100,
  )
}

/** Cents as a plain pt-BR number for inputs: 180000 → "1.800,00" (no currency). */
export function formatAmount(cents: number, locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

const MONEY_INPUT = /^(-)?(?:R\$)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/

/**
 * Parses what a user types as money into integer cents, using string math only.
 * Accepts "1800", "1.800", "1.800,5", "1800,50", "R$ 10", "10.50" and, with
 * `allowNegative`, a leading "-". Returns `null` when it isn't a valid amount.
 */
export function parseMoneyInput(
  input: string,
  { allowNegative = false } = {},
): number | null {
  let text = input.replace(/\s/g, '')
  // A single dot followed by 1–2 digits is a decimal point ("10.5"), not thousands
  if (!text.includes(',') && /^-?(?:R\$)?\d+\.\d{1,2}$/.test(text)) {
    text = text.replace('.', ',')
  }
  const match = MONEY_INPUT.exec(text)
  if (!match) return null
  const [, minus, whole, fraction = ''] = match
  if (minus && !allowNegative) return null
  const cents =
    Number(whole.replaceAll('.', '')) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return minus && cents !== 0 ? -cents : cents
}

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

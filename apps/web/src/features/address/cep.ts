/** The 27 Brazilian federative units, used to validate a manually typed UF. */
export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const

export type BrazilianState = (typeof BRAZILIAN_STATES)[number]

export function isBrazilianState(value: string): value is BrazilianState {
  return (BRAZILIAN_STATES as readonly string[]).includes(value)
}

/** Keeps only the digits, capped at the 8 a CEP has. */
export function normalizeCep(value: string) {
  return value.replace(/\D/g, '').slice(0, 8)
}

/** Display mask `00000-000`, applied as the user types. */
export function formatCep(value: string) {
  const digits = normalizeCep(value)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export function isCompleteCep(value: string) {
  return normalizeCep(value).length === 8
}

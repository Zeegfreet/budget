/** Blank → null; whole number in range → number; otherwise undefined (invalid). */
export function parseWhole(text: string, min: number, max: number): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return value >= min && value <= max ? value : undefined
}

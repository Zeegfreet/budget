const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

/** `2026-10-12T15:00:00Z` → `12/10/2026` (local time). */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso))

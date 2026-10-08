/** Same limit as the API */
export const MAX_PAYMENT_URL_LENGTH = 2000

export const INVALID_PAYMENT_URL = 'Informe um link válido, como https://www.banco.com.br/boleto.'

/**
 * Link to a bill or payment portal typed by the user. Blank → null; an
 * http(s) address → its normalized form (a missing protocol becomes
 * `https://`, as in "www.banco.com.br/boleto"); otherwise undefined (invalid).
 */
export function parsePaymentUrl(text: string): string | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    return undefined
  }
  // A host with a dot, like the API's check (no "https://boleto")
  if (!['http:', 'https:'].includes(url.protocol) || !/\.[a-z]{2,}$/i.test(url.hostname)) return undefined
  return url.href.length <= MAX_PAYMENT_URL_LENGTH ? url.href : undefined
}

/** The link's host without "www.", for labels ("banco.com.br") */
export function paymentUrlHost(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return href
  }
}

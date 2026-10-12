/**
 * Full-page navigation to another site or app (e.g. back to an AI agent with
 * its authorization code). A module of its own so tests can mock it.
 */
export function assignLocation(url: string) {
  window.location.assign(url)
}

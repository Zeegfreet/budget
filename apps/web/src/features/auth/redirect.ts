/**
 * Only allow same-app paths as post-login destinations, so `?redirect=` can't
 * send users to another site (open redirect). `//host` and `/\host` are
 * protocol-relative URLs in browsers, so they're rejected too.
 */
export function safeRedirect(path: string | undefined, fallback = '/') {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return fallback
  }
  return path
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Schemes that can run code or read local data in the browser */
const UNSAFE_SCHEMES = new Set([
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'about:',
  'blob:',
  'ftp:',
  'ws:',
  'wss:',
]);

const parse = (uri: string) => {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
};

const isLoopback = (url: URL) =>
  url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);

/**
 * Redirect URIs a client may register: https, http on a loopback address
 * (native apps such as CLIs, RFC 8252) or a private-use scheme such as
 * `cursor://`. Never with a fragment.
 */
export function isAllowedRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length > 2000) return false;
  const url = parse(uri);
  if (!url || url.hash || uri.includes('#')) return false;
  if (url.protocol === 'https:') return Boolean(url.hostname);
  if (url.protocol === 'http:') return isLoopback(url);
  return (
    !UNSAFE_SCHEMES.has(url.protocol) &&
    /^[a-z][a-z0-9+.-]*:$/.test(url.protocol)
  );
}

/**
 * Whether `given` is one of the client's registered URIs. Exact match, except
 * that a loopback URI may use any port (RFC 8252 §7.3).
 */
export function matchRedirectUri(
  registered: readonly string[],
  given: string,
): boolean {
  if (registered.includes(given)) return true;
  const url = parse(given);
  if (!url || !isLoopback(url)) return false;
  return registered.some((uri) => {
    const candidate = parse(uri);
    if (!candidate || !isLoopback(candidate)) return false;
    candidate.port = url.port;
    return candidate.href === url.href;
  });
}

/** `uri` with the given query parameters added (undefined ones skipped). */
export function withParams(
  uri: string,
  params: Record<string, string | undefined | null>,
): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  return url.toString();
}

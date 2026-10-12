import { createHash, timingSafeEqual } from 'node:crypto';

/** RFC 7636: 43–128 unreserved characters. */
export const isCodeVerifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9\-._~]{43,128}$/.test(value);

/** A S256 challenge is the base64url SHA-256 of a verifier: 43 characters. */
export const isCodeChallenge = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export const s256 = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

/** Whether `verifier` is the one the S256 `challenge` was made from. */
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (!isCodeVerifier(verifier)) return false;
  const expected = Buffer.from(challenge);
  const actual = Buffer.from(s256(verifier));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

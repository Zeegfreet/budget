import { createHash, randomBytes } from 'node:crypto';

/** What is stored for a link: the SHA-256 of its secret. */
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** 32 random bytes in base64url; anything else can't be a token. */
export const isTokenShaped = (token: unknown): token is string =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

/** A new secret for an e-mailed link. */
export const newToken = () => randomBytes(32).toString('base64url');

import { createHash, randomBytes } from 'node:crypto';
import { isOAuthProvider, type OAuthProviderId } from './providers.js';

/** Short-lived cookie tying the callback to the browser that started the flow. */
export const OAUTH_STATE_COOKIE = 'oauth_state';
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

export interface OAuthState {
  provider: OAuthProviderId;
  /** Echoed back by the provider; must match the query's `state` */
  state: string;
  /** PKCE secret; only its S256 challenge goes to the provider */
  verifier: string;
  /** Same-app path to open after signing in */
  redirect: string;
}

const randomToken = () => randomBytes(32).toString('base64url');

export function createOAuthState(
  provider: OAuthProviderId,
  redirect: string,
): OAuthState {
  return { provider, state: randomToken(), verifier: randomToken(), redirect };
}

export function codeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Only same-app paths, so `?redirect=` can't send users to another site (open
 * redirect). `//host` and `/\host` are protocol-relative in browsers. Mirrors
 * the web's `safeRedirect`.
 */
export function safeRedirectPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return '/';
  }
  return value;
}

export const serializeOAuthState = (state: OAuthState) => JSON.stringify(state);

/** `null` for a missing or malformed cookie. */
export function parseOAuthState(cookie: unknown): OAuthState | null {
  if (typeof cookie !== 'string') return null;
  try {
    const value = JSON.parse(cookie) as Partial<OAuthState> | null;
    if (
      !value ||
      !isOAuthProvider(value.provider) ||
      typeof value.state !== 'string' ||
      typeof value.verifier !== 'string'
    ) {
      return null;
    }
    return {
      provider: value.provider,
      state: value.state,
      verifier: value.verifier,
      redirect: safeRedirectPath(value.redirect),
    };
  } catch {
    return null;
  }
}

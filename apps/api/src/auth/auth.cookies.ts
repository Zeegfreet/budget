import type { CookieOptions, Response } from 'express';
import type { AuthConfig } from './auth.config.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
/** The refresh cookie is only sent to /auth/refresh and /auth/logout. */
export const REFRESH_COOKIE_PATH = '/auth';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function baseOptions(config: AuthConfig): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure };
}

export function setAuthCookies(
  res: Response,
  tokens: AuthTokens,
  config: AuthConfig,
) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(config),
    path: '/',
    maxAge: config.accessTtlSeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(config),
    path: REFRESH_COOKIE_PATH,
    maxAge: config.refreshTtlDays * DAY_MS,
  });
}

export function clearAuthCookies(res: Response, config: AuthConfig) {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(config), path: '/' });
  res.clearCookie(REFRESH_COOKIE, {
    ...baseOptions(config),
    path: REFRESH_COOKIE_PATH,
  });
}

import { ConfigService } from '@nestjs/config';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfig {
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  /** `Secure` flag on the session cookies (HTTPS only) */
  cookieSecure: boolean;
}

export function authConfigFactory(config: ConfigService): AuthConfig {
  const cookieSecure = config.get<string>('COOKIE_SECURE');
  return {
    accessSecret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    accessTtlSeconds: Number(config.get('JWT_ACCESS_TTL_SECONDS') ?? 900),
    refreshTtlDays: Number(config.get('REFRESH_TOKEN_TTL_DAYS') ?? 7),
    cookieSecure:
      cookieSecure === undefined
        ? config.get('NODE_ENV') === 'production'
        : cookieSecure === 'true',
  };
}

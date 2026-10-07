import type { ConfigService } from '@nestjs/config';
import { authConfigFactory } from './auth.config.js';

const configService = (env: Record<string, string>) =>
  ({
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      if (!(key in env)) throw new Error(`${key} missing`);
      return env[key];
    },
  }) as unknown as ConfigService;

describe('authConfigFactory', () => {
  it('applies defaults', () => {
    expect(
      authConfigFactory(configService({ JWT_ACCESS_SECRET: 's' })),
    ).toEqual({
      accessSecret: 's',
      accessTtlSeconds: 900,
      refreshTtlDays: 7,
      cookieSecure: false,
    });
  });

  it('uses Secure cookies in production unless disabled', () => {
    const prod = { JWT_ACCESS_SECRET: 's', NODE_ENV: 'production' };
    expect(authConfigFactory(configService(prod)).cookieSecure).toBe(true);
    expect(
      authConfigFactory(configService({ ...prod, COOKIE_SECURE: 'false' }))
        .cookieSecure,
    ).toBe(false);
  });

  it('reads custom TTLs', () => {
    const config = authConfigFactory(
      configService({
        JWT_ACCESS_SECRET: 's',
        JWT_ACCESS_TTL_SECONDS: '60',
        REFRESH_TOKEN_TTL_DAYS: '30',
      }),
    );
    expect(config).toMatchObject({ accessTtlSeconds: 60, refreshTtlDays: 30 });
  });

  it('requires the JWT secret', () => {
    expect(() => authConfigFactory(configService({}))).toThrow(
      'JWT_ACCESS_SECRET',
    );
  });
});

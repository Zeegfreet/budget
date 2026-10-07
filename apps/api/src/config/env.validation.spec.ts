import { validateEnv } from './env.validation.js';

const valid = { DATABASE_URL: 'file:./test.db', JWT_ACCESS_SECRET: 'secret' };

describe('validateEnv', () => {
  it('accepts the required variables', () => {
    expect(validateEnv(valid)).toEqual(valid);
  });

  it('accepts valid optional variables', () => {
    const env = {
      ...valid,
      JWT_ACCESS_TTL_SECONDS: '900',
      REFRESH_TOKEN_TTL_DAYS: '7',
      COOKIE_SECURE: 'false',
    };
    expect(validateEnv(env)).toEqual(env);
  });

  it('requires DATABASE_URL and JWT_ACCESS_SECRET', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: '' })).toThrow(
      /DATABASE_URL is required; JWT_ACCESS_SECRET is required/,
    );
  });

  it.each([
    ['JWT_ACCESS_TTL_SECONDS', '15m'],
    ['REFRESH_TOKEN_TTL_DAYS', '0'],
    ['COOKIE_SECURE', 'yes'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => validateEnv({ ...valid, [key]: value })).toThrow(key);
  });
});

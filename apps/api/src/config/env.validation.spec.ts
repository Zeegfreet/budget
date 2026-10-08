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
      GITHUB_CLIENT_ID: 'gh-id',
      GITHUB_CLIENT_SECRET: 'gh-secret',
      WEB_URL: 'https://budget.app',
      OAUTH_CALLBACK_BASE_URL: 'https://budget.app/api',
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
    ['WEB_URL', 'budget.app'],
    ['OAUTH_CALLBACK_BASE_URL', 'ftp://budget.app'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => validateEnv({ ...valid, [key]: value })).toThrow(key);
  });

  it.each([
    [{ GITHUB_CLIENT_ID: 'id' }, 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET'],
    [
      { GOOGLE_CLIENT_SECRET: 's' },
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
    ],
  ])('requires both OAuth credentials of a provider (%o)', (extra, message) => {
    expect(() => validateEnv({ ...valid, ...extra })).toThrow(message);
  });
});

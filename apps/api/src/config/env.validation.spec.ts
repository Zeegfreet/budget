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
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'budget',
      SMTP_PASS: 'smtp-secret',
      ACTIVATION_TOKEN_TTL_HOURS: '48',
      PASSWORD_RESET_TOKEN_TTL_MINUTES: '30',
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
    ['SMTP_PORT', 'smtp'],
    ['SMTP_SECURE', '1'],
    ['ACTIVATION_TOKEN_TTL_HOURS', '-1'],
    ['PASSWORD_RESET_TOKEN_TTL_MINUTES', '0'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => validateEnv({ ...valid, [key]: value })).toThrow(key);
  });

  it.each([
    [{ GITHUB_CLIENT_ID: 'id' }, 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET'],
    [
      { GOOGLE_CLIENT_SECRET: 's' },
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
    ],
    [{ SMTP_USER: 'budget' }, 'SMTP_USER and SMTP_PASS'],
  ])('requires both credentials of a pair (%o)', (extra, message) => {
    expect(() => validateEnv({ ...valid, ...extra })).toThrow(message);
  });

  it('requires SMTP_HOST in production', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'production' })).toThrow(
      'SMTP_HOST is required in production',
    );
    const env = { ...valid, NODE_ENV: 'production', SMTP_HOST: 'smtp' };
    expect(validateEnv(env)).toEqual(env);
  });
});

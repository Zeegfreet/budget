const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET'] as const;
const positiveIntegers = [
  'JWT_ACCESS_TTL_SECONDS',
  'REFRESH_TOKEN_TTL_DAYS',
  'SMTP_PORT',
  'ACTIVATION_TOKEN_TTL_HOURS',
] as const;
const booleans = ['COOKIE_SECURE', 'SMTP_SECURE'] as const;
/** Optional credentials that only make sense together */
const pairs = [
  ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  ['SMTP_USER', 'SMTP_PASS'],
] as const;
const urls = ['WEB_URL', 'OAUTH_CALLBACK_BASE_URL'] as const;

const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Fails fast on boot when the environment is missing or malformed. */
export function validateEnv(env: Record<string, unknown>) {
  const errors: string[] = [];

  for (const key of required) {
    if (typeof env[key] !== 'string' || !env[key])
      errors.push(`${key} is required`);
  }
  // Without SMTP the activation links only reach the log
  if (env.NODE_ENV === 'production' && !env.SMTP_HOST) {
    errors.push('SMTP_HOST is required in production');
  }
  for (const key of positiveIntegers) {
    const value = env[key];
    if (
      value !== undefined &&
      !(typeof value === 'string' && /^[1-9]\d*$/.test(value))
    ) {
      errors.push(`${key} must be a positive integer`);
    }
  }
  for (const key of booleans) {
    const value = env[key];
    if (value !== undefined && value !== 'true' && value !== 'false') {
      errors.push(`${key} must be "true" or "false"`);
    }
  }
  for (const [id, secret] of pairs) {
    if (Boolean(env[id]) !== Boolean(env[secret])) {
      errors.push(`${id} and ${secret} must be set together`);
    }
  }
  for (const key of urls) {
    const value = env[key];
    if (
      value !== undefined &&
      !(typeof value === 'string' && isHttpUrl(value))
    ) {
      errors.push(`${key} must be an http(s) URL`);
    }
  }

  if (errors.length)
    throw new Error(`Invalid environment: ${errors.join('; ')}`);
  return env;
}

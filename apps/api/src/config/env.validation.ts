const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET'] as const;
const positiveIntegers = [
  'JWT_ACCESS_TTL_SECONDS',
  'REFRESH_TOKEN_TTL_DAYS',
] as const;
const booleans = ['COOKIE_SECURE'] as const;

/** Fails fast on boot when the environment is missing or malformed. */
export function validateEnv(env: Record<string, unknown>) {
  const errors: string[] = [];

  for (const key of required) {
    if (typeof env[key] !== 'string' || !env[key])
      errors.push(`${key} is required`);
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

  if (errors.length)
    throw new Error(`Invalid environment: ${errors.join('; ')}`);
  return env;
}

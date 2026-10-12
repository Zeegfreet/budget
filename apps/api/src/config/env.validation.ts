const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET'] as const;
const positiveIntegers = [
  'JWT_ACCESS_TTL_SECONDS',
  'REFRESH_TOKEN_TTL_DAYS',
  'SMTP_PORT',
  'ACTIVATION_TOKEN_TTL_HOURS',
  'PASSWORD_RESET_TOKEN_TTL_MINUTES',
  'MCP_PORT',
  'MCP_ACCESS_TOKEN_TTL_MINUTES',
  'MCP_REFRESH_TOKEN_TTL_DAYS',
] as const;
const booleans = ['COOKIE_SECURE', 'SMTP_SECURE'] as const;
/** Optional credentials that only make sense together */
const pairs = [
  ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  ['SMTP_USER', 'SMTP_PASS'],
] as const;
const urls = ['WEB_URL', 'OAUTH_CALLBACK_BASE_URL', 'MCP_PUBLIC_URL'] as const;

const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/**
 * Fails fast on boot when the environment is missing or malformed. The MCP
 * process (no sessions, no e-mail) passes `mcp: true`: it only needs the
 * database.
 */
export function validateEnv(
  env: Record<string, unknown>,
  { mcp = false }: { mcp?: boolean } = {},
) {
  const errors: string[] = [];

  for (const key of mcp ? (['DATABASE_URL'] as const) : required) {
    if (typeof env[key] !== 'string' || !env[key])
      errors.push(`${key} is required`);
  }
  // Catches a leftover SQLite `file:./dev.db` from before the PostgreSQL move
  const databaseUrl = env.DATABASE_URL;
  if (
    typeof databaseUrl === 'string' &&
    databaseUrl &&
    !/^postgres(ql)?:\/\//.test(databaseUrl)
  ) {
    errors.push('DATABASE_URL must be a postgresql:// URL');
  }
  // Without SMTP the activation links only reach the log
  if (!mcp && env.NODE_ENV === 'production' && !env.SMTP_HOST) {
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
  // Single Docker image: the API under /<API_PREFIX>, the web build on the rest
  const prefix = env.API_PREFIX;
  if (
    prefix !== undefined &&
    !(typeof prefix === 'string' && /^[a-z0-9-]+$/.test(prefix))
  ) {
    errors.push('API_PREFIX must be a path segment like "api" (no slashes)');
  }
  if (env.WEB_DIST_DIR !== undefined && !prefix) {
    // Without a prefix the web routes would clash with the API's
    errors.push('WEB_DIST_DIR requires API_PREFIX');
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

/** `validateEnv` for the MCP process (`src/mcp/main.ts`, `src/mcp/stdio.ts`). */
export const validateMcpEnv = (env: Record<string, unknown>) =>
  validateEnv(env, { mcp: true });

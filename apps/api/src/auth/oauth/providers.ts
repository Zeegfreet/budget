import type { OAuthProvider as OAuthProviderEnum } from '../../prisma/generated/client.js';
import type { OAuthClient } from './oauth.config.js';

export const OAUTH_PROVIDERS = ['github', 'google'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

export const isOAuthProvider = (value: unknown): value is OAuthProviderId =>
  OAUTH_PROVIDERS.includes(value as OAuthProviderId);

/** What sign-in needs from the provider's account. */
export interface OAuthProfile {
  /** Stable id at the provider (never the e-mail, which can change) */
  providerAccountId: string;
  email: string | null;
  /** Only a verified e-mail may find or link an existing account */
  emailVerified: boolean;
  name: string;
}

/** The provider answered with an error or something unexpected. */
export class OAuthProviderError extends Error {}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

export interface ExchangeParams {
  client: OAuthClient;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface OAuthProviderDefinition {
  /** Stored in `OAuthAccount.provider` */
  dbValue: OAuthProviderEnum;
  authorizeUrl(params: AuthorizeParams): string;
  /** Swaps the authorization code for a token and reads the account. */
  fetchProfile(params: ExchangeParams): Promise<OAuthProfile>;
}

/** Same bounds as the sign-up name (2–100 characters). */
const NAME_MAX = 100;

function displayName(name: unknown, email: string | null): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length >= 2) return trimmed.slice(0, NAME_MAX);
  const local = email?.split('@')[0] ?? '';
  if (local.length >= 2) return local.slice(0, NAME_MAX);
  return (email ?? 'Usuário').slice(0, NAME_MAX);
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new OAuthProviderError(`Request to ${url} failed`, { cause: error });
  }
  if (!res.ok) {
    throw new OAuthProviderError(`${url} answered ${res.status}`);
  }
  return res.json().catch((error: unknown) => {
    throw new OAuthProviderError(`${url} sent invalid JSON`, { cause: error });
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function exchangeCode(
  tokenUrl: string,
  { client, code, codeVerifier, redirectUri }: ExchangeParams,
): Promise<string> {
  const body = await requestJson(tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  // GitHub reports a bad code as 200 with `{ error }`
  if (!isRecord(body) || typeof body.access_token !== 'string') {
    throw new OAuthProviderError('No access token in the token response');
  }
  return body.access_token;
}

function authorizeUrl(
  base: string,
  scope: string,
  { clientId, redirectUri, state, codeChallenge }: AuthorizeParams,
) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${base}?${params}`;
}

const GITHUB_API = 'https://api.github.com';

const github: OAuthProviderDefinition = {
  dbValue: 'GITHUB',
  authorizeUrl: (params) =>
    authorizeUrl(
      'https://github.com/login/oauth/authorize',
      'read:user user:email',
      params,
    ),
  async fetchProfile(params) {
    const token = await exchangeCode(
      'https://github.com/login/oauth/access_token',
      params,
    );
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      // GitHub rejects API calls without a User-Agent
      'User-Agent': 'budget-app',
    };
    const [user, emails] = await Promise.all([
      requestJson(`${GITHUB_API}/user`, { headers }),
      requestJson(`${GITHUB_API}/user/emails`, { headers }),
    ]);
    if (!isRecord(user) || typeof user.id !== 'number') {
      throw new OAuthProviderError('Unexpected GitHub user');
    }
    const verified = (Array.isArray(emails) ? emails : []).filter(
      (e): e is { email: string; primary?: boolean } =>
        isRecord(e) && typeof e.email === 'string' && e.verified === true,
    );
    // The primary e-mail when verified, else any verified one
    const email = (verified.find((e) => e.primary) ?? verified[0])?.email;
    return {
      providerAccountId: String(user.id),
      email: email ?? null,
      emailVerified: email !== undefined,
      name: displayName(user.name ?? user.login, email ?? null),
    };
  },
};

const google: OAuthProviderDefinition = {
  dbValue: 'GOOGLE',
  authorizeUrl: (params) =>
    authorizeUrl(
      'https://accounts.google.com/o/oauth2/v2/auth',
      'openid email profile',
      params,
    ),
  async fetchProfile(params) {
    const token = await exchangeCode(
      'https://oauth2.googleapis.com/token',
      params,
    );
    const info = await requestJson(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!isRecord(info) || typeof info.sub !== 'string') {
      throw new OAuthProviderError('Unexpected Google user info');
    }
    const email = typeof info.email === 'string' ? info.email : null;
    return {
      providerAccountId: info.sub,
      email,
      emailVerified: email !== null && info.email_verified === true,
      name: displayName(info.name, email),
    };
  },
};

export const oauthProviders: Record<OAuthProviderId, OAuthProviderDefinition> =
  { github, google };

import { ConfigService } from '@nestjs/config';
import type { OAuthProviderId } from './providers.js';

export const OAUTH_CONFIG = Symbol('OAUTH_CONFIG');

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface OAuthConfig {
  /** Where the browser lands after the callback (the web app) */
  webUrl: string;
  /**
   * The API as the browser reaches it. It must be on the web's host (the Vite
   * proxy in dev), so the session cookies set by the callback reach the web.
   */
  callbackBaseUrl: string;
  /** Only the providers with credentials; the others are unavailable */
  clients: Partial<Record<OAuthProviderId, OAuthClient>>;
}

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

export function oauthConfigFactory(config: ConfigService): OAuthConfig {
  const webUrl = withoutTrailingSlash(
    config.get<string>('WEB_URL') ?? 'http://localhost:5173',
  );
  const client = (prefix: string): OAuthClient | undefined => {
    const clientId = config.get<string>(`${prefix}_CLIENT_ID`);
    const clientSecret = config.get<string>(`${prefix}_CLIENT_SECRET`);
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
  };
  const github = client('GITHUB');
  const google = client('GOOGLE');
  return {
    webUrl,
    callbackBaseUrl: withoutTrailingSlash(
      config.get<string>('OAUTH_CALLBACK_BASE_URL') ?? `${webUrl}/api`,
    ),
    clients: { ...(github && { github }), ...(google && { google }) },
  };
}

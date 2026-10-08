import type { ConfigService } from '@nestjs/config';
import { oauthConfigFactory } from './oauth.config.js';

const configService = (env: Record<string, string>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

describe('oauthConfigFactory', () => {
  it('defaults to the Vite dev server and no providers', () => {
    expect(oauthConfigFactory(configService({}))).toEqual({
      webUrl: 'http://localhost:5173',
      callbackBaseUrl: 'http://localhost:5173/api',
      clients: {},
    });
  });

  it('reads the URLs (without trailing slashes) and the credentials', () => {
    const config = oauthConfigFactory(
      configService({
        WEB_URL: 'https://budget.app/',
        OAUTH_CALLBACK_BASE_URL: 'https://api.budget.app/',
        GITHUB_CLIENT_ID: 'gh-id',
        GITHUB_CLIENT_SECRET: 'gh-secret',
        GOOGLE_CLIENT_ID: 'g-id',
      }),
    );

    expect(config).toEqual({
      webUrl: 'https://budget.app',
      callbackBaseUrl: 'https://api.budget.app',
      clients: { github: { clientId: 'gh-id', clientSecret: 'gh-secret' } },
    });
  });

  it('derives the callback base from WEB_URL', () => {
    expect(
      oauthConfigFactory(configService({ WEB_URL: 'https://budget.app' }))
        .callbackBaseUrl,
    ).toBe('https://budget.app/api');
  });
});

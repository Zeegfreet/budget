import { NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthConfig } from '../auth.config.js';
import type { AuthService } from '../auth.service.js';
import type { OAuthConfig } from './oauth.config.js';
import { OAuthController } from './oauth.controller.js';
import { OAUTH_STATE_COOKIE, serializeOAuthState } from './oauth-state.js';
import { OAuthError, type OAuthService } from './oauth.service.js';

const authConfig: AuthConfig = {
  accessSecret: 'secret',
  accessTtlSeconds: 900,
  refreshTtlDays: 7,
  cookieSecure: true,
  refreshCookiePath: '/auth',
};
const config: OAuthConfig = {
  webUrl: 'http://web',
  callbackBaseUrl: 'http://web/api',
  clients: {},
};
const user = { id: 1, email: 'ana@example.com', name: 'Ana Souza' };
const saved = {
  provider: 'github' as const,
  state: 'st',
  verifier: 'ver',
  redirect: '/extrato',
};

describe('OAuthController', () => {
  const oauth = {
    isEnabled: vi.fn(),
    authorizationUrl: vi.fn(),
    authenticate: vi.fn(),
  };
  const authService = { signIn: vi.fn() };
  const controller = new OAuthController(
    oauth as unknown as OAuthService,
    authService as unknown as AuthService,
    authConfig,
    config,
  );
  const res = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  };
  const response = res as unknown as Response;
  const req = (cookies: Record<string, string> = {}) =>
    ({ ip: '::1', get: () => 'agent', cookies }) as unknown as Request;

  beforeEach(() => {
    vi.clearAllMocks();
    oauth.isEnabled.mockReturnValue(true);
    oauth.authorizationUrl.mockReturnValue('https://provider/authorize');
  });

  describe('start', () => {
    it('saves the flow in a cookie and redirects to the provider', () => {
      controller.start('github', '/extrato', response);

      const [name, value, options] = res.cookie.mock.calls[0];
      expect(name).toBe(OAUTH_STATE_COOKIE);
      expect(JSON.parse(value)).toMatchObject({
        provider: 'github',
        redirect: '/extrato',
      });
      expect(options).toEqual({
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/auth',
        maxAge: 600_000,
      });
      expect(oauth.authorizationUrl).toHaveBeenCalledWith(
        'github',
        JSON.parse(value),
      );
      expect(res.redirect).toHaveBeenCalledWith('https://provider/authorize');
    });

    it('drops an external redirect', () => {
      controller.start('github', 'https://evil.com', response);

      expect(JSON.parse(res.cookie.mock.calls[0][1]).redirect).toBe('/');
    });

    it('sends the user back when the provider has no credentials', () => {
      oauth.isEnabled.mockReturnValue(false);

      controller.start('google', '/extrato', response);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://web/login?error=oauth_unavailable&redirect=%2Fextrato',
      );
    });

    it('404s an unknown provider', () => {
      expect(() => controller.start('facebook', undefined, response)).toThrow(
        NotFoundException,
      );
    });
  });

  describe('callback', () => {
    const cookies = { [OAUTH_STATE_COOKIE]: serializeOAuthState(saved) };

    it('opens a session and goes to the saved path', async () => {
      oauth.authenticate.mockResolvedValue(user);
      authService.signIn.mockResolvedValue({
        user,
        tokens: { accessToken: 'access', refreshToken: 'refresh' },
      });

      await controller.callback(
        'github',
        'code',
        'st',
        undefined,
        req(cookies),
        response,
      );

      expect(oauth.authenticate).toHaveBeenCalledWith(
        'github',
        { code: 'code', state: 'st', error: undefined },
        saved,
      );
      expect(authService.signIn).toHaveBeenCalledWith(user, {
        userAgent: 'agent',
        ip: '::1',
      });
      expect(res.clearCookie).toHaveBeenCalledWith(
        OAUTH_STATE_COOKIE,
        expect.objectContaining({ path: '/auth' }),
      );
      expect(res.cookie.mock.calls.map(([name]) => name)).toEqual([
        'access_token',
        'refresh_token',
      ]);
      expect(res.redirect).toHaveBeenCalledWith('http://web/extrato');
    });

    it('sends an OAuth error code back to the login', async () => {
      oauth.authenticate.mockRejectedValue(new OAuthError('oauth_email'));

      await controller.callback(
        'github',
        'code',
        'st',
        undefined,
        req(cookies),
        response,
      );

      expect(authService.signIn).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://web/login?error=oauth_email&redirect=%2Fextrato',
      );
    });

    it('reports an unexpected failure as oauth_failed', async () => {
      oauth.authenticate.mockRejectedValue(new Error('db down'));

      await controller.callback('github', 'c', 's', undefined, req(), response);

      expect(oauth.authenticate).toHaveBeenCalledWith(
        'github',
        expect.anything(),
        null,
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'http://web/login?error=oauth_failed',
      );
    });

    it('404s an unknown provider', async () => {
      await expect(
        controller.callback('x', 'c', 's', undefined, req(), response),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

import {
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiFoundResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AUTH_CONFIG, type AuthConfig } from '../auth.config.js';
import { REFRESH_COOKIE_PATH, setAuthCookies } from '../auth.cookies.js';
import { AuthService } from '../auth.service.js';
import { Public } from '../decorators/public.decorator.js';
import { OAUTH_CONFIG, type OAuthConfig } from './oauth.config.js';
import {
  createOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  parseOAuthState,
  safeRedirectPath,
  serializeOAuthState,
} from './oauth-state.js';
import {
  OAuthError,
  type OAuthErrorCode,
  OAuthService,
} from './oauth.service.js';
import {
  isOAuthProvider,
  OAUTH_PROVIDERS,
  type OAuthProviderId,
} from './providers.js';

const OAUTH_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

/**
 * GitHub/Google sign-in. Both routes are full-page navigations that answer
 * with redirects (to the provider, or back to the web), never JSON.
 */
@ApiTags('auth')
@Public()
@Throttle(OAUTH_THROTTLE)
@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly authService: AuthService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
    @Inject(OAUTH_CONFIG) private readonly config: OAuthConfig,
  ) {}

  /** Starts the flow: remembers it in a cookie and sends the browser to the provider. */
  @Get(':provider')
  @ApiParam({ name: 'provider', enum: OAUTH_PROVIDERS })
  @ApiQuery({
    name: 'redirect',
    required: false,
    description: 'Same-app path to open after signing in',
  })
  @ApiFoundResponse({
    description:
      'To the provider, or to the web login with `?error=oauth_unavailable`',
  })
  @ApiNotFoundResponse({ description: 'Unknown provider' })
  @ApiTooManyRequestsResponse()
  start(
    @Param('provider') provider: string,
    @Query('redirect') redirect: unknown,
    @Res() res: Response,
  ) {
    const id = this.parseProvider(provider);
    const target = safeRedirectPath(redirect);
    if (!this.oauth.isEnabled(id)) {
      return this.fail(res, 'oauth_unavailable', target);
    }
    const saved = createOAuthState(id, target);
    res.cookie(OAUTH_STATE_COOKIE, serializeOAuthState(saved), {
      ...this.stateCookieOptions(),
      maxAge: OAUTH_STATE_TTL_MS,
    });
    res.redirect(this.oauth.authorizationUrl(id, saved));
  }

  /** The provider sends the browser back here with `code` and `state`. */
  @Get(':provider/callback')
  @ApiParam({ name: 'provider', enum: OAUTH_PROVIDERS })
  @ApiFoundResponse({
    description:
      'Signed in (session cookies set) to the saved path, or to the web login with `?error=<code>`',
  })
  @ApiNotFoundResponse({ description: 'Unknown provider' })
  @ApiTooManyRequestsResponse()
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Query('error') error: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const id = this.parseProvider(provider);
    const saved = parseOAuthState(req.cookies?.[OAUTH_STATE_COOKIE]);
    res.clearCookie(OAUTH_STATE_COOKIE, this.stateCookieOptions());
    const target = saved?.redirect ?? '/';

    try {
      const user = await this.oauth.authenticate(
        id,
        { code, state, error },
        saved,
      );
      const { tokens } = await this.authService.signIn(user, {
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
      setAuthCookies(res, tokens, this.authConfig);
      res.redirect(`${this.config.webUrl}${target}`);
    } catch (err) {
      if (err instanceof OAuthError) return this.fail(res, err.code, target);
      this.logger.error(`${id} sign-in failed`, err);
      this.fail(res, 'oauth_failed', target);
    }
  }

  private parseProvider(provider: string): OAuthProviderId {
    if (!isOAuthProvider(provider)) throw new NotFoundException();
    return provider;
  }

  /** Back to the web login, keeping where the user was going. */
  private fail(res: Response, code: OAuthErrorCode, target: string) {
    const params = new URLSearchParams({ error: code });
    if (target !== '/') params.set('redirect', target);
    res.redirect(`${this.config.webUrl}/login?${params}`);
  }

  /** Same scope as the refresh cookie: `/auth` (the dev proxy maps it to `/api/auth`). */
  private stateCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      // Lax: still sent on the top-level redirect back from the provider
      sameSite: 'lax',
      secure: this.authConfig.cookieSecure,
      path: REFRESH_COOKIE_PATH,
    };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { isUniqueViolation } from '../../prisma/errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type AuthUser, authUserSelect } from '../../user/user.service.js';
import { normalizeEmail } from '../auth.service.js';
import { OAUTH_CONFIG, type OAuthConfig } from './oauth.config.js';
import { codeChallenge, type OAuthState } from './oauth-state.js';
import {
  type OAuthProfile,
  OAuthProviderError,
  type OAuthProviderId,
  oauthProviders,
} from './providers.js';

/** `?error=` codes the web's login page translates. */
export type OAuthErrorCode =
  | 'access_denied'
  | 'oauth_unavailable'
  | 'oauth_state'
  | 'oauth_email'
  | 'oauth_failed';

export class OAuthError extends Error {
  constructor(readonly code: OAuthErrorCode) {
    super(code);
  }
}

export interface OAuthCallbackQuery {
  code?: unknown;
  state?: unknown;
  error?: unknown;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    @Inject(OAUTH_CONFIG) private readonly config: OAuthConfig,
    private readonly prisma: PrismaService,
  ) {}

  isEnabled(provider: OAuthProviderId) {
    return this.config.clients[provider] !== undefined;
  }

  /** The provider's consent page for this flow. */
  authorizationUrl(provider: OAuthProviderId, saved: OAuthState): string {
    const client = this.config.clients[provider];
    if (!client) throw new OAuthError('oauth_unavailable');
    return oauthProviders[provider].authorizeUrl({
      clientId: client.clientId,
      redirectUri: this.redirectUri(provider),
      state: saved.state,
      codeChallenge: codeChallenge(saved.verifier),
    });
  }

  /**
   * Checks the callback against the flow this browser started, reads the
   * provider's account and returns the user it signs in (created or linked
   * on the first time).
   */
  async authenticate(
    provider: OAuthProviderId,
    query: OAuthCallbackQuery,
    saved: OAuthState | null,
  ): Promise<AuthUser> {
    const client = this.config.clients[provider];
    if (!client) throw new OAuthError('oauth_unavailable');
    if (query.error !== undefined) {
      throw new OAuthError(
        query.error === 'access_denied' ? 'access_denied' : 'oauth_failed',
      );
    }
    if (
      !saved ||
      saved.provider !== provider ||
      typeof query.state !== 'string' ||
      query.state !== saved.state ||
      typeof query.code !== 'string' ||
      !query.code
    ) {
      throw new OAuthError('oauth_state');
    }

    let profile: OAuthProfile;
    try {
      profile = await oauthProviders[provider].fetchProfile({
        client,
        code: query.code,
        codeVerifier: saved.verifier,
        redirectUri: this.redirectUri(provider),
      });
    } catch (error) {
      if (!(error instanceof OAuthProviderError)) throw error;
      this.logger.warn(`${provider} sign-in failed: ${error.message}`);
      throw new OAuthError('oauth_failed');
    }
    return this.resolveUser(provider, profile);
  }

  /**
   * 1. an account already linked to this provider id signs in its user;
   * 2. else the verified e-mail finds a user: a pre-registration is taken
   *    over (same id, so groups stay), a registered user gets the link;
   *    either way the provider proved the e-mail, so the account becomes
   *    active, and a password set by a sign-up nobody activated is dropped
   *    (it was never proven to be the owner's);
   * 3. else a new user is created with only name and e-mail (they finish
   *    the sign-up on the web), already active.
   */
  async resolveUser(
    provider: OAuthProviderId,
    profile: OAuthProfile,
    retried = false,
  ): Promise<AuthUser> {
    const dbProvider = oauthProviders[provider].dbValue;
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: dbProvider,
          providerAccountId: profile.providerAccountId,
        },
      },
      select: { user: { select: authUserSelect } },
    });
    if (linked) return linked.user;

    if (!profile.email || !profile.emailVerified) {
      throw new OAuthError('oauth_email');
    }
    const email = normalizeEmail(profile.email);
    const account = {
      provider: dbProvider,
      providerAccountId: profile.providerAccountId,
      email,
    };

    try {
      const existing = await this.prisma.user.findUnique({
        where: { email },
        select: { ...authUserSelect, pending: true, emailVerifiedAt: true },
      });
      if (!existing) {
        return await this.prisma.user.create({
          data: {
            email,
            name: profile.name,
            emailVerifiedAt: new Date(),
            oauthAccounts: { create: account },
          },
          select: authUserSelect,
        });
      }

      const { pending, emailVerifiedAt, ...user } = existing;
      await this.prisma.$transaction([
        ...(emailVerifiedAt
          ? []
          : [
              this.prisma.user.updateMany({
                where: { id: user.id, emailVerifiedAt: null },
                data: {
                  emailVerifiedAt: new Date(),
                  passwordHash: null,
                  // Like a sign-up, the provider's name replaces the invite nickname
                  ...(pending && { pending: false, name: profile.name }),
                },
              }),
              // Its activation link has nothing left to do
              this.prisma.activationToken.deleteMany({
                where: { userId: user.id },
              }),
            ]),
        this.prisma.oAuthAccount.create({
          data: { ...account, userId: user.id },
        }),
      ]);
      return pending ? { ...user, name: profile.name } : user;
    } catch (error) {
      // Two callbacks raced for the same e-mail or account: the other won
      if (!retried && isUniqueViolation(error)) {
        return this.resolveUser(provider, profile, true);
      }
      throw error;
    }
  }

  private redirectUri(provider: OAuthProviderId) {
    return `${this.config.callbackBaseUrl}/auth/oauth/${provider}/callback`;
  }
}

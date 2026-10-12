import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { hashToken, isTokenShaped, newToken } from '../activation/token.js';
import { ROTATION_GRACE_MS } from '../auth/session.service.js';
import { MCP_CONFIG, type McpConfig } from '../mcp/mcp.config.js';
import type { McpClient } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OAuthError } from './oauth-error.js';
import { isCodeChallenge, verifyPkce } from './pkce.js';
import {
  isAllowedRedirectUri,
  matchRedirectUri,
  withParams,
} from './redirect-uri.js';
import { formatScopes, knownScopes, parseScopes } from './scopes.js';

/** How long the consent screen has to decide a request, and a code lives. */
const REQUEST_TTL_MS = 10 * 60_000;
const CODE_TTL_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const MAX_REDIRECT_URIS = 10;
const MAX_CLIENT_NAME_LENGTH = 100;
const MAX_STATE_LENGTH = 1000;
const DEFAULT_CLIENT_NAME = 'Aplicativo sem nome';
const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'];
const GRANT_TYPES = ['authorization_code', 'refresh_token'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Params = Record<string, unknown>;

/** A query/body parameter as a single string (a repeated one is invalid). */
const param = (params: Params, key: string) =>
  typeof params[key] === 'string' ? params[key] : undefined;

const sameHash = (a: string, b: string) => {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Response of `POST /oauth/register` (RFC 7591 §3.2.1). */
export interface ClientRegistration {
  client_id: string;
  client_id_issued_at: number;
  client_secret?: string;
  client_secret_expires_at?: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

/** Response of `POST /oauth/token` (RFC 6749 §5.1). */
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** What the consent screen shows about a pending request. */
export interface AuthorizationRequestInfo {
  id: string;
  client: { name: string };
  redirectHost: string;
  scopes: string[];
  expiresAt: Date;
}

/** One of the user's connected agents. */
export interface GrantInfo {
  id: number;
  client: { name: string };
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date;
}

/** Client credentials as sent to the token and revocation endpoints. */
export interface ClientCredentials {
  clientId?: string;
  clientSecret?: string;
}

/**
 * OAuth 2.1 authorization server for MCP clients: Dynamic Client Registration,
 * authorization code with PKCE (S256) decided on the web's consent screen,
 * rotating refresh tokens bound to the MCP resource, and revocation. Secrets
 * are stored as SHA-256 hashes only.
 */
@Injectable()
export class OAuthServerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MCP_CONFIG) private readonly config: McpConfig,
  ) {}

  /** RFC 7591: registers a client; public (PKCE only) unless it asks for a secret. */
  async register(body: Params): Promise<ClientRegistration> {
    const uris = body.redirect_uris;
    if (
      !Array.isArray(uris) ||
      uris.length === 0 ||
      uris.length > MAX_REDIRECT_URIS ||
      !uris.every(isAllowedRedirectUri)
    ) {
      throw new OAuthError(
        'invalid_redirect_uri',
        'redirect_uris must list 1 to 10 https, loopback http or private-use URIs without a fragment',
      );
    }
    const authMethod = body.token_endpoint_auth_method ?? 'none';
    if (typeof authMethod !== 'string' || !AUTH_METHODS.includes(authMethod)) {
      throw new OAuthError(
        'invalid_client_metadata',
        `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}`,
      );
    }
    const grantTypes = body.grant_types ?? GRANT_TYPES;
    if (
      !Array.isArray(grantTypes) ||
      !grantTypes.every((g) => GRANT_TYPES.includes(g as string))
    ) {
      throw new OAuthError(
        'invalid_client_metadata',
        'grant_types may only include authorization_code and refresh_token',
      );
    }
    const responseTypes = body.response_types ?? ['code'];
    if (
      !Array.isArray(responseTypes) ||
      !responseTypes.every((r) => r === 'code')
    ) {
      throw new OAuthError(
        'invalid_client_metadata',
        'response_types may only include code',
      );
    }
    const rawName = body.client_name;
    if (rawName !== undefined && typeof rawName !== 'string') {
      throw new OAuthError(
        'invalid_client_metadata',
        'client_name must be a string',
      );
    }
    const name =
      rawName?.trim().slice(0, MAX_CLIENT_NAME_LENGTH) || DEFAULT_CLIENT_NAME;

    const secret = authMethod === 'none' ? undefined : newToken();
    const client = await this.prisma.mcpClient.create({
      data: {
        name,
        redirectUris: uris,
        secretHash: secret && hashToken(secret),
      },
    });
    return {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      ...(secret && { client_secret: secret, client_secret_expires_at: 0 }),
      client_name: name,
      redirect_uris: client.redirectUris,
      grant_types: grantTypes as string[],
      response_types: ['code'],
      token_endpoint_auth_method: authMethod,
    };
  }

  /**
   * `GET /oauth/authorize`: validates the request and returns where to send
   * the browser — the consent screen, or the client with an error. Problems
   * found before the redirect URI is trusted go to the web's error screen.
   */
  async authorize(query: Params, now = new Date()): Promise<string> {
    const consentUrl = `${this.config.webUrl}/autorizar-agente`;
    const clientId = param(query, 'client_id');
    const client =
      clientId && UUID.test(clientId)
        ? await this.prisma.mcpClient.findUnique({ where: { id: clientId } })
        : null;
    if (!client) return withParams(consentUrl, { error: 'invalid_client' });

    const given = param(query, 'redirect_uri');
    const redirectUri =
      given ??
      (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (!redirectUri || !matchRedirectUri(client.redirectUris, redirectUri)) {
      return withParams(consentUrl, { error: 'invalid_redirect_uri' });
    }

    const state = param(query, 'state');
    const fail = (error: string, description: string) =>
      withParams(redirectUri, {
        error,
        error_description: description,
        state,
        iss: this.config.issuer,
      });

    if (param(query, 'response_type') !== 'code') {
      return fail('unsupported_response_type', 'response_type must be code');
    }
    const challenge = param(query, 'code_challenge');
    if (
      param(query, 'code_challenge_method') !== 'S256' ||
      !isCodeChallenge(challenge)
    ) {
      return fail('invalid_request', 'PKCE with S256 is required');
    }
    if (state !== undefined && state.length > MAX_STATE_LENGTH) {
      return fail('invalid_request', 'state is too long');
    }
    if (query.state !== undefined && state === undefined) {
      return fail('invalid_request', 'state must be a single value');
    }
    const scopes = parseScopes(query.scope);
    if (!scopes) return fail('invalid_scope', 'Unknown scope');
    if (!this.isResource(query.resource)) {
      return fail('invalid_target', 'resource must be this MCP server');
    }

    await this.prisma.mcpAuthorizationRequest.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    const request = await this.prisma.mcpAuthorizationRequest.create({
      data: {
        clientId: client.id,
        redirectUri,
        state,
        codeChallenge: challenge,
        scopes,
        resource: this.config.resource,
        expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
      },
    });
    return withParams(consentUrl, { request: request.id });
  }

  /** The pending request for the consent screen; 404 when unknown or expired. */
  async findRequest(
    id: string,
    now = new Date(),
  ): Promise<AuthorizationRequestInfo> {
    const request = UUID.test(id)
      ? await this.prisma.mcpAuthorizationRequest.findUnique({
          where: { id },
          include: { client: { select: { name: true } } },
        })
      : null;
    if (!request || request.expiresAt <= now) throw requestNotFound();
    return {
      id: request.id,
      client: { name: request.client.name },
      redirectHost: redirectHost(request.redirectUri),
      scopes: request.scopes,
      expiresAt: request.expiresAt,
    };
  }

  /**
   * The signed-in user approves or denies a request (consumed either way) and
   * gets where to send the browser: the client with a code or `access_denied`.
   */
  async decide(
    userId: number,
    id: string,
    approve: boolean,
    now = new Date(),
  ): Promise<string> {
    const request = UUID.test(id)
      ? await this.prisma.mcpAuthorizationRequest.findUnique({ where: { id } })
      : null;
    if (!request || request.expiresAt <= now) throw requestNotFound();
    // Conditional delete: of two concurrent decisions only one wins
    const { count } = await this.prisma.mcpAuthorizationRequest.deleteMany({
      where: { id },
    });
    if (count === 0) throw requestNotFound();

    const back = (params: Record<string, string>) =>
      withParams(request.redirectUri, {
        ...params,
        state: request.state,
        iss: this.config.issuer,
      });
    if (!approve) return back({ error: 'access_denied' });

    const code = newToken();
    await this.prisma.mcpAuthorizationCode.create({
      data: {
        codeHash: hashToken(code),
        clientId: request.clientId,
        userId,
        redirectUri: request.redirectUri,
        codeChallenge: request.codeChallenge,
        scopes: request.scopes,
        resource: request.resource,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      },
    });
    return back({ code });
  }

  /** `POST /oauth/token`: authorization code or refresh token grant. */
  async token(
    body: Params,
    credentials: ClientCredentials,
    now = new Date(),
  ): Promise<TokenResponse> {
    const client = await this.authenticateClient(credentials);
    switch (param(body, 'grant_type')) {
      case 'authorization_code':
        return this.exchangeCode(client, body, now);
      case 'refresh_token':
        return this.refresh(client, body, now);
      default:
        throw new OAuthError(
          'unsupported_grant_type',
          'grant_type must be authorization_code or refresh_token',
        );
    }
  }

  /** RFC 7009: revokes the grant of an access or refresh token of the client. */
  async revoke(
    body: Params,
    credentials: ClientCredentials,
    now = new Date(),
  ): Promise<void> {
    const client = await this.authenticateClient(credentials);
    const token = body.token;
    if (!isTokenShaped(token)) return;
    const hash = hashToken(token);
    await this.prisma.mcpGrant.updateMany({
      where: {
        clientId: client.id,
        revokedAt: null,
        OR: [{ accessHash: hash }, { refreshHash: hash }],
      },
      data: { revokedAt: now },
    });
  }

  /** The user's connected agents (grants still usable). */
  async listGrants(userId: number, now = new Date()): Promise<GrantInfo[]> {
    const grants = await this.prisma.mcpGrant.findMany({
      where: { userId, revokedAt: null, refreshExpiresAt: { gt: now } },
      include: { client: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return grants.map((grant) => ({
      id: grant.id,
      client: { name: grant.client.name },
      scopes: knownScopes(grant.scopes),
      createdAt: grant.createdAt,
      lastUsedAt: grant.lastUsedAt,
    }));
  }

  /** Disconnects one of the user's agents at once; 404 for anyone else's. */
  async revokeGrant(userId: number, id: number, now = new Date()) {
    const { count } = await this.prisma.mcpGrant.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count === 0) throw new NotFoundException('Connection not found');
  }

  /** `resource` (RFC 8707) is optional; when sent it must be the MCP endpoint. */
  private isResource(value: unknown): boolean {
    if (value === undefined) return true;
    if (typeof value !== 'string') return false;
    return value.replace(/\/+$/, '') === this.config.resource;
  }

  private async authenticateClient({
    clientId,
    clientSecret,
  }: ClientCredentials): Promise<McpClient> {
    const client =
      clientId && UUID.test(clientId)
        ? await this.prisma.mcpClient.findUnique({ where: { id: clientId } })
        : null;
    if (!client) throw new OAuthError('invalid_client', 'Unknown client');
    if (
      client.secretHash &&
      !(clientSecret && sameHash(client.secretHash, hashToken(clientSecret)))
    ) {
      throw new OAuthError('invalid_client', 'Invalid client credentials');
    }
    return client;
  }

  private async exchangeCode(
    client: McpClient,
    body: Params,
    now: Date,
  ): Promise<TokenResponse> {
    const code = body.code;
    const row = isTokenShaped(code)
      ? await this.prisma.mcpAuthorizationCode.findUnique({
          where: { codeHash: hashToken(code) },
        })
      : null;
    if (!row || row.clientId !== client.id) throw invalidGrant('Invalid code');
    if (row.usedAt) {
      // A code presented twice may have leaked: cut off what it issued
      if (row.grantId) {
        await this.prisma.mcpGrant.updateMany({
          where: { id: row.grantId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      throw invalidGrant('Code already used');
    }
    if (row.expiresAt <= now) throw invalidGrant('Code expired');
    const redirectUri = body.redirect_uri;
    if (redirectUri !== undefined && redirectUri !== row.redirectUri) {
      throw invalidGrant(
        'redirect_uri does not match the authorization request',
      );
    }
    if (!this.isResource(body.resource)) {
      throw new OAuthError(
        'invalid_target',
        'resource must be this MCP server',
      );
    }
    if (!verifyPkce(body.code_verifier, row.codeChallenge)) {
      throw invalidGrant('PKCE verification failed');
    }

    const issued = this.newTokens(now);
    const created = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.mcpAuthorizationCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count === 0) return null;
      const grant = await tx.mcpGrant.create({
        data: {
          userId: row.userId,
          clientId: client.id,
          scopes: row.scopes,
          resource: row.resource,
          ...issued.data,
          lastUsedAt: now,
        },
      });
      await tx.mcpAuthorizationCode.update({
        where: { id: row.id },
        data: { grantId: grant.id },
      });
      return grant;
    });
    if (!created) throw invalidGrant('Code already used');
    return this.response(issued, created.scopes);
  }

  private async refresh(
    client: McpClient,
    body: Params,
    now: Date,
  ): Promise<TokenResponse> {
    const token = body.refresh_token;
    if (!isTokenShaped(token)) throw invalidGrant('Invalid refresh token');
    const hash = hashToken(token);
    const grant = await this.prisma.mcpGrant.findUnique({
      where: { refreshHash: hash },
    });

    if (!grant) {
      const rotated = await this.prisma.mcpGrant.findFirst({
        where: { previousRefreshHash: hash, revokedAt: null },
      });
      // An old refresh token again: a benign race right after a rotation, or
      // else a leak, which ends the connection
      if (rotated && !this.withinRotationGrace(rotated.accessExpiresAt, now)) {
        await this.prisma.mcpGrant.update({
          where: { id: rotated.id },
          data: { revokedAt: now },
        });
      }
      throw invalidGrant('Invalid refresh token');
    }
    if (
      grant.clientId !== client.id ||
      grant.revokedAt ||
      grant.refreshExpiresAt <= now
    ) {
      throw invalidGrant('Invalid refresh token');
    }
    if (!this.isResource(body.resource)) {
      throw new OAuthError(
        'invalid_target',
        'resource must be this MCP server',
      );
    }

    let scopes = knownScopes(grant.scopes);
    if (body.scope !== undefined) {
      const requested = parseScopes(body.scope);
      if (!requested || !requested.every((s) => scopes.includes(s))) {
        throw new OAuthError(
          'invalid_scope',
          'A refresh can only keep or narrow the granted scopes',
        );
      }
      scopes = requested;
    }

    const issued = this.newTokens(now);
    // Conditional update: of two concurrent refreshes with one token, only one wins
    const { count } = await this.prisma.mcpGrant.updateMany({
      where: { id: grant.id, refreshHash: grant.refreshHash, revokedAt: null },
      data: {
        ...issued.data,
        previousRefreshHash: grant.refreshHash,
        scopes,
        lastUsedAt: now,
      },
    });
    if (count === 0) throw invalidGrant('Invalid refresh token');
    return this.response(issued, scopes);
  }

  /** Rotation time is when the current access token was issued. */
  private withinRotationGrace(accessExpiresAt: Date, now: Date) {
    const rotatedAt =
      accessExpiresAt.getTime() - this.config.accessTtlSeconds * 1000;
    return now.getTime() - rotatedAt < ROTATION_GRACE_MS;
  }

  private newTokens(now: Date) {
    const accessToken = newToken();
    const refreshToken = newToken();
    return {
      accessToken,
      refreshToken,
      data: {
        accessHash: hashToken(accessToken),
        accessExpiresAt: new Date(
          now.getTime() + this.config.accessTtlSeconds * 1000,
        ),
        refreshHash: hashToken(refreshToken),
        refreshExpiresAt: new Date(
          now.getTime() + this.config.refreshTtlDays * DAY_MS,
        ),
      },
    };
  }

  private response(
    issued: ReturnType<OAuthServerService['newTokens']>,
    scopes: readonly string[],
  ): TokenResponse {
    return {
      access_token: issued.accessToken,
      token_type: 'Bearer',
      expires_in: this.config.accessTtlSeconds,
      refresh_token: issued.refreshToken,
      scope: formatScopes(scopes),
    };
  }
}

const invalidGrant = (description: string) =>
  new OAuthError('invalid_grant', description);

const requestNotFound = () =>
  new NotFoundException('Authorization request not found or expired');

/** Host shown on the consent screen (the scheme for private-use URIs). */
function redirectHost(uri: string): string {
  const url = new URL(uri);
  return url.host || url.protocol.replace(/:$/, '');
}

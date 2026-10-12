import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpTokenVerifier } from '../oauth-server/token-verifier.js';
import { formatScopes, MCP_SCOPES } from '../oauth-server/scopes.js';
import { MCP_CONFIG, type McpConfig } from './mcp.config.js';
import type { McpPrincipal } from './principal.js';

export type McpRequest = Request & { mcpPrincipal?: McpPrincipal };

/** The bearer token of `Authorization`, if any. */
export function bearerToken(req: Request): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
  return match?.[1];
}

/**
 * Requires an MCP access token. Without a valid one, answers 401 with the
 * `WWW-Authenticate` challenge that points clients to the protected resource
 * metadata, which starts the OAuth flow (MCP authorization spec).
 */
@Injectable()
export class McpBearerGuard implements CanActivate {
  constructor(
    private readonly verifier: McpTokenVerifier,
    @Inject(MCP_CONFIG) private readonly config: McpConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<McpRequest>();
    const token = bearerToken(req);
    const principal = token ? await this.verifier.verify(token) : null;
    if (principal) {
      req.mcpPrincipal = principal;
      return true;
    }
    const challenge = [
      `resource_metadata="${this.config.resourceMetadataUrl}"`,
      `scope="${formatScopes(MCP_SCOPES)}"`,
      ...(token
        ? [
            'error="invalid_token"',
            'error_description="The access token is invalid, expired or revoked"',
          ]
        : []),
    ];
    http
      .getResponse<Response>()
      .setHeader('WWW-Authenticate', `Bearer ${challenge.join(', ')}`);
    throw new UnauthorizedException(
      token ? 'Invalid access token' : 'Missing access token',
    );
  }
}

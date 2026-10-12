import type { ConfigService } from '@nestjs/config';
import { webUrlFrom, withoutTrailingSlash } from '../config/web-url.js';

export const MCP_CONFIG = Symbol('MCP_CONFIG');

/** Port of the MCP process (`src/mcp/main.ts`) when `MCP_PORT` is unset. */
export const DEFAULT_MCP_PORT = 3001;

/**
 * Public URLs of the OAuth authorization server (the main API) and of the MCP
 * resource server (its own process), read by both processes.
 */
export interface McpConfig {
  /** The web app, home of the consent screen */
  webUrl: string;
  /** The API as clients reach it: the OAuth `issuer` */
  issuer: string;
  /** Origin (and base path) of the MCP process */
  publicUrl: string;
  /** The MCP endpoint, the RFC 8707 resource tokens are bound to */
  resource: string;
  /** Where clients find the protected resource metadata (RFC 9728) */
  resourceMetadataUrl: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
}

export function mcpConfigFactory(config: ConfigService): McpConfig {
  const webUrl = webUrlFrom(config);
  // Same default as the GitHub/Google callback base: the API behind the web's host
  const issuer = withoutTrailingSlash(
    config.get<string>('OAUTH_CALLBACK_BASE_URL') ?? `${webUrl}/api`,
  );
  const port = config.get<string>('MCP_PORT') ?? DEFAULT_MCP_PORT;
  const publicUrl = withoutTrailingSlash(
    config.get<string>('MCP_PUBLIC_URL') ?? `http://localhost:${port}`,
  );
  const { pathname } = new URL(`${publicUrl}/mcp`);
  return {
    webUrl,
    issuer,
    publicUrl,
    resource: `${publicUrl}/mcp`,
    resourceMetadataUrl: `${new URL(publicUrl).origin}/.well-known/oauth-protected-resource${pathname}`,
    accessTtlSeconds:
      Number(config.get('MCP_ACCESS_TOKEN_TTL_MINUTES') ?? 60) * 60,
    refreshTtlDays: Number(config.get('MCP_REFRESH_TOKEN_TTL_DAYS') ?? 30),
  };
}

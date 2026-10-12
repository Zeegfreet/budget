import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { MCP_CONFIG, type McpConfig } from '../mcp/mcp.config.js';
import { authorizationServerMetadata } from './metadata.js';

/**
 * Discovery of the authorization server. The issuer may have a path (`/api`
 * in the single Docker image), so the metadata also answers with the path
 * inserted after `.well-known/…` (RFC 8414 §3.1); these routes are excluded
 * from `API_PREFIX` (see `configureApp`).
 */
@ApiTags('oauth')
@Controller('.well-known')
export class WellKnownController {
  constructor(@Inject(MCP_CONFIG) private readonly config: McpConfig) {}

  @Public()
  @Get([
    'oauth-authorization-server',
    'oauth-authorization-server/{*path}',
    'openid-configuration',
    'openid-configuration/{*path}',
  ])
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOkResponse({ description: 'RFC 8414 authorization server metadata' })
  metadata() {
    return authorizationServerMetadata(this.config);
  }
}

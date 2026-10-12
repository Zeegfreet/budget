import { Controller, Get, Header, Inject } from '@nestjs/common';
import { protectedResourceMetadata } from '../oauth-server/metadata.js';
import { MCP_CONFIG, type McpConfig } from './mcp.config.js';

/** RFC 9728 discovery: which authorization server issues tokens for `/mcp`. */
@Controller('.well-known')
export class ProtectedResourceController {
  constructor(@Inject(MCP_CONFIG) private readonly config: McpConfig) {}

  @Get(['oauth-protected-resource', 'oauth-protected-resource/{*path}'])
  @Header('Cache-Control', 'public, max-age=300')
  metadata() {
    return protectedResourceMetadata(this.config);
  }
}

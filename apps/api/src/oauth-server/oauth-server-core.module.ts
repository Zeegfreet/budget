import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MCP_CONFIG, mcpConfigFactory } from '../mcp/mcp.config.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { McpTokenVerifier } from './token-verifier.js';

/** What both processes share: the MCP config and the token verifier. */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: MCP_CONFIG,
      inject: [ConfigService],
      useFactory: mcpConfigFactory,
    },
    McpTokenVerifier,
  ],
  exports: [MCP_CONFIG, McpTokenVerifier],
})
export class OAuthServerCoreModule {}

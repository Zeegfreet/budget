import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { McpCoreModule } from './mcp-core.module.js';
import { McpController } from './mcp.controller.js';
import { McpBearerGuard } from './mcp-bearer.guard.js';
import { McpThrottlerGuard } from './mcp-throttler.guard.js';
import { ProtectedResourceController } from './protected-resource.controller.js';

/**
 * The MCP HTTP process (`src/mcp/main.ts`): only `/mcp` and its discovery
 * document; the domain controllers of the imported modules are cut off by
 * `configureMcpApp`.
 */
@Module({
  imports: [
    McpCoreModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
  ],
  controllers: [McpController, ProtectedResourceController],
  providers: [
    McpBearerGuard,
    { provide: APP_GUARD, useClass: McpThrottlerGuard },
  ],
})
export class McpAppModule {}

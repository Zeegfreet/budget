import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OAuthServerCoreModule } from './oauth-server-core.module.js';
import { OAuthServerController } from './oauth-server.controller.js';
import { OAuthServerService } from './oauth-server.service.js';
import { WellKnownController } from './well-known.controller.js';

/** The authorization server for MCP clients, mounted on the main API. */
@Module({
  imports: [PrismaModule, OAuthServerCoreModule],
  controllers: [OAuthServerController, WellKnownController],
  providers: [OAuthServerService],
})
export class OAuthServerModule {}

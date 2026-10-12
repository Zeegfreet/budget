import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BudgetModule } from '../budget/budget.module.js';
import { validateMcpEnv } from '../config/env.validation.js';
import { OAuthServerCoreModule } from '../oauth-server/oauth-server-core.module.js';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module.js';
import { McpServerFactory } from './mcp-server.factory.js';

/**
 * Everything an MCP server needs, with no transport: the domain services, the
 * token verifier and the server factory. The HTTP process (`McpAppModule`)
 * and the stdio process (an application context, no HTTP) both build on it.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateMcpEnv }),
    BudgetModule,
    PaymentMethodsModule,
    OAuthServerCoreModule,
  ],
  providers: [McpServerFactory],
  exports: [McpServerFactory, OAuthServerCoreModule],
})
export class McpCoreModule {}

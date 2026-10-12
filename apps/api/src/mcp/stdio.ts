import { NestFactory } from '@nestjs/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpTokenVerifier } from '../oauth-server/token-verifier.js';
import { McpCoreModule } from './mcp-core.module.js';
import { McpServerFactory } from './mcp-server.factory.js';
import { StderrLogger } from './stderr-logger.js';
import { resolveStdioPrincipal } from './stdio-principal.js';

/**
 * The MCP server over stdio, for local clients (`claude mcp add … -- node
 * dist/mcp/stdio.js`). No HTTP: an application context of `McpCoreModule`.
 * stdout is reserved for JSON-RPC, so logs go to stderr.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(McpCoreModule, {
    logger: new StderrLogger('McpStdio', { logLevels: ['error', 'warn'] }),
  });
  let identity;
  try {
    identity = await resolveStdioPrincipal(
      process.env,
      app.get(McpTokenVerifier),
    );
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    await app.close();
    process.exit(1);
  }

  const server = app
    .get(McpServerFactory)
    .create(identity.principal, { authorize: identity.authorize });
  const transport = new StdioServerTransport();
  transport.onclose = () => void app.close();
  await server.connect(transport);
}
await main();

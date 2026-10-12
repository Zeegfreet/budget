import { NestFactory } from '@nestjs/core';
import { DEFAULT_MCP_PORT } from './mcp.config.js';
import { McpAppModule } from './mcp-app.module.js';
import { configureMcpApp } from './mcp.setup.js';

/** The MCP server over Streamable HTTP, a process apart from the API. */
async function bootstrap() {
  const app = await NestFactory.create(McpAppModule);
  configureMcpApp(app);
  await app.listen(process.env.MCP_PORT ?? DEFAULT_MCP_PORT);
}
await bootstrap();

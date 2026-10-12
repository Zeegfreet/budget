import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Response } from 'express';
import { McpBearerGuard, type McpRequest } from './mcp-bearer.guard.js';
import { McpServerFactory } from './mcp-server.factory.js';

const methodNotAllowed = (res: Response) =>
  res
    .status(HttpStatus.METHOD_NOT_ALLOWED)
    .setHeader('Allow', 'POST')
    .json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed: stateless server, use POST',
      },
      id: null,
    });

/**
 * Streamable HTTP endpoint, stateless: every POST gets its own server and
 * transport for the token's user, answered as plain JSON (no SSE stream).
 */
@Controller('mcp')
@UseGuards(McpBearerGuard)
export class McpController {
  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  async handle(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
    const server = this.factory.create(req.mcpPrincipal!);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get()
  stream(@Res() res: Response) {
    methodNotAllowed(res);
  }

  @Delete()
  end(@Res() res: Response) {
    methodNotAllowed(res);
  }
}

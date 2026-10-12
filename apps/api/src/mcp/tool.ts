import { HttpException, Logger } from '@nestjs/common';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ShapeOutput,
  ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { McpScope } from '../oauth-server/scopes.js';
import { hasScope, type McpPrincipal } from './principal.js';

const logger = new Logger('McpTools');

/**
 * Re-resolves the principal before every call (e.g. a stdio process checks
 * its token again, so a revocation cuts it off at once). `null` = no access.
 */
export type Authorize = () => Promise<McpPrincipal | null>;

export interface ToolContext {
  server: McpServer;
  principal: McpPrincipal;
  authorize: Authorize;
}

export interface ToolDefinition<Shape extends ZodRawShapeCompat> {
  scope: McpScope;
  title: string;
  description: string;
  input: Shape;
  annotations: ToolAnnotations;
  run: (
    args: ShapeOutput<Shape>,
    userId: number,
  ) => Promise<Record<string, unknown>>;
}

export const success = (data: Record<string, unknown>): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
  structuredContent: data,
});

export const failure = (message: string): CallToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

/** An error as the agent sees it: the HTTP status and the API's message. */
export function toolError(error: unknown): CallToolResult {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    const message =
      typeof body === 'string' ? body : (body as { message?: unknown }).message;
    const text = Array.isArray(message)
      ? message.join('; ')
      : typeof message === 'string'
        ? message
        : error.message;
    return failure(`${error.getStatus()} ${text}`);
  }
  logger.error(error instanceof Error ? (error.stack ?? error.message) : error);
  return failure('500 Internal error');
}

/**
 * Registers a tool when the principal holds its scope. Every call checks the
 * access again and runs for the principal's user only (never an id from the
 * arguments).
 */
export function defineTool<Shape extends ZodRawShapeCompat>(
  { server, principal, authorize }: ToolContext,
  name: string,
  tool: ToolDefinition<Shape>,
) {
  if (!hasScope(principal, tool.scope)) return;
  server.registerTool(
    name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      annotations: { title: tool.title, ...tool.annotations },
    },
    (async (args: ShapeOutput<Shape>) => {
      const current = await authorize();
      if (
        !current ||
        current.userId !== principal.userId ||
        !hasScope(current, tool.scope)
      ) {
        return failure('401 Access revoked or expired; reconnect the agent');
      }
      try {
        return success(await tool.run(args, current.userId));
      } catch (error) {
        return toolError(error);
      }
    }) as never,
  );
}

/** Shared argument schemas (the DTOs enforce the rules). */
export const month = (what = 'Month') =>
  z.string().describe(`${what} as YYYY-MM`);
export const id = (what: string) =>
  z.number().int().min(1).describe(`Id of the ${what}`);
export const cents = (what: string) =>
  z
    .number()
    .int()
    .describe(`${what}, in integer cents of BRL (R$ 12,34 = 1234)`);

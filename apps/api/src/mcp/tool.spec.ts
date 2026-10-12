import { ConflictException, Logger } from '@nestjs/common';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpPrincipal } from './principal.js';
import { defineTool, toolError } from './tool.js';

const reader: McpPrincipal = {
  userId: 7,
  scopes: ['budget:read'],
  via: 'oauth',
};

describe('toolError', () => {
  it('shows the status and the API message', () => {
    expect(toolError(new ConflictException('Name already used'))).toEqual({
      content: [{ type: 'text', text: '409 Name already used' }],
      isError: true,
    });
  });

  it('hides unexpected errors', () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    expect(toolError(new Error('db password in here')).content).toEqual([
      { type: 'text', text: '500 Internal error' },
    ]);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('defineTool', () => {
  const registerTool = vi.fn();
  const server = { registerTool } as unknown as McpServer;
  const handler = () =>
    registerTool.mock.calls[0][2] as (args: object) => Promise<unknown>;

  beforeEach(() => vi.clearAllMocks());

  it('skips tools whose scope the principal lacks', () => {
    defineTool(
      { server, principal: reader, authorize: async () => reader },
      'w',
      {
        scope: 'budget:write',
        title: 'W',
        description: '',
        input: {},
        annotations: {},
        run: vi.fn(),
      },
    );
    expect(registerTool).not.toHaveBeenCalled();
  });

  it('runs for the principal’s user and returns text plus structured content', async () => {
    const run = vi.fn().mockResolvedValue({ ok: 1 });
    defineTool(
      { server, principal: reader, authorize: async () => reader },
      'r',
      {
        scope: 'budget:read',
        title: 'R',
        description: '',
        input: {},
        annotations: { readOnlyHint: true },
        run,
      },
    );
    expect(registerTool.mock.calls[0][1].annotations).toEqual({
      title: 'R',
      readOnlyHint: true,
    });
    await expect(handler()({ a: 1 })).resolves.toEqual({
      content: [{ type: 'text', text: '{"ok":1}' }],
      structuredContent: { ok: 1 },
    });
    expect(run).toHaveBeenCalledWith({ a: 1 }, 7);
  });

  it.each([
    ['revoked', null],
    ['another user', { ...reader, userId: 8 }],
    ['narrowed', { ...reader, scopes: [] }],
  ])('refuses the call when access is %s', async (_case, current) => {
    const run = vi.fn();
    defineTool(
      {
        server,
        principal: reader,
        authorize: async () => current as McpPrincipal | null,
      },
      'r',
      {
        scope: 'budget:read',
        title: 'R',
        description: '',
        input: {},
        annotations: {},
        run,
      },
    );
    await expect(handler()({})).resolves.toMatchObject({ isError: true });
    expect(run).not.toHaveBeenCalled();
  });
});

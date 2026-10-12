import { ConfigService } from '@nestjs/config';
import { mcpConfigFactory } from './mcp.config.js';
import { isMcpPath } from './mcp.setup.js';

const configOf = (env: Record<string, string>) =>
  mcpConfigFactory(new ConfigService(env));

describe('mcpConfigFactory', () => {
  it('defaults to the API behind the web and a local MCP port', () => {
    expect(configOf({})).toEqual({
      webUrl: 'http://localhost:5173',
      issuer: 'http://localhost:5173/api',
      publicUrl: 'http://localhost:3001',
      resource: 'http://localhost:3001/mcp',
      resourceMetadataUrl:
        'http://localhost:3001/.well-known/oauth-protected-resource/mcp',
      accessTtlSeconds: 3600,
      refreshTtlDays: 30,
    });
  });

  it('follows the public URLs and TTLs of the environment', () => {
    expect(
      configOf({
        WEB_URL: 'https://budget.app/',
        OAUTH_CALLBACK_BASE_URL: 'https://budget.app/api/',
        MCP_PUBLIC_URL: 'https://budget.app/agents/',
        MCP_ACCESS_TOKEN_TTL_MINUTES: '15',
        MCP_REFRESH_TOKEN_TTL_DAYS: '7',
      }),
    ).toMatchObject({
      issuer: 'https://budget.app/api',
      resource: 'https://budget.app/agents/mcp',
      resourceMetadataUrl:
        'https://budget.app/.well-known/oauth-protected-resource/agents/mcp',
      accessTtlSeconds: 900,
      refreshTtlDays: 7,
    });
  });
});

describe('isMcpPath', () => {
  it.each([
    ['/mcp', true],
    ['/.well-known/oauth-protected-resource', true],
    ['/.well-known/oauth-protected-resource/mcp', true],
    ['/mcp/x', false],
    ['/budget/categories', false],
    ['/.well-known/oauth-authorization-server', false],
  ])('%s → %s', (path, expected) => {
    expect(isMcpPath(path)).toBe(expected);
  });
});

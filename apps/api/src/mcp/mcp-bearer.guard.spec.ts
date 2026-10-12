import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { McpTokenVerifier } from '../oauth-server/token-verifier.js';
import { McpBearerGuard } from './mcp-bearer.guard.js';
import type { McpConfig } from './mcp.config.js';

describe('McpBearerGuard', () => {
  const verifier = { verify: vi.fn() };
  const guard = new McpBearerGuard(
    verifier as unknown as McpTokenVerifier,
    {
      resourceMetadataUrl:
        'https://mcp.app/.well-known/oauth-protected-resource/mcp',
    } as McpConfig,
  );
  const setHeader = vi.fn();
  const context = (authorization?: string) => {
    const req: Record<string, unknown> = {
      get: (name: string) =>
        name === 'authorization' ? authorization : undefined,
    };
    return {
      req,
      ctx: {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => ({ setHeader }),
        }),
      } as unknown as ExecutionContext,
    };
  };

  beforeEach(() => vi.clearAllMocks());

  it('puts the principal of a valid bearer token on the request', async () => {
    const principal = { userId: 7, scopes: ['budget:read'], via: 'oauth' };
    verifier.verify.mockResolvedValue(principal);
    const { req, ctx } = context('Bearer abc');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith('abc');
    expect(req.mcpPrincipal).toBe(principal);
  });

  it('challenges a missing token without calling the verifier', async () => {
    const { ctx } = context();
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://mcp.app/.well-known/oauth-protected-resource/mcp", scope="budget:read budget:write"',
    );
  });

  it('flags an invalid token', async () => {
    verifier.verify.mockResolvedValue(null);
    const { ctx } = context('Bearer bad');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(setHeader.mock.calls[0][1]).toContain('error="invalid_token"');
  });
});

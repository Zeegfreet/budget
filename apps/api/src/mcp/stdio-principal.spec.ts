import type { McpTokenVerifier } from '../oauth-server/token-verifier.js';
import { resolveStdioPrincipal } from './stdio-principal.js';

describe('resolveStdioPrincipal', () => {
  const verifier = { verify: vi.fn(), local: vi.fn() };
  const resolve = (env: Record<string, string | undefined>) =>
    resolveStdioPrincipal(env, verifier as unknown as McpTokenVerifier);
  const principal = { userId: 7, scopes: ['budget:read'], via: 'oauth' };

  beforeEach(() => vi.clearAllMocks());

  it('treats empty values as unset', async () => {
    await expect(
      resolve({ MCP_ACCESS_TOKEN: '', MCP_USER_ID: '' }),
    ).rejects.toThrow('Set exactly one');
  });

  it('re-verifies the token on every authorize', async () => {
    verifier.verify.mockResolvedValue(principal);
    const identity = await resolve({ MCP_ACCESS_TOKEN: 'tok' });
    verifier.verify.mockResolvedValue(null);
    await expect(identity.authorize!()).resolves.toBeNull();
    expect(verifier.verify).toHaveBeenCalledTimes(2);
    expect(verifier.verify).toHaveBeenLastCalledWith('tok');
  });

  it('defaults the local scopes to read-only', async () => {
    verifier.local.mockResolvedValue({ ...principal, via: 'local' });
    const identity = await resolve({ MCP_USER_ID: '7' });
    expect(verifier.local).toHaveBeenCalledWith(7, ['budget:read']);
    expect(identity.authorize).toBeUndefined();
  });

  it.each(['0', '-1', '1.5', '007'])('rejects MCP_USER_ID=%s', async (id) => {
    await expect(resolve({ MCP_USER_ID: id })).rejects.toThrow(
      'positive integer',
    );
  });
});

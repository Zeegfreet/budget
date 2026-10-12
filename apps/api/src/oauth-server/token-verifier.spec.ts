import { hashToken } from '../activation/token.js';
import type { McpConfig } from '../mcp/mcp.config.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { McpTokenVerifier } from './token-verifier.js';

const TOKEN = 'a'.repeat(43);
const NOW = new Date('2026-10-12T12:00:00Z');
const config = { resource: 'https://mcp.example.com/mcp' } as McpConfig;

describe('McpTokenVerifier', () => {
  const prisma = {
    mcpGrant: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  const verifier = new McpTokenVerifier(
    prisma as unknown as PrismaService,
    config,
  );
  const grant = (overrides = {}) => ({
    id: 5,
    userId: 7,
    scopes: ['budget:read', 'retired'],
    resource: config.resource,
    accessExpiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
    lastUsedAt: NOW,
    ...overrides,
  });

  beforeEach(() => vi.clearAllMocks());

  it('resolves a valid token by its hash, keeping known scopes', async () => {
    prisma.mcpGrant.findUnique.mockResolvedValue(grant());
    await expect(verifier.verify(TOKEN, NOW)).resolves.toEqual({
      userId: 7,
      scopes: ['budget:read'],
      via: 'oauth',
    });
    expect(prisma.mcpGrant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accessHash: hashToken(TOKEN) } }),
    );
    expect(prisma.mcpGrant.update).not.toHaveBeenCalled();
  });

  it('refreshes lastUsedAt at most once a minute', async () => {
    prisma.mcpGrant.findUnique.mockResolvedValue(
      grant({ lastUsedAt: new Date(NOW.getTime() - 61_000) }),
    );
    await verifier.verify(TOKEN, NOW);
    expect(prisma.mcpGrant.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { lastUsedAt: NOW },
    });
  });

  it.each([
    ['unknown', null],
    ['revoked', grant({ revokedAt: NOW })],
    ['expired', grant({ accessExpiresAt: NOW })],
    ['for another resource', grant({ resource: 'https://other/mcp' })],
  ])('rejects a token %s', async (_case, row) => {
    prisma.mcpGrant.findUnique.mockResolvedValue(row);
    await expect(verifier.verify(TOKEN, NOW)).resolves.toBeNull();
  });

  it('rejects a malformed token without a query', async () => {
    await expect(verifier.verify('short')).resolves.toBeNull();
    expect(prisma.mcpGrant.findUnique).not.toHaveBeenCalled();
  });

  it('trusts a local user only when registered', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ pending: false });
    await expect(verifier.local(7, ['budget:read'])).resolves.toEqual({
      userId: 7,
      scopes: ['budget:read'],
      via: 'local',
    });
    prisma.user.findUnique.mockResolvedValueOnce({ pending: true });
    await expect(verifier.local(7, ['budget:read'])).resolves.toBeNull();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(verifier.local(7, ['budget:read'])).resolves.toBeNull();
  });
});

import { NotFoundException } from '@nestjs/common';
import { hashToken } from '../activation/token.js';
import type { McpConfig } from '../mcp/mcp.config.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { OAuthError } from './oauth-error.js';
import { OAuthServerService } from './oauth-server.service.js';
import { s256 } from './pkce.js';

const NOW = new Date('2026-10-12T12:00:00Z');
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const REDIRECT = 'http://127.0.0.1:4000/cb';
const VERIFIER = 'v'.repeat(43);
const config: McpConfig = {
  webUrl: 'https://budget.app',
  issuer: 'https://budget.app/api',
  publicUrl: 'https://mcp.budget.app',
  resource: 'https://mcp.budget.app/mcp',
  resourceMetadataUrl:
    'https://mcp.budget.app/.well-known/oauth-protected-resource/mcp',
  accessTtlSeconds: 3600,
  refreshTtlDays: 30,
};

describe('OAuthServerService', () => {
  const prisma = {
    mcpClient: { create: vi.fn(), findUnique: vi.fn() },
    mcpAuthorizationRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    mcpAuthorizationCode: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    mcpGrant: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const service = new OAuthServerService(
    prisma as unknown as PrismaService,
    config,
  );
  const client = (overrides = {}) => ({
    id: CLIENT_ID,
    name: 'Claude',
    redirectUris: [REDIRECT],
    secretHash: null,
    createdAt: NOW,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
  });

  describe('register', () => {
    it('stores a public client with defaults', async () => {
      prisma.mcpClient.create.mockImplementation(({ data }) => ({
        id: CLIENT_ID,
        createdAt: NOW,
        ...data,
      }));
      const result = await service.register({ redirect_uris: [REDIRECT] });
      expect(prisma.mcpClient.create).toHaveBeenCalledWith({
        data: {
          name: 'Aplicativo sem nome',
          redirectUris: [REDIRECT],
          secretHash: undefined,
        },
      });
      expect(result).toMatchObject({
        client_id: CLIENT_ID,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
      });
    });

    it('stores only the hash of a confidential client secret', async () => {
      prisma.mcpClient.create.mockImplementation(({ data }) => ({
        id: CLIENT_ID,
        createdAt: NOW,
        ...data,
      }));
      const result = await service.register({
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: 'client_secret_post',
      });
      const { data } = prisma.mcpClient.create.mock.calls[0][0];
      expect(data.secretHash).toBe(hashToken(result.client_secret!));
    });
  });

  describe('authorize', () => {
    const query = (overrides: Record<string, unknown> = {}) => ({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      code_challenge: s256(VERIFIER),
      code_challenge_method: 'S256',
      state: 'st',
      ...overrides,
    });

    it('uses the only registered redirect URI when none is sent', async () => {
      prisma.mcpClient.findUnique.mockResolvedValue(client());
      prisma.mcpAuthorizationRequest.create.mockResolvedValue({
        id: REQUEST_ID,
      });
      const location = await service.authorize(
        query({ redirect_uri: undefined }),
        NOW,
      );
      expect(location).toBe(
        `https://budget.app/autorizar-agente?request=${REQUEST_ID}`,
      );
      expect(prisma.mcpAuthorizationRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          redirectUri: REDIRECT,
          resource: config.resource,
          expiresAt: new Date(NOW.getTime() + 10 * 60_000),
        }),
      });
    });

    it('needs the redirect URI when the client has several', async () => {
      prisma.mcpClient.findUnique.mockResolvedValue(
        client({ redirectUris: [REDIRECT, 'https://x.example.com/cb'] }),
      );
      await expect(
        service.authorize(query({ redirect_uri: undefined })),
      ).resolves.toBe(
        'https://budget.app/autorizar-agente?error=invalid_redirect_uri',
      );
    });

    it('rejects a repeated parameter', async () => {
      prisma.mcpClient.findUnique.mockResolvedValue(client());
      const location = new URL(
        await service.authorize(query({ state: ['a', 'b'] })),
      );
      expect(location.searchParams.get('error')).toBe('invalid_request');
    });

    it('accepts the resource with a trailing slash', async () => {
      prisma.mcpClient.findUnique.mockResolvedValue(client());
      prisma.mcpAuthorizationRequest.create.mockResolvedValue({
        id: REQUEST_ID,
      });
      const location = await service.authorize(
        query({ resource: `${config.resource}/` }),
      );
      expect(location).toContain('request=');
    });
  });

  describe('decide', () => {
    const request = {
      id: REQUEST_ID,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT,
      state: 'st',
      codeChallenge: s256(VERIFIER),
      scopes: ['budget:read'],
      resource: config.resource,
      expiresAt: new Date(NOW.getTime() + 1000),
    };

    it('issues a code for the deciding user', async () => {
      prisma.mcpAuthorizationRequest.findUnique.mockResolvedValue(request);
      prisma.mcpAuthorizationRequest.deleteMany.mockResolvedValue({ count: 1 });
      const url = new URL(await service.decide(7, REQUEST_ID, true, NOW));
      const code = url.searchParams.get('code')!;
      expect(url.searchParams.get('state')).toBe('st');
      expect(url.searchParams.get('iss')).toBe(config.issuer);
      expect(prisma.mcpAuthorizationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          codeHash: hashToken(code),
          userId: 7,
          scopes: ['budget:read'],
        }),
      });
    });

    it('loses a race with a concurrent decision', async () => {
      prisma.mcpAuthorizationRequest.findUnique.mockResolvedValue(request);
      prisma.mcpAuthorizationRequest.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        service.decide(7, REQUEST_ID, true, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.mcpAuthorizationCode.create).not.toHaveBeenCalled();
    });
  });

  describe('token', () => {
    const code = 'c'.repeat(43);
    const codeRow = (overrides = {}) => ({
      id: 3,
      codeHash: hashToken(code),
      clientId: CLIENT_ID,
      userId: 7,
      redirectUri: REDIRECT,
      codeChallenge: s256(VERIFIER),
      scopes: ['budget:read', 'budget:write'],
      resource: config.resource,
      expiresAt: new Date(NOW.getTime() + 1000),
      usedAt: null,
      grantId: null,
      ...overrides,
    });
    const exchange = () =>
      service.token(
        { grant_type: 'authorization_code', code, code_verifier: VERIFIER },
        { clientId: CLIENT_ID },
        NOW,
      );

    beforeEach(() => {
      prisma.mcpClient.findUnique.mockResolvedValue(client());
    });

    it('marks the code used and creates a grant with hashed tokens', async () => {
      prisma.mcpAuthorizationCode.findUnique.mockResolvedValue(codeRow());
      prisma.mcpAuthorizationCode.updateMany.mockResolvedValue({ count: 1 });
      prisma.mcpGrant.create.mockImplementation(({ data }) => ({
        id: 9,
        ...data,
      }));

      const tokens = await exchange();
      expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
      expect(prisma.mcpGrant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 7,
          accessHash: hashToken(tokens.access_token),
          refreshHash: hashToken(tokens.refresh_token),
          accessExpiresAt: new Date(NOW.getTime() + 3600_000),
        }),
      });
      expect(prisma.mcpAuthorizationCode.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { grantId: 9 },
      });
    });

    it('fails when a concurrent exchange used the code first', async () => {
      prisma.mcpAuthorizationCode.findUnique.mockResolvedValue(codeRow());
      prisma.mcpAuthorizationCode.updateMany.mockResolvedValue({ count: 0 });
      await expect(exchange()).rejects.toMatchObject({ code: 'invalid_grant' });
      expect(prisma.mcpGrant.create).not.toHaveBeenCalled();
    });

    it('revokes the grant of a code presented twice', async () => {
      prisma.mcpAuthorizationCode.findUnique.mockResolvedValue(
        codeRow({ usedAt: NOW, grantId: 9 }),
      );
      await expect(exchange()).rejects.toBeInstanceOf(OAuthError);
      expect(prisma.mcpGrant.updateMany).toHaveBeenCalledWith({
        where: { id: 9, revokedAt: null },
        data: { revokedAt: NOW },
      });
    });

    it('requires the secret of a confidential client', async () => {
      prisma.mcpClient.findUnique.mockResolvedValue(
        client({ secretHash: hashToken('s'.repeat(43)) }),
      );
      await expect(exchange()).rejects.toMatchObject({
        code: 'invalid_client',
      });
    });
  });

  describe('grants', () => {
    it('revokes only the user’s own grant', async () => {
      prisma.mcpGrant.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revokeGrant(7, 9, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.mcpGrant.updateMany).toHaveBeenCalledWith({
        where: { id: 9, userId: 7, revokedAt: null },
        data: { revokedAt: NOW },
      });
    });
  });
});

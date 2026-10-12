import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from 'supertest/types.js';
import { McpCoreModule } from '../src/mcp/mcp-core.module.js';
import { McpServerFactory } from '../src/mcp/mcp-server.factory.js';
import {
  resolveStdioPrincipal,
  type StdioIdentity,
} from '../src/mcp/stdio-principal.js';
import { McpTokenVerifier } from '../src/oauth-server/token-verifier.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { connectAgent } from './mcp.js';
import { createTestApp, resetDatabase, signUp, type Agent } from './utils.js';

const READ_TOOLS = [
  'get_budget_lines',
  'get_budget_summary',
  'get_categories',
  'get_goals',
  'list_payment_methods',
  'list_transactions',
];
const STDIO_ENTRY = join(import.meta.dirname, '../dist/mcp/stdio.js');

describe('MCP server over stdio (e2e)', () => {
  let api: INestApplication<App>;
  let core: TestingModule;
  let prisma: PrismaService;
  let verifier: McpTokenVerifier;
  let ana: Agent;
  let anaId: number;

  const resolve = (env: Record<string, string>) =>
    resolveStdioPrincipal(env, verifier);

  /** Links a client to a server built for `identity`, in memory. */
  async function connect(identity: StdioIdentity) {
    const server = core
      .get(McpServerFactory)
      .create(identity.principal, { authorize: identity.authorize });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'e2e', version: '1' });
    await server.connect(serverSide);
    await client.connect(clientSide);
    return client;
  }

  const names = async (client: Client) =>
    (await client.listTools()).tools.map((t) => t.name).sort();

  const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
    (result.content as { text: string }[])[0].text;

  beforeEach(async () => {
    api = await createTestApp();
    core = await Test.createTestingModule({
      imports: [McpCoreModule],
    }).compile();
    await core.init();
    prisma = api.get(PrismaService);
    verifier = core.get(McpTokenVerifier);
    await resetDatabase(api);
    ana = await signUp(api, 'Ana Souza', 'ana@example.com');
    anaId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      })
    ).id;
  });

  afterEach(async () => {
    await core.close();
    await api.close();
  });

  describe('identity from the environment', () => {
    it('needs exactly one of MCP_ACCESS_TOKEN or MCP_USER_ID', async () => {
      await expect(resolve({})).rejects.toThrow(
        'Set exactly one of MCP_ACCESS_TOKEN or MCP_USER_ID',
      );
      await expect(
        resolve({ MCP_ACCESS_TOKEN: 'x', MCP_USER_ID: '1' }),
      ).rejects.toThrow('Set exactly one');
    });

    it('verifies the access token', async () => {
      await expect(resolve({ MCP_ACCESS_TOKEN: 'nope' })).rejects.toThrow(
        'MCP_ACCESS_TOKEN is invalid, expired or revoked',
      );
      const { access_token } = await connectAgent(api, ana, {
        scope: 'budget:read',
      });
      const identity = await resolve({ MCP_ACCESS_TOKEN: access_token });
      expect(identity.principal).toEqual({
        userId: anaId,
        scopes: ['budget:read'],
        via: 'oauth',
      });
      expect(identity.authorize).toBeDefined();
    });

    it('trusts MCP_USER_ID for an existing, registered user, read-only by default', async () => {
      const identity = await resolve({ MCP_USER_ID: String(anaId) });
      expect(identity.principal).toEqual({
        userId: anaId,
        scopes: ['budget:read'],
        via: 'local',
      });
      const writer = await resolve({
        MCP_USER_ID: String(anaId),
        MCP_SCOPES: 'budget:read budget:write',
      });
      expect(writer.principal.scopes).toEqual(['budget:read', 'budget:write']);
    });

    it('rejects a malformed or unknown user, a pre-registration and unknown scopes', async () => {
      await expect(resolve({ MCP_USER_ID: 'abc' })).rejects.toThrow(
        'MCP_USER_ID must be a positive integer',
      );
      await expect(resolve({ MCP_USER_ID: '999999' })).rejects.toThrow(
        'User 999999 not found',
      );
      const pending = await prisma.user.create({
        data: { email: 'pre@example.com', name: 'Pré', pending: true },
      });
      await expect(
        resolve({ MCP_USER_ID: String(pending.id) }),
      ).rejects.toThrow(`User ${pending.id} not found`);
      await expect(
        resolve({ MCP_USER_ID: String(anaId), MCP_SCOPES: 'admin' }),
      ).rejects.toThrow('MCP_SCOPES must list');
    });
  });

  describe('in memory', () => {
    it('a read-only local identity sees and runs only the read tools', async () => {
      const client = await connect(
        await resolve({ MCP_USER_ID: String(anaId) }),
      );
      expect(await names(client)).toEqual(READ_TOOLS);
      const summary = await client.callTool({
        name: 'get_budget_summary',
        arguments: { month: '2026-10' },
      });
      expect(summary.isError).toBeFalsy();
      expect(summary.structuredContent).toMatchObject({
        summary: { month: '2026-10' },
      });
      await client.close();
    });

    it('acts only for its own user', async () => {
      const bruno = await signUp(api, 'Bruno Lima', 'bruno@example.com');
      await bruno
        .post('/budget/groups')
        .send({ kind: 'EXPENSE', name: 'Do Bruno' })
        .expect(201);
      const client = await connect(
        await resolve({
          MCP_USER_ID: String(anaId),
          MCP_SCOPES: 'budget:read budget:write',
        }),
      );
      const brunoType = await prisma.categoryGroup.findFirstOrThrow({
        where: { name: 'Do Bruno' },
      });
      const res = await client.callTool({
        name: 'update_category_type',
        arguments: { typeId: brunoType.id, name: 'Hack' },
      });
      expect(res.isError).toBe(true);
      expect(textOf(res)).toMatch(/^404 /);
      await client.close();
    });

    it('a token identity is checked again on every call', async () => {
      const { access_token } = await connectAgent(api, ana);
      const client = await connect(
        await resolve({ MCP_ACCESS_TOKEN: access_token }),
      );

      const before = await client.callTool({
        name: 'get_categories',
        arguments: {},
      });
      expect(before.isError).toBeFalsy();

      const grants = await ana.get('/oauth/grants').expect(200);
      await ana
        .delete(`/oauth/grants/${(grants.body as { id: number }[])[0].id}`)
        .expect(204);

      const after = await client.callTool({
        name: 'get_categories',
        arguments: {},
      });
      expect(after.isError).toBe(true);
      expect(textOf(after)).toBe(
        '401 Access revoked or expired; reconnect the agent',
      );
      await client.close();
    });
  });

  describe.skipIf(!existsSync(STDIO_ENTRY))(
    'built process (dist/mcp/stdio.js)',
    () => {
      it('speaks only JSON-RPC on stdout', async () => {
        const transport = new StdioClientTransport({
          command: process.execPath,
          args: [STDIO_ENTRY],
          env: {
            PATH: process.env.PATH ?? '',
            DATABASE_URL: process.env.DATABASE_URL!,
            MCP_USER_ID: String(anaId),
          },
          stderr: 'pipe',
        });
        const client = new Client({ name: 'e2e', version: '1' });
        const errors: Error[] = [];
        client.onerror = (error) => errors.push(error);

        await client.connect(transport);
        expect(client.getServerVersion()).toMatchObject({ name: 'budget' });
        expect(await names(client)).toEqual(READ_TOOLS);
        await client.close();
        expect(errors).toEqual([]);
      });

      it('exits with a message on stderr without an identity', async () => {
        const transport = new StdioClientTransport({
          command: process.execPath,
          args: [STDIO_ENTRY],
          env: {
            PATH: process.env.PATH ?? '',
            DATABASE_URL: process.env.DATABASE_URL!,
          },
          stderr: 'pipe',
        });
        let stderr = '';
        transport.stderr?.on(
          'data',
          (chunk: Buffer) => (stderr += chunk.toString()),
        );
        const client = new Client({ name: 'e2e', version: '1' });
        await expect(client.connect(transport)).rejects.toThrow();
        expect(stderr).toContain(
          'Set exactly one of MCP_ACCESS_TOKEN or MCP_USER_ID',
        );
      });
    },
  );
});

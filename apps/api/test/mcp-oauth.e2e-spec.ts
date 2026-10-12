import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  CONSENT_URL,
  connectAgent,
  decide,
  exchangeCode,
  MCP_RESOURCE,
  newVerifier,
  REDIRECT_URI,
  registerClient,
  requestIdFrom,
  startAuthorization,
  type Tokens,
} from './mcp.js';
import { createTestApp, resetDatabase, signUp, type Agent } from './utils.js';

const ISSUER = 'http://web.test/api';

describe('MCP OAuth authorization server (e2e)', () => {
  let api: INestApplication<App>;
  let prisma: PrismaService;
  let ana: Agent;

  const http = () => request(api.getHttpServer());

  /** Authorizes and approves as Ana; returns the code and the verifier. */
  async function approvedCode(
    client: Awaited<ReturnType<typeof registerClient>>,
  ) {
    const verifier = newVerifier();
    const location = await startAuthorization(api, client, verifier);
    const back = await decide(ana, requestIdFrom(location));
    return { code: back.searchParams.get('code')!, verifier };
  }

  const refresh = (
    client: { client_id: string },
    refreshToken: string,
    extra: Record<string, string> = {},
  ) =>
    http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: client.client_id,
        ...extra,
      });

  beforeEach(async () => {
    api = await createTestApp();
    prisma = api.get(PrismaService);
    await resetDatabase(api);
    ana = await signUp(api, 'Ana Souza', 'ana@example.com');
  });

  afterEach(async () => {
    await api.close();
  });

  describe('discovery', () => {
    it('serves the authorization server metadata at the root and with the issuer path', async () => {
      for (const path of [
        '/.well-known/oauth-authorization-server',
        '/.well-known/oauth-authorization-server/api',
        '/.well-known/openid-configuration',
      ]) {
        const res = await http().get(path).expect(200);
        expect(res.body).toMatchObject({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/oauth/authorize`,
          token_endpoint: `${ISSUER}/oauth/token`,
          registration_endpoint: `${ISSUER}/oauth/register`,
          revocation_endpoint: `${ISSUER}/oauth/revoke`,
          code_challenge_methods_supported: ['S256'],
          scopes_supported: ['budget:read', 'budget:write'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
        });
      }
    });

    it('tells the web app the MCP URL', async () => {
      const res = await http().get('/oauth/info').expect(200);
      expect(res.body).toEqual({
        mcpUrl: MCP_RESOURCE,
        scopes: ['budget:read', 'budget:write'],
      });
    });

    it('does not serve the MCP endpoint on the API', async () => {
      await http().post('/mcp').send({}).expect(404);
    });
  });

  describe('POST /oauth/register', () => {
    it('registers a public client', async () => {
      const res = await http()
        .post('/oauth/register')
        .send({
          client_name: 'Claude',
          redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          scope: 'budget:read',
          logo_uri: 'https://claude.ai/logo.png',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        client_id: expect.any(String),
        client_name: 'Claude',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        token_endpoint_auth_method: 'none',
      });
      expect(res.body).not.toHaveProperty('client_secret');
    });

    it('issues a secret to a confidential client', async () => {
      const client = await registerClient(api, {
        token_endpoint_auth_method: 'client_secret_post',
      });
      expect(client.client_secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await prisma.mcpClient.findUniqueOrThrow({
        where: { id: client.client_id },
      });
      expect(stored.secretHash).not.toBe(client.client_secret);
    });

    it.each([
      [{ redirect_uris: [] }, 'invalid_redirect_uri'],
      [
        { redirect_uris: ['http://evil.example.com/cb'] },
        'invalid_redirect_uri',
      ],
      [{ redirect_uris: ['javascript:alert(1)'] }, 'invalid_redirect_uri'],
      [
        { redirect_uris: ['https://app.example.com/cb#x'] },
        'invalid_redirect_uri',
      ],
      [
        { token_endpoint_auth_method: 'private_key_jwt' },
        'invalid_client_metadata',
      ],
      [{ grant_types: ['client_credentials'] }, 'invalid_client_metadata'],
      [{ response_types: ['token'] }, 'invalid_client_metadata'],
      [{ client_name: 42 }, 'invalid_client_metadata'],
    ])('rejects %j', async (body, error) => {
      const res = await http()
        .post('/oauth/register')
        .send({ redirect_uris: [REDIRECT_URI], ...body })
        .expect(400);
      expect(res.body).toMatchObject({ error });
    });

    it('accepts loopback http and private-use schemes', async () => {
      await registerClient(api, {
        redirect_uris: [
          'http://localhost:8080/cb',
          'cursor://anysphere.cursor-retrieval/oauth/callback',
        ],
      });
    });
  });

  describe('GET /oauth/authorize', () => {
    it('stores the request and sends the browser to the consent screen', async () => {
      const client = await registerClient(api);
      const location = await startAuthorization(api, client, newVerifier());

      expect(`${location.origin}${location.pathname}`).toBe(CONSENT_URL);
      const request = await prisma.mcpAuthorizationRequest.findUniqueOrThrow({
        where: { id: requestIdFrom(location) },
      });
      expect(request).toMatchObject({
        clientId: client.client_id,
        redirectUri: REDIRECT_URI,
        state: 'xyz',
        scopes: ['budget:read', 'budget:write'],
        resource: MCP_RESOURCE,
      });
    });

    it('shows an error screen for an unknown client or redirect URI', async () => {
      const client = await registerClient(api);
      const unknown = await startAuthorization(
        api,
        { ...client, client_id: '00000000-0000-4000-8000-000000000000' },
        newVerifier(),
      );
      expect(unknown.href).toBe(`${CONSENT_URL}?error=invalid_client`);

      const wrongUri = await startAuthorization(api, client, newVerifier(), {
        redirect_uri: 'https://evil.example.com/cb',
      });
      expect(wrongUri.href).toBe(`${CONSENT_URL}?error=invalid_redirect_uri`);
    });

    it('accepts a loopback redirect URI on another port', async () => {
      const client = await registerClient(api);
      const location = await startAuthorization(api, client, newVerifier(), {
        redirect_uri: 'http://127.0.0.1:50000/callback',
      });
      expect(location.searchParams.get('request')).toBeTruthy();
    });

    it.each([
      [{ response_type: 'token' }, 'unsupported_response_type'],
      [{ code_challenge_method: 'plain' }, 'invalid_request'],
      [{ code_challenge: 'short' }, 'invalid_request'],
      [{ scope: 'budget:read admin' }, 'invalid_scope'],
      [{ resource: 'https://other.example.com/mcp' }, 'invalid_target'],
    ])('returns %j to the client as an error', async (params, error) => {
      const client = await registerClient(api);
      const location = await startAuthorization(
        api,
        client,
        newVerifier(),
        params,
      );
      expect(`${location.origin}${location.pathname}`).toBe(
        'http://127.0.0.1:33418/callback',
      );
      expect(location.searchParams.get('error')).toBe(error);
      expect(location.searchParams.get('state')).toBe('xyz');
      expect(location.searchParams.get('iss')).toBe(ISSUER);
    });

    it('narrows the scopes to the ones asked for', async () => {
      const client = await registerClient(api);
      const location = await startAuthorization(api, client, newVerifier(), {
        scope: 'budget:read',
      });
      const res = await ana
        .get(`/oauth/requests/${requestIdFrom(location)}`)
        .expect(200);
      expect(res.body).toMatchObject({
        client: { name: 'Claude' },
        redirectHost: '127.0.0.1:33418',
        scopes: ['budget:read'],
      });
    });
  });

  describe('consent', () => {
    it('needs a session', async () => {
      const client = await registerClient(api);
      const id = requestIdFrom(
        await startAuthorization(api, client, newVerifier()),
      );
      await http().get(`/oauth/requests/${id}`).expect(401);
      await http()
        .post(`/oauth/requests/${id}`)
        .send({ approve: true })
        .expect(401);
    });

    it('denying sends access_denied and consumes the request', async () => {
      const client = await registerClient(api);
      const id = requestIdFrom(
        await startAuthorization(api, client, newVerifier()),
      );

      const back = await decide(ana, id, false);
      expect(back.searchParams.get('error')).toBe('access_denied');
      expect(back.searchParams.get('state')).toBe('xyz');
      expect(back.searchParams.has('code')).toBe(false);

      await ana.get(`/oauth/requests/${id}`).expect(404);
      await ana
        .post(`/oauth/requests/${id}`)
        .send({ approve: true })
        .expect(404);
    });

    it('approving issues a code bound to whoever approved', async () => {
      const client = await registerClient(api);
      const id = requestIdFrom(
        await startAuthorization(api, client, newVerifier()),
      );

      const back = await decide(ana, id);
      expect(back.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(back.searchParams.get('iss')).toBe(ISSUER);
      const code = await prisma.mcpAuthorizationCode.findFirstOrThrow();
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(code.userId).toBe(user.id);
    });

    it('rejects an expired, unknown or malformed request', async () => {
      const client = await registerClient(api);
      const id = requestIdFrom(
        await startAuthorization(api, client, newVerifier()),
      );
      await prisma.mcpAuthorizationRequest.update({
        where: { id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await ana.get(`/oauth/requests/${id}`).expect(404);
      await ana
        .post(`/oauth/requests/${id}`)
        .send({ approve: true })
        .expect(404);
      await ana.get('/oauth/requests/not-a-uuid').expect(404);
    });

    it('validates the decision body', async () => {
      const client = await registerClient(api);
      const id = requestIdFrom(
        await startAuthorization(api, client, newVerifier()),
      );
      await ana.post(`/oauth/requests/${id}`).send({}).expect(400);
      await ana
        .post(`/oauth/requests/${id}`)
        .send({ approve: true, userId: 99 })
        .expect(400);
    });
  });

  describe('POST /oauth/token', () => {
    it('exchanges a code with PKCE for tokens bound to the MCP resource', async () => {
      const client = await registerClient(api);
      const { code, verifier } = await approvedCode(client);

      const res = await exchangeCode(api, client, code, verifier).expect(200);
      expect(res.get('Cache-Control')).toBe('no-store');
      expect(res.body).toEqual({
        access_token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        refresh_token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'budget:read budget:write',
      });
      const grant = await prisma.mcpGrant.findFirstOrThrow();
      expect(grant.resource).toBe(MCP_RESOURCE);
      expect(grant.accessHash).not.toBe((res.body as Tokens).access_token);
    });

    it('also takes JSON bodies', async () => {
      const client = await registerClient(api);
      const { code, verifier } = await approvedCode(client);
      await http()
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          client_id: client.client_id,
        })
        .expect(200);
    });

    it('rejects a wrong verifier, client or redirect URI', async () => {
      const client = await registerClient(api);
      const other = await registerClient(api);
      const { code, verifier } = await approvedCode(client);

      const wrongVerifier = await exchangeCode(
        api,
        client,
        code,
        newVerifier(),
      ).expect(400);
      expect(wrongVerifier.body).toMatchObject({ error: 'invalid_grant' });

      const wrongClient = await exchangeCode(api, other, code, verifier).expect(
        400,
      );
      expect(wrongClient.body).toMatchObject({ error: 'invalid_grant' });

      const wrongUri = await http()
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          client_id: client.client_id,
          redirect_uri: 'http://127.0.0.1:1/other',
        })
        .expect(400);
      expect(wrongUri.body).toMatchObject({ error: 'invalid_grant' });

      // None of the failures used the code up
      await exchangeCode(api, client, code, verifier).expect(200);
    });

    it('using a code twice fails and revokes what it issued', async () => {
      const client = await registerClient(api);
      const { code, verifier } = await approvedCode(client);
      await exchangeCode(api, client, code, verifier).expect(200);

      const again = await exchangeCode(api, client, code, verifier).expect(400);
      expect(again.body).toMatchObject({ error: 'invalid_grant' });
      const grant = await prisma.mcpGrant.findFirstOrThrow();
      expect(grant.revokedAt).not.toBeNull();
    });

    it('rejects an expired code', async () => {
      const client = await registerClient(api);
      const { code, verifier } = await approvedCode(client);
      await prisma.mcpAuthorizationCode.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await exchangeCode(api, client, code, verifier).expect(400);
    });

    it('authenticates confidential clients (post and basic)', async () => {
      const client = await registerClient(api, {
        token_endpoint_auth_method: 'client_secret_basic',
      });
      const first = await approvedCode(client);
      const missing = await exchangeCode(
        api,
        client,
        first.code,
        first.verifier,
      ).expect(401);
      expect(missing.body).toMatchObject({ error: 'invalid_client' });

      await http()
        .post('/oauth/token')
        .auth(client.client_id, client.client_secret!)
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: first.code,
          code_verifier: first.verifier,
        })
        .expect(200);

      const second = await approvedCode(client);
      await http()
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: second.code,
          code_verifier: second.verifier,
          client_id: client.client_id,
          client_secret: client.client_secret,
        })
        .expect(200);
    });

    it('rejects unknown clients and grant types', async () => {
      const unknown = await http()
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'authorization_code', client_id: 'nope' })
        .expect(401);
      expect(unknown.body).toMatchObject({ error: 'invalid_client' });

      const client = await registerClient(api);
      const grant = await http()
        .post('/oauth/token')
        .type('form')
        .send({ grant_type: 'client_credentials', client_id: client.client_id })
        .expect(400);
      expect(grant.body).toMatchObject({ error: 'unsupported_grant_type' });
    });

    describe('refresh', () => {
      it('rotates both tokens', async () => {
        const tokens = await connectAgent(api, ana);
        const res = await refresh(tokens.client, tokens.refresh_token).expect(
          200,
        );
        const next = res.body as Tokens;
        expect(next.access_token).not.toBe(tokens.access_token);
        expect(next.refresh_token).not.toBe(tokens.refresh_token);
        await refresh(tokens.client, next.refresh_token).expect(200);
      });

      it('tolerates the previous token right after a rotation, revokes on a later reuse', async () => {
        const tokens = await connectAgent(api, ana);
        await refresh(tokens.client, tokens.refresh_token).expect(200);
        // A concurrent refresh with the same token: rejected but harmless
        await refresh(tokens.client, tokens.refresh_token).expect(400);
        let grant = await prisma.mcpGrant.findFirstOrThrow();
        expect(grant.revokedAt).toBeNull();

        // Long after the rotation the old token means a leak
        await prisma.mcpGrant.update({
          where: { id: grant.id },
          data: { accessExpiresAt: new Date(Date.now() - 60_000) },
        });
        await refresh(tokens.client, tokens.refresh_token).expect(400);
        grant = await prisma.mcpGrant.findFirstOrThrow();
        expect(grant.revokedAt).not.toBeNull();
      });

      it('may only narrow the scopes', async () => {
        const tokens = await connectAgent(api, ana, { scope: 'budget:read' });
        const wider = await refresh(tokens.client, tokens.refresh_token, {
          scope: 'budget:read budget:write',
        }).expect(400);
        expect(wider.body).toMatchObject({ error: 'invalid_scope' });

        const full = await connectAgent(api, ana);
        const narrowed = await refresh(full.client, full.refresh_token, {
          scope: 'budget:read',
        }).expect(200);
        expect((narrowed.body as Tokens).scope).toBe('budget:read');
      });

      it('rejects another client, an expired or a revoked grant', async () => {
        const tokens = await connectAgent(api, ana);
        const other = await registerClient(api);
        await refresh(other, tokens.refresh_token).expect(400);

        await prisma.mcpGrant.updateMany({
          data: { refreshExpiresAt: new Date(Date.now() - 1000) },
        });
        await refresh(tokens.client, tokens.refresh_token).expect(400);

        const fresh = await connectAgent(api, ana);
        await http()
          .post('/oauth/revoke')
          .type('form')
          .send({
            token: fresh.access_token,
            client_id: fresh.client.client_id,
          })
          .expect(200);
        await refresh(fresh.client, fresh.refresh_token).expect(400);
      });
    });
  });

  describe('POST /oauth/revoke', () => {
    it('answers 200 for unknown tokens and needs a known client', async () => {
      const client = await registerClient(api);
      await http()
        .post('/oauth/revoke')
        .type('form')
        .send({ token: 'unknown', client_id: client.client_id })
        .expect(200);
      await http()
        .post('/oauth/revoke')
        .type('form')
        .send({ token: 'unknown', client_id: 'nope' })
        .expect(401);
    });

    it("can't revoke another client's token", async () => {
      const tokens = await connectAgent(api, ana);
      const other = await registerClient(api);
      await http()
        .post('/oauth/revoke')
        .type('form')
        .send({ token: tokens.refresh_token, client_id: other.client_id })
        .expect(200);
      const grant = await prisma.mcpGrant.findFirstOrThrow();
      expect(grant.revokedAt).toBeNull();
    });
  });

  describe('connected agents', () => {
    it('lists and revokes the user’s connections only', async () => {
      const bruno = await signUp(api, 'Bruno Lima', 'bruno@example.com');
      await connectAgent(api, ana);
      await connectAgent(api, bruno, { scope: 'budget:read' });

      const anas = await ana.get('/oauth/grants').expect(200);
      expect(anas.body).toEqual([
        {
          id: expect.any(Number),
          client: { name: 'Claude' },
          scopes: ['budget:read', 'budget:write'],
          createdAt: expect.any(String),
          lastUsedAt: expect.any(String),
        },
      ]);
      const brunos = await bruno.get('/oauth/grants').expect(200);
      const brunoGrant = (brunos.body as { id: number }[])[0];

      // Ana can't revoke Bruno's connection: 404, not 403
      await ana.delete(`/oauth/grants/${brunoGrant.id}`).expect(404);
      await bruno.delete(`/oauth/grants/${brunoGrant.id}`).expect(204);
      await bruno.delete(`/oauth/grants/${brunoGrant.id}`).expect(404);
      expect((await bruno.get('/oauth/grants').expect(200)).body).toEqual([]);
      expect((await ana.get('/oauth/grants').expect(200)).body).toHaveLength(1);
      await http().get('/oauth/grants').expect(401);
    });
  });
});

describe('MCP OAuth discovery under API_PREFIX (e2e)', () => {
  let api: INestApplication<App>;

  beforeAll(() => {
    vi.stubEnv('API_PREFIX', 'api');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    api = await createTestApp();
  });

  afterEach(async () => {
    await api.close();
  });

  it('keeps .well-known at the root and the OAuth routes under the prefix', async () => {
    const res = await request(api.getHttpServer())
      .get('/.well-known/oauth-authorization-server/api')
      .expect(200);
    expect(res.body).toMatchObject({ issuer: ISSUER });
    await request(api.getHttpServer()).get('/api/oauth/info').expect(200);
    await request(api.getHttpServer()).get('/oauth/info').expect(404);
  });
});

import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { s256 } from '../src/oauth-server/pkce.js';
import type { Agent } from './utils.js';

/** The MCP endpoint and redirect URI the e2e config produces. */
export const MCP_RESOURCE = 'http://localhost:3001/mcp';
export const REDIRECT_URI = 'http://127.0.0.1:33418/callback';
export const CONSENT_URL = 'http://web.test/autorizar-agente';

export interface RegisteredClient {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export const newVerifier = () => randomBytes(32).toString('base64url');

/** Registers a public client (DCR) on the API. */
export async function registerClient(
  api: INestApplication<App>,
  body: Record<string, unknown> = {},
): Promise<RegisteredClient> {
  const res = await request(api.getHttpServer())
    .post('/oauth/register')
    .send({ client_name: 'Claude', redirect_uris: [REDIRECT_URI], ...body })
    .expect(201);
  return res.body as RegisteredClient;
}

/** `GET /oauth/authorize` with valid PKCE parameters; returns the Location. */
export async function startAuthorization(
  api: INestApplication<App>,
  client: RegisteredClient,
  verifier: string,
  params: Record<string, string> = {},
): Promise<URL> {
  const res = await request(api.getHttpServer())
    .get('/oauth/authorize')
    .query({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: s256(verifier),
      code_challenge_method: 'S256',
      state: 'xyz',
      resource: MCP_RESOURCE,
      ...params,
    })
    .expect(302);
  return new URL(res.get('Location')!);
}

/** The consent screen's request id from the authorize redirect. */
export function requestIdFrom(location: URL): string {
  const id = location.searchParams.get('request');
  if (!id) throw new Error(`No request in ${location.href}`);
  return id;
}

/** The signed-in `user` approves (or denies) on the consent screen. */
export async function decide(
  user: Agent,
  requestId: string,
  approve = true,
): Promise<URL> {
  const res = await user
    .post(`/oauth/requests/${requestId}`)
    .send({ approve })
    .expect(200);
  return new URL((res.body as { redirectUrl: string }).redirectUrl);
}

export function exchangeCode(
  api: INestApplication<App>,
  client: RegisteredClient,
  code: string,
  verifier: string,
) {
  return request(api.getHttpServer()).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
  });
}

/**
 * The whole OAuth flow for `user`: registers a client, authorizes, approves
 * on the consent screen and exchanges the code (PKCE). Returns the tokens.
 */
export async function connectAgent(
  api: INestApplication<App>,
  user: Agent,
  { scope = 'budget:read budget:write' }: { scope?: string } = {},
): Promise<Tokens & { client: RegisteredClient }> {
  const client = await registerClient(api);
  const verifier = newVerifier();
  const location = await startAuthorization(api, client, verifier, { scope });
  const back = await decide(user, requestIdFrom(location));
  const res = await exchangeCode(
    api,
    client,
    back.searchParams.get('code')!,
    verifier,
  ).expect(200);
  return { ...(res.body as Tokens), client };
}

let rpcId = 0;

/** A JSON-RPC request to the MCP endpoint (supertest, not awaited). */
export function mcpRequest(
  mcp: INestApplication<App>,
  token: string | undefined,
  method: string,
  params?: Record<string, unknown>,
) {
  const req = request(mcp.getHttpServer())
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .send({ jsonrpc: '2.0', id: ++rpcId, method, params });
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

export interface ToolResult {
  isError?: boolean;
  text: string;
  data: Record<string, unknown>;
}

/** Calls a tool and returns its text and structured content. */
export async function callTool(
  mcp: INestApplication<App>,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  const res = await mcpRequest(mcp, token, 'tools/call', {
    name,
    arguments: args,
  }).expect(200);
  const body = res.body as {
    result?: {
      isError?: boolean;
      content: { text: string }[];
      structuredContent?: Record<string, unknown>;
    };
    error?: unknown;
  };
  if (!body.result) throw new Error(`JSON-RPC error: ${JSON.stringify(body)}`);
  return {
    isError: body.result.isError,
    text: body.result.content[0]?.text ?? '',
    data: body.result.structuredContent ?? {},
  };
}

/** Names of the tools the token sees. */
export async function toolNames(
  mcp: INestApplication<App>,
  token: string,
): Promise<string[]> {
  const res = await mcpRequest(mcp, token, 'tools/list').expect(200);
  return (res.body as { result: { tools: { name: string }[] } }).result.tools
    .map((tool) => tool.name)
    .sort();
}

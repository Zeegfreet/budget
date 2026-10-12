import { parseScopes } from '../oauth-server/scopes.js';
import type { McpTokenVerifier } from '../oauth-server/token-verifier.js';
import type { McpPrincipal } from './principal.js';
import type { Authorize } from './tool.js';

export interface StdioIdentity {
  principal: McpPrincipal;
  /** Re-checked before every tool call (only for a token) */
  authorize?: Authorize;
}

/**
 * Who the stdio process acts for, from its environment — exactly one of:
 * - `MCP_ACCESS_TOKEN`: an OAuth access token, checked again on every call;
 * - `MCP_USER_ID` (+ `MCP_SCOPES`, default `budget:read`): a trusted identity
 *   for a process the app itself starts for a signed-in user. Whoever runs it
 *   already holds `DATABASE_URL`; never expose this mode to end users.
 * Throws with a message for stderr when the environment doesn't say.
 */
export async function resolveStdioPrincipal(
  env: Record<string, string | undefined>,
  verifier: McpTokenVerifier,
): Promise<StdioIdentity> {
  const token = env.MCP_ACCESS_TOKEN || undefined;
  const userId = env.MCP_USER_ID || undefined;
  if (Boolean(token) === Boolean(userId)) {
    throw new Error('Set exactly one of MCP_ACCESS_TOKEN or MCP_USER_ID');
  }

  if (token) {
    const principal = await verifier.verify(token);
    if (!principal) {
      throw new Error('MCP_ACCESS_TOKEN is invalid, expired or revoked');
    }
    return { principal, authorize: () => verifier.verify(token) };
  }

  if (!/^[1-9]\d*$/.test(userId!)) {
    throw new Error('MCP_USER_ID must be a positive integer');
  }
  const scopes = parseScopes(env.MCP_SCOPES ?? 'budget:read');
  if (!scopes) {
    throw new Error('MCP_SCOPES must list budget:read and/or budget:write');
  }
  const principal = await verifier.local(Number(userId), scopes);
  if (!principal) throw new Error(`User ${userId} not found`);
  return { principal };
}

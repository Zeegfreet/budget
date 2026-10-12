/** What an agent may do with the user's budget; granted on the consent screen. */
export const MCP_SCOPES = ['budget:read', 'budget:write'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

const isScope = (value: string): value is McpScope =>
  (MCP_SCOPES as readonly string[]).includes(value);

/**
 * A space-separated `scope` parameter as the known scopes, in canonical order.
 * Missing or blank means every scope; an unknown one makes it invalid (`null`).
 */
export function parseScopes(value: unknown): McpScope[] | null {
  if (value === undefined || value === null) return [...MCP_SCOPES];
  if (typeof value !== 'string') return null;
  const parts = value.split(' ').filter(Boolean);
  if (parts.length === 0) return [...MCP_SCOPES];
  if (!parts.every(isScope)) return null;
  return MCP_SCOPES.filter((scope) => parts.includes(scope));
}

/** Scopes as stored in the database, keeping only the known ones. */
export const knownScopes = (values: readonly string[]): McpScope[] =>
  MCP_SCOPES.filter((scope) => values.includes(scope));

export const formatScopes = (scopes: readonly string[]) => scopes.join(' ');

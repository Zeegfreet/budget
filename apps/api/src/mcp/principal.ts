import type { McpScope } from '../oauth-server/scopes.js';

/**
 * Who the MCP tools act for: the only input of `McpServerFactory`. The user id
 * comes from a verified token (`oauth`) or from a process the app itself
 * started for a signed-in user (`local`), never from the tool arguments.
 */
export interface McpPrincipal {
  userId: number;
  scopes: McpScope[];
  via: 'oauth' | 'local';
}

export const hasScope = (principal: McpPrincipal, scope: McpScope) =>
  principal.scopes.includes(scope);

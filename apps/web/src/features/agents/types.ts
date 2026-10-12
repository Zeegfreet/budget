/** What an AI agent may do with the user's budget (OAuth scopes of the MCP server). */
export type AgentScope = 'budget:read' | 'budget:write'

/** A pending authorization request, shown on the consent screen. */
export interface AuthorizationRequest {
  id: string
  client: { name: string }
  /** Host (or app scheme) the agent is sent back to */
  redirectHost: string
  scopes: AgentScope[]
  expiresAt: string
}

/** One of the user's connected agents. */
export interface AgentGrant {
  id: number
  client: { name: string }
  scopes: AgentScope[]
  createdAt: string
  lastUsedAt: string
}

export interface McpInfo {
  /** URL to add to an MCP client (Claude, Claude Code, …) */
  mcpUrl: string
  scopes: AgentScope[]
}

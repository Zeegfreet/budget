import type { McpConfig } from '../mcp/mcp.config.js';
import { MCP_SCOPES } from './scopes.js';

/** RFC 8414 authorization server metadata (also served as OIDC discovery). */
export function authorizationServerMetadata(config: McpConfig) {
  const { issuer } = config;
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: [...MCP_SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: [
      'none',
      'client_secret_post',
      'client_secret_basic',
    ],
    revocation_endpoint_auth_methods_supported: [
      'none',
      'client_secret_post',
      'client_secret_basic',
    ],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${config.webUrl}/settings/agents`,
  };
}

/** RFC 9728 protected resource metadata of the MCP endpoint. */
export function protectedResourceMetadata(config: McpConfig) {
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Budget',
    resource_documentation: `${config.webUrl}/settings/agents`,
  };
}

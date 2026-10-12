import { Inject, Injectable } from '@nestjs/common';
import { isTokenShaped, hashToken } from '../activation/token.js';
import { MCP_CONFIG, type McpConfig } from '../mcp/mcp.config.js';
import type { McpPrincipal } from '../mcp/principal.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { knownScopes, type McpScope } from './scopes.js';

/** `lastUsedAt` is refreshed at most this often, not on every call. */
const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Resolves who an MCP request acts for. Shared by the HTTP guard and the stdio
 * entrypoint, so both apply the same rules.
 */
@Injectable()
export class McpTokenVerifier {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MCP_CONFIG) private readonly config: McpConfig,
  ) {}

  /**
   * The principal of an access token, or `null` when it is unknown, expired,
   * revoked or was issued for another resource.
   */
  async verify(token: unknown, now = new Date()): Promise<McpPrincipal | null> {
    if (!isTokenShaped(token)) return null;
    const grant = await this.prisma.mcpGrant.findUnique({
      where: { accessHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        scopes: true,
        resource: true,
        accessExpiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    });
    if (
      !grant ||
      grant.revokedAt ||
      grant.accessExpiresAt <= now ||
      grant.resource !== this.config.resource
    ) {
      return null;
    }
    if (now.getTime() - grant.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS) {
      await this.prisma.mcpGrant.update({
        where: { id: grant.id },
        data: { lastUsedAt: now },
      });
    }
    return {
      userId: grant.userId,
      scopes: knownScopes(grant.scopes),
      via: 'oauth',
    };
  }

  /**
   * A trusted principal for a process the app started for a signed-in user
   * (stdio with `MCP_USER_ID`). `null` when the user doesn't exist or is a
   * pre-registration.
   */
  async local(
    userId: number,
    scopes: McpScope[],
  ): Promise<McpPrincipal | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pending: true },
    });
    if (!user || user.pending) return null;
    return { userId, scopes, via: 'local' };
  }
}

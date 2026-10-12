import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { hashToken } from '../activation/token.js';
import { bearerToken } from './mcp-bearer.guard.js';

/** Rate limit per access token (one agent), or per IP without one. */
@Injectable()
export class McpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const token = bearerToken(req as unknown as Request);
    return Promise.resolve(
      token ? `token:${hashToken(token)}` : `ip:${String(req.ip)}`,
    );
  }
}

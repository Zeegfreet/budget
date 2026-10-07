import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The authenticated principal, taken from the access token (no database lookup). */
export interface JwtUser {
  id: number;
}

/**
 * The signed-in user. Use it as the owner of any user data; never trust an id
 * from the body or params.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser =>
    ctx.switchToHttp().getRequest<Request & { user: JwtUser }>().user,
);

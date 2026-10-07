import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { AUTH_CONFIG, type AuthConfig } from '../auth.config.js';
import { ACCESS_COOKIE } from '../auth.cookies.js';
import type { JwtUser } from '../decorators/current-user.decorator.js';

export interface AccessTokenPayload {
  sub: number;
}

export function accessTokenFromCookie(req: Request): string | null {
  const token: unknown = req.cookies?.[ACCESS_COOKIE];
  return typeof token === 'string' && token ? token : null;
}

/** Stateless: trusts the signed access token and never touches the database. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    super({
      jwtFromRequest: accessTokenFromCookie,
      ignoreExpiration: false,
      secretOrKey: config.accessSecret,
      algorithms: ['HS256'],
    });
  }

  validate(payload: AccessTokenPayload): JwtUser {
    return { id: payload.sub };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { AuthUser } from '../../user/user.service.js';
import { AuthService } from '../auth.service.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<AuthUser> {
    const user = await this.authService.validateCredentials(email, password);
    // Same answer for unknown e-mail and wrong password: no user enumeration
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return user;
  }
}

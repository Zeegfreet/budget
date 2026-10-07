import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthService } from '../auth.service.js';
import { accessTokenFromCookie, JwtStrategy } from './jwt.strategy.js';
import { LocalStrategy } from './local.strategy.js';

describe('LocalStrategy', () => {
  const authService = { validateCredentials: vi.fn() };
  const strategy = new LocalStrategy(authService as unknown as AuthService);

  it('returns the user for valid credentials', async () => {
    const user = { id: 1, email: 'ana@example.com', name: 'Ana' };
    authService.validateCredentials.mockResolvedValue(user);

    await expect(
      strategy.validate('ana@example.com', 'segredo123'),
    ).resolves.toBe(user);
  });

  it('throws a generic 401 otherwise', async () => {
    authService.validateCredentials.mockResolvedValue(null);

    await expect(strategy.validate('ana@example.com', 'x')).rejects.toEqual(
      new UnauthorizedException('Invalid credentials'),
    );
  });
});

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy({
    accessSecret: 'secret',
    accessTtlSeconds: 900,
    refreshTtlDays: 7,
    cookieSecure: false,
  });

  it('maps the token subject to the principal', () => {
    expect(strategy.validate({ sub: 7 })).toEqual({ id: 7 });
  });

  it.each([
    [{ cookies: { access_token: 'jwt' } }, 'jwt'],
    [{ cookies: { access_token: '' } }, null],
    [{ cookies: {} }, null],
    [{ headers: { authorization: 'Bearer jwt' } }, null],
  ])('reads the token only from the access cookie (%o)', (req, expected) => {
    expect(accessTokenFromCookie(req as unknown as Request)).toBe(expected);
  });
});

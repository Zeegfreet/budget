import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  const reflector = new Reflector();
  const guard = new JwtAuthGuard(reflector);
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets @Public() routes through without checking the token', () => {
    const getAll = vi
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(true);
    const passport = vi.spyOn(AuthGuard('jwt').prototype, 'canActivate');

    expect(guard.canActivate(context)).toBe(true);
    expect(getAll).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
    expect(passport).not.toHaveBeenCalled();
  });

  it('delegates every other route to the JWT strategy', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const passport = vi
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(false);

    expect(guard.canActivate(context)).toBe(false);
    expect(passport).toHaveBeenCalledWith(context);
  });
});

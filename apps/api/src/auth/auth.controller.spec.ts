import type { Request, Response } from 'express';
import type { AuthConfig } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

const config: AuthConfig = {
  accessSecret: 'secret',
  accessTtlSeconds: 900,
  refreshTtlDays: 7,
  cookieSecure: true,
};
const authUser = { id: 1, email: 'ana@example.com', name: 'Ana Souza' };
const result = {
  user: authUser,
  tokens: { accessToken: 'access', refreshToken: 'refresh' },
};

describe('AuthController', () => {
  const authService = {
    register: vi.fn(),
    signIn: vi.fn(),
    refresh: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    activationInfo: vi.fn(),
    activate: vi.fn(),
    completeSignup: vi.fn(),
    resendActivation: vi.fn(),
  };
  const controller = new AuthController(
    authService as unknown as AuthService,
    config,
  );
  const res = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
  const req = (extra: Record<string, unknown> = {}) =>
    ({
      ip: '::1',
      get: () => 'agent',
      cookies: {},
      ...extra,
    }) as unknown as Request;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const expectSessionCookies = () => {
    expect(res.cookie).toHaveBeenCalledWith('access_token', 'access', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 900_000,
    });
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  };

  const expectClearedCookies = () => {
    expect(res.clearCookie).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ path: '/' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/auth' }),
    );
  };

  it('register returns where the link went, without cookies', async () => {
    authService.register.mockResolvedValue({ email: 'ana@example.com' });
    const dto = { email: 'ana@example.com' } as never;

    await expect(controller.register(dto)).resolves.toEqual({
      email: 'ana@example.com',
    });
    expect(authService.register).toHaveBeenCalledWith(dto);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('describes an activation link', async () => {
    const info = { email: 'ana@example.com', name: 'Ana', kind: 'ACTIVATE' };
    authService.activationInfo.mockResolvedValue(info);

    await expect(controller.activationInfo({ token: 't' })).resolves.toBe(info);
    expect(authService.activationInfo).toHaveBeenCalledWith('t');
  });

  it('activate opens a session', async () => {
    authService.activate.mockResolvedValue(result);

    await expect(
      controller.activate({ token: 't' }, req(), res),
    ).resolves.toEqual(authUser);
    expect(authService.activate).toHaveBeenCalledWith('t', {
      userAgent: 'agent',
      ip: '::1',
    });
    expectSessionCookies();
  });

  it('completeSignup opens a session', async () => {
    authService.completeSignup.mockResolvedValue(result);
    const dto = { token: 't', name: 'Ana' } as never;

    await expect(controller.completeSignup(dto, req(), res)).resolves.toEqual(
      authUser,
    );
    expect(authService.completeSignup).toHaveBeenCalledWith(dto, {
      userAgent: 'agent',
      ip: '::1',
    });
    expectSessionCookies();
  });

  it('resendActivation forwards the e-mail', async () => {
    await controller.resendActivation({ email: 'ana@example.com' });

    expect(authService.resendActivation).toHaveBeenCalledWith(
      'ana@example.com',
    );
  });

  it('login opens a session for the user validated by the local strategy', async () => {
    authService.signIn.mockResolvedValue(result);

    await expect(
      controller.login(req({ user: authUser }) as never, res),
    ).resolves.toEqual(authUser);
    expect(authService.signIn).toHaveBeenCalledWith(authUser, {
      userAgent: 'agent',
      ip: '::1',
    });
    expectSessionCookies();
  });

  it('refresh reads the refresh cookie and sets new cookies', async () => {
    authService.refresh.mockResolvedValue(result);

    await controller.refresh(req({ cookies: { refresh_token: 'old' } }), res);

    expect(authService.refresh).toHaveBeenCalledWith('old');
    expectSessionCookies();
  });

  it('refresh clears the cookies when it fails', async () => {
    authService.refresh.mockRejectedValue(new Error('invalid'));

    await expect(controller.refresh(req(), res)).rejects.toThrow('invalid');
    expectClearedCookies();
  });

  it('me loads the user from the token subject', async () => {
    authService.me.mockResolvedValue(authUser);

    await expect(controller.me({ id: 1 })).resolves.toEqual(authUser);
    expect(authService.me).toHaveBeenCalledWith(1);
  });

  it('logout revokes the session and clears the cookies', async () => {
    await controller.logout(req({ cookies: { refresh_token: 'token' } }), res);

    expect(authService.logout).toHaveBeenCalledWith('token');
    expectClearedCookies();
  });
  it('changePassword sets the new session cookies and returns the user', async () => {
    authService.changePassword.mockResolvedValue(result);
    const dto = { currentPassword: 'a', newPassword: 'b' } as never;

    await expect(
      controller.changePassword({ id: 1 }, dto, req(), res),
    ).resolves.toEqual(authUser);
    expect(authService.changePassword).toHaveBeenCalledWith(1, dto, {
      userAgent: 'agent',
      ip: '::1',
    });
    expectSessionCookies();
  });
});

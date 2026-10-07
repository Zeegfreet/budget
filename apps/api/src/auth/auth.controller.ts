import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../user/user.service.js';
import { AUTH_CONFIG, type AuthConfig } from './auth.config.js';
import {
  clearAuthCookies,
  REFRESH_COOKIE,
  setAuthCookies,
} from './auth.cookies.js';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  CurrentUser,
  type JwtUser,
} from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { AuthUserDto } from './dto/auth-user.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';
import type { SessionMeta } from './session.service.js';

const MINUTE_MS = 60_000;
/** Brute-force protection for credential endpoints, per client IP */
const CREDENTIALS_THROTTLE = { default: { limit: 5, ttl: MINUTE_MS } };
const REFRESH_THROTTLE = { default: { limit: 30, ttl: MINUTE_MS } };

const sessionMeta = (req: Request): SessionMeta => ({
  userAgent: req.get('user-agent'),
  ip: req.ip,
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('register')
  @ApiConflictResponse({ description: 'E-mail already registered' })
  @ApiTooManyRequestsResponse()
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    return this.open(
      res,
      await this.authService.register(dto, sessionMeta(req)),
    );
  }

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiTooManyRequestsResponse()
  async login(
    @Req() req: Request & { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    return this.open(
      res,
      await this.authService.signIn(req.user, sessionMeta(req)),
    );
  }

  /** Swaps the refresh cookie for a new access + refresh pair. */
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or revoked refresh token',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    try {
      return this.open(
        res,
        await this.authService.refresh(req.cookies?.[REFRESH_COOKIE]),
      );
    } catch (error) {
      clearAuthCookies(res, this.config);
      throw error;
    }
  }

  @ApiCookieAuth()
  @Get('me')
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse()
  me(@CurrentUser() user: JwtUser): Promise<AuthUserDto> {
    return this.authService.me(user.id);
  }

  /** Idempotent: works with an expired access token or no session at all. */
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.config);
  }

  private open(res: Response, { user, tokens }: AuthResult) {
    setAuthCookies(res, tokens, this.config);
    return user;
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
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
import {
  ActivationInfoDto,
  ActivationTokenDto,
  CompleteSignupDto,
  RegisterResultDto,
  ResendActivationDto,
} from './dto/activation.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  ForgotPasswordDto,
  PasswordResetInfoDto,
  PasswordResetTokenDto,
  ResetPasswordDto,
} from './dto/password-reset.dto.js';
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

  /**
   * Creates the account without a session: it signs in only after the
   * activation link sent by e-mail (`POST /auth/activation`).
   */
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('register')
  @ApiCreatedResponse({ type: RegisterResultDto })
  @ApiConflictResponse({ description: 'E-mail already registered' })
  @ApiTooManyRequestsResponse()
  register(@Body() dto: RegisterDto): Promise<RegisterResultDto> {
    return this.authService.register(dto);
  }

  /** What an activation link is for (no side effects, the link stays valid). */
  @Public()
  @Get('activation')
  @ApiOkResponse({ type: ActivationInfoDto })
  @ApiNotFoundResponse({ description: 'Invalid or expired activation link' })
  activationInfo(
    @Query() { token }: ActivationTokenDto,
  ): Promise<ActivationInfoDto> {
    return this.authService.activationInfo(token);
  }

  /** Activates a signed-up account with its link and opens a session. */
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('activation')
  @ApiOkResponse({ type: AuthUserDto })
  @ApiBadRequestResponse({
    description: "A pre-registration's link (use `/auth/activation/signup`)",
  })
  @ApiNotFoundResponse({ description: 'Invalid or expired activation link' })
  @ApiTooManyRequestsResponse()
  async activate(
    @Body() { token }: ActivationTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    return this.open(
      res,
      await this.authService.activate(token, sessionMeta(req)),
    );
  }

  /**
   * Finishes a pre-registration (someone added to a group by e-mail) with the
   * sign-up data and opens a session; the account starts active.
   */
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('activation/signup')
  @ApiOkResponse({ type: AuthUserDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, or the link of an account that only needs activating',
  })
  @ApiNotFoundResponse({ description: 'Invalid or expired activation link' })
  @ApiTooManyRequestsResponse()
  async completeSignup(
    @Body() dto: CompleteSignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    return this.open(
      res,
      await this.authService.completeSignup(dto, sessionMeta(req)),
    );
  }

  /**
   * Sends the activation link again. Always 204, so it doesn't reveal which
   * e-mails have an account.
   */
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('activation/resend')
  @ApiNoContentResponse()
  @ApiTooManyRequestsResponse()
  resendActivation(@Body() { email }: ResendActivationDto): Promise<void> {
    return this.authService.resendActivation(email);
  }

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiForbiddenResponse({
    description: 'Right credentials, but the account is not activated',
  })
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

  /**
   * Changes the signed-in user's password. Every session of the user is
   * revoked and this client gets new cookies; other devices keep only their
   * access token until it expires.
   */
  @ApiCookieAuth()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('password')
  @ApiOkResponse({ type: AuthUserDto })
  @ApiBadRequestResponse({
    description: 'Invalid body, or the new password equals the current one',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'Current password is incorrect' })
  @ApiNotFoundResponse()
  @ApiTooManyRequestsResponse()
  async changePassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    return this.open(
      res,
      await this.authService.changePassword(user.id, dto, sessionMeta(req)),
    );
  }

  /**
   * "Esqueci minha senha": e-mails a link that sets a new password (a
   * pre-registration gets the link that finishes the sign-up). Always 204, so
   * it doesn't reveal which e-mails have an account.
   */
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/forgot')
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Invalid e-mail' })
  @ApiTooManyRequestsResponse()
  forgotPassword(@Body() { email }: ForgotPasswordDto): Promise<void> {
    return this.authService.forgotPassword(email);
  }

  /** Whose password a reset link sets (no side effects, the link stays valid). */
  @Public()
  @Get('password/reset')
  @ApiOkResponse({ type: PasswordResetInfoDto })
  @ApiNotFoundResponse({
    description: 'Invalid or expired password reset link',
  })
  passwordResetInfo(
    @Query() { token }: PasswordResetTokenDto,
  ): Promise<PasswordResetInfoDto> {
    return this.authService.passwordResetInfo(token);
  }

  /**
   * Sets a new password with the e-mailed link (activating the account if it
   * wasn't), ends every session of the user and opens one for this client.
   */
  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('password/reset')
  @ApiOkResponse({ type: AuthUserDto })
  @ApiBadRequestResponse({ description: 'Invalid body' })
  @ApiNotFoundResponse({
    description: 'Invalid or expired password reset link',
  })
  @ApiTooManyRequestsResponse()
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    return this.open(
      res,
      await this.authService.resetPassword(dto, sessionMeta(req)),
    );
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

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UserModule } from '../user/user.module.js';
import { AUTH_CONFIG, authConfigFactory } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { OAUTH_CONFIG, oauthConfigFactory } from './oauth/oauth.config.js';
import { OAuthController } from './oauth/oauth.controller.js';
import { OAuthService } from './oauth/oauth.service.js';
import { SessionService } from './session.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { LocalStrategy } from './strategies/local.strategy.js';

@Module({
  imports: [
    UserModule,
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { accessSecret, accessTtlSeconds } = authConfigFactory(config);
        return {
          secret: accessSecret,
          signOptions: { algorithm: 'HS256', expiresIn: accessTtlSeconds },
        };
      },
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    {
      provide: AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: authConfigFactory,
    },
    {
      provide: OAUTH_CONFIG,
      inject: [ConfigService],
      useFactory: oauthConfigFactory,
    },
    AuthService,
    OAuthService,
    SessionService,
    LocalStrategy,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}

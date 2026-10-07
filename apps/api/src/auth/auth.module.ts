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
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: authConfigFactory,
    },
    AuthService,
    SessionService,
    LocalStrategy,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}

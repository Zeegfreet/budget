import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { BudgetModule } from './budget/budget.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { validateEnv } from './config/env.validation.js';
import { UserModule } from './user/user.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'api',
    }),
    // Default limit per client IP; auth endpoints tighten it with @Throttle
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    UserModule,
    AuthModule,
    BudgetModule,
    GroupsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: rate limit first, then require a session (opt out with @Public())
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
  ],
})
export class AppModule {}

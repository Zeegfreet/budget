import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailModule } from '../mail/mail.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AccountMailer } from './account-mailer.js';
import {
  ACTIVATION_CONFIG,
  activationConfigFactory,
} from './activation.config.js';
import { ActivationService } from './activation.service.js';
import { PasswordResetService } from './password-reset.service.js';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [
    {
      provide: ACTIVATION_CONFIG,
      inject: [ConfigService],
      useFactory: activationConfigFactory,
    },
    ActivationService,
    PasswordResetService,
    AccountMailer,
  ],
  exports: [ActivationService, PasswordResetService, AccountMailer],
})
export class ActivationModule {}

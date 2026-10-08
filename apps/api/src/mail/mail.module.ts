import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_CONFIG, mailConfigFactory } from './mail.config.js';
import { MailService } from './mail.service.js';
import { MAIL_TRANSPORT, mailTransportFactory } from './mail.transport.js';

@Module({
  providers: [
    {
      provide: MAIL_CONFIG,
      inject: [ConfigService],
      useFactory: mailConfigFactory,
    },
    {
      provide: MAIL_TRANSPORT,
      inject: [MAIL_CONFIG],
      useFactory: mailTransportFactory,
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}

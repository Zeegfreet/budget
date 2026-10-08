import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailConfig, SmtpConfig } from './mail.config.js';

/** Injection token of the transport (e2e tests swap it for an outbox). */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/** Delivers through an SMTP server. */
export class SmtpMailTransport implements MailTransport {
  private readonly transporter: Transporter;

  constructor(
    smtp: SmtpConfig,
    private readonly from: string,
  ) {
    this.transporter = createTransport(smtp);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

/** Without SMTP (dev): writes the message to the log, links included. */
export class LogMailTransport implements MailTransport {
  private readonly logger = new Logger('Mail');

  send({ to, subject, text }: MailMessage): Promise<void> {
    this.logger.log(`To: ${to}\nSubject: ${subject}\n\n${text}`);
    return Promise.resolve();
  }
}

export function mailTransportFactory(config: MailConfig): MailTransport {
  return config.smtp
    ? new SmtpMailTransport(config.smtp, config.from)
    : new LogMailTransport();
}

import { ConfigService } from '@nestjs/config';

export const MAIL_CONFIG = Symbol('MAIL_CONFIG');

export interface SmtpConfig {
  host: string;
  port: number;
  /** TLS from the start (port 465); `false` upgrades with STARTTLS when offered */
  secure: boolean;
  auth?: { user: string; pass: string };
}

export interface MailConfig {
  /** `From` header of every message */
  from: string;
  /** `undefined` without `SMTP_HOST`: messages are only logged */
  smtp?: SmtpConfig;
}

export const DEFAULT_MAIL_FROM = 'Budget <no-reply@budget.local>';

export function mailConfigFactory(config: ConfigService): MailConfig {
  const host = config.get<string>('SMTP_HOST');
  const user = config.get<string>('SMTP_USER');
  const pass = config.get<string>('SMTP_PASS');
  return {
    from: config.get<string>('MAIL_FROM') || DEFAULT_MAIL_FROM,
    smtp: host
      ? {
          host,
          port: Number(config.get('SMTP_PORT') ?? 587),
          secure: config.get<string>('SMTP_SECURE') === 'true',
          ...(user && pass && { auth: { user, pass } }),
        }
      : undefined,
  };
}

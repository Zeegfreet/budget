import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DEFAULT_MAIL_FROM, mailConfigFactory } from './mail.config.js';
import { MailService } from './mail.service.js';
import {
  LogMailTransport,
  mailTransportFactory,
  SmtpMailTransport,
} from './mail.transport.js';

const configOf = (env: Record<string, string>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

const message = {
  to: 'ana@example.com',
  subject: 'Oi',
  text: 'texto',
  html: '<p>texto</p>',
};

describe('mailConfigFactory', () => {
  it('has no SMTP without SMTP_HOST', () => {
    expect(mailConfigFactory(configOf({}))).toEqual({
      from: DEFAULT_MAIL_FROM,
      smtp: undefined,
    });
  });

  it('reads the SMTP server, with defaults', () => {
    expect(
      mailConfigFactory(
        configOf({ SMTP_HOST: 'smtp.test', MAIL_FROM: 'Budget <oi@b.app>' }),
      ),
    ).toEqual({
      from: 'Budget <oi@b.app>',
      smtp: { host: 'smtp.test', port: 587, secure: false },
    });
    expect(
      mailConfigFactory(
        configOf({
          SMTP_HOST: 'smtp.test',
          SMTP_PORT: '465',
          SMTP_SECURE: 'true',
          SMTP_USER: 'u',
          SMTP_PASS: 'p',
        }),
      ).smtp,
    ).toEqual({
      host: 'smtp.test',
      port: 465,
      secure: true,
      auth: { user: 'u', pass: 'p' },
    });
  });
});

describe('mailTransportFactory', () => {
  it('uses SMTP when configured, the log otherwise', () => {
    expect(
      mailTransportFactory({
        from: DEFAULT_MAIL_FROM,
        smtp: { host: 'smtp.test', port: 587, secure: false },
      }),
    ).toBeInstanceOf(SmtpMailTransport);
    expect(mailTransportFactory({ from: DEFAULT_MAIL_FROM })).toBeInstanceOf(
      LogMailTransport,
    );
  });

  it('the log transport writes the message', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    await new LogMailTransport().send(message);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('To: ana@example.com'),
    );
    log.mockRestore();
  });
});

describe('MailService', () => {
  const transport = { send: vi.fn() };
  const service = new MailService(transport);

  beforeEach(() => vi.clearAllMocks());

  it('sends through the transport', async () => {
    transport.send.mockResolvedValue(undefined);

    await expect(service.send(message)).resolves.toBe(true);
    expect(transport.send).toHaveBeenCalledWith(message);
  });

  it('logs a failure instead of throwing', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    transport.send.mockRejectedValue(new Error('connection refused'));

    await expect(service.send(message)).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith(
      'Could not send "Oi" to ana@example.com',
      expect.stringContaining('connection refused'),
    );
    error.mockRestore();
  });
});

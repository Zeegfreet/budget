import type { INestApplication } from '@nestjs/common';
import {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from '../src/mail/mail.transport.js';

/** Keeps every message instead of sending it (swapped in by `createTestApp`). */
export class MemoryMailTransport implements MailTransport {
  readonly outbox: MailMessage[] = [];
  /** Makes the next sends fail, like an SMTP server that is down */
  failing = false;

  send(message: MailMessage): Promise<void> {
    if (this.failing) return Promise.reject(new Error('SMTP unavailable'));
    this.outbox.push(message);
    return Promise.resolve();
  }

  /** Messages sent to this address, oldest first. */
  to(email: string) {
    return this.outbox.filter((message) => message.to === email);
  }

  /** The last message sent to this address (fails the test if none). */
  lastTo(email: string): MailMessage {
    const message = this.to(email).at(-1);
    if (!message) throw new Error(`No e-mail sent to ${email}`);
    return message;
  }

  clear() {
    this.outbox.length = 0;
    this.failing = false;
  }
}

export function mailOf(app: INestApplication): MemoryMailTransport {
  return app.get<MemoryMailTransport>(MAIL_TRANSPORT);
}

/** The token in a message's link to `page` (the activation page by default). */
export function tokenFrom(
  message: MailMessage,
  page: 'ativar-conta' | 'redefinir-senha' = 'ativar-conta',
): string {
  const match = new RegExp(`${page}\\?token=([A-Za-z0-9_-]+)`).exec(
    message.text,
  );
  if (!match) throw new Error(`No ${page} link in "${message.subject}"`);
  return match[1];
}

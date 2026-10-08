import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from './mail.transport.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  /**
   * Sends the message; a failure is logged, never thrown, so the request that
   * triggered it still succeeds (the person can ask for the e-mail again).
   * Returns whether it was sent.
   */
  async send(message: MailMessage): Promise<boolean> {
    try {
      await this.transport.send(message);
      return true;
    } catch (error) {
      this.logger.error(
        `Could not send "${message.subject}" to ${message.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}

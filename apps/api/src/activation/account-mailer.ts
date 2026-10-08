import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service.js';
import {
  activationEmail,
  groupInvitationEmail,
  type MailContent,
  preRegistrationEmail,
} from '../mail/templates.js';
import type { AuthUser } from '../user/user.service.js';
import { ActivationService } from './activation.service.js';

/** The group behind an invitation e-mail. */
export interface InvitationContext {
  inviterName: string;
  groupName: string;
}

/**
 * E-mails about the account: activation links (each one replaces the user's
 * previous link) and group invitations. Sending never throws (see
 * `MailService.send`); each method returns whether the e-mail went out.
 */
@Injectable()
export class AccountMailer {
  constructor(
    private readonly activation: ActivationService,
    private readonly mail: MailService,
  ) {}

  /** After a sign-up: the link activates the account. */
  async sendActivation(user: AuthUser): Promise<boolean> {
    const url = await this.newLink(user.id);
    return this.send(
      user,
      activationEmail({
        name: user.name,
        url,
        ttlHours: this.activation.ttlHours,
      }),
    );
  }

  /**
   * To a pre-registration: the link finishes the sign-up. `group` says who
   * added them where (omitted when they only ask for the e-mail again).
   */
  async sendPreRegistration(
    user: AuthUser,
    group?: InvitationContext,
  ): Promise<boolean> {
    const url = await this.newLink(user.id);
    return this.send(
      user,
      preRegistrationEmail({
        nickname: user.name,
        url,
        ttlHours: this.activation.ttlHours,
        group,
      }),
    );
  }

  /** To a registered user invited to a group (they answer in the app). */
  sendGroupInvitation(
    user: AuthUser,
    group: InvitationContext,
  ): Promise<boolean> {
    return this.send(
      user,
      groupInvitationEmail({
        name: user.name,
        ...group,
        url: this.activation.webUrlFor('/grupos'),
      }),
    );
  }

  /**
   * Sends the link again to an account that still needs activating; does
   * nothing for an unknown or active e-mail (the caller doesn't tell them apart).
   */
  async resend(email: string): Promise<void> {
    const user = await this.activation.findUnactivated(email);
    if (!user) return;
    const { pending, ...target } = user;
    if (pending) await this.sendPreRegistration(target);
    else await this.sendActivation(target);
  }

  private async newLink(userId: number) {
    return this.activation.linkFor(await this.activation.issue(userId));
  }

  private send(user: AuthUser, content: MailContent) {
    return this.mail.send({ to: user.email, ...content });
  }
}

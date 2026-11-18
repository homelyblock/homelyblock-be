import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ContactMail = {
  id: string;
  fullName: string;
  email: string;
  subject: string;
  message: string;
  societyName: string | null;
};

/**
 * Sends contact mail only when SUPPORT_EMAIL, MAIL_FROM, and RESEND_API_KEY
 * are all configured. Inquiries are still stored when mail is not configured.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly configService: ConfigService) {}

  async notifyInquiry(inquiry: ContactMail): Promise<{ emailed: boolean }> {
    const supportEmail = this.configService.get<string>('SUPPORT_EMAIL')?.trim();
    const mailFrom = this.configService.get<string>('MAIL_FROM')?.trim();
    const apiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();

    if (!supportEmail || !mailFrom || !apiKey) {
      this.logger.warn(
        `Contact inquiry ${inquiry.id} stored without email. Mail delivery is not configured.`,
      );
      return { emailed: false };
    }

    const society = inquiry.societyName
      ? `Society name: ${inquiry.societyName}\n`
      : '';
    const supportText = [
      'A message was submitted through the LivingSpace contact form.',
      '',
      `Reference: ${inquiry.id}`,
      `Name: ${inquiry.fullName}`,
      `Email: ${inquiry.email}`,
      society.trimEnd(),
      `Subject: ${inquiry.subject}`,
      '',
      inquiry.message,
    ]
      .filter((line) => line !== '')
      .join('\n');

    const confirmationText = [
      `Hello ${inquiry.fullName},`,
      '',
      'We received your message to LivingSpace.',
      `Reference: ${inquiry.id}`,
      `Subject: ${inquiry.subject}`,
      '',
      'Society matters, including complaints about a building or a neighbour, should go to your society administrator. This inbox is for the LivingSpace platform.',
      '',
      'This address is not monitored for password resets. Use the Forgot password link on the sign-in page for account access.',
    ].join('\n');

    const supportSent = await this.send(apiKey, {
      from: mailFrom,
      to: supportEmail,
      replyTo: inquiry.email,
      subject: `LivingSpace contact: ${inquiry.subject}`,
      text: supportText,
    });
    const confirmationSent = await this.send(apiKey, {
      from: mailFrom,
      to: inquiry.email,
      subject: 'We received your LivingSpace message',
      text: confirmationText,
    });

    if (!supportSent || !confirmationSent) {
      this.logger.error(
        `Contact inquiry ${inquiry.id} email delivery was incomplete.`,
      );
    }

    return { emailed: supportSent && confirmationSent };
  }

  private async send(
    apiKey: string,
    message: {
      from: string;
      to: string;
      replyTo?: string;
      subject: string;
      text: string;
    },
  ): Promise<boolean> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          reply_to: message.replyTo,
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        this.logger.error(`Contact email was rejected with status ${response.status}.`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        'Contact email could not be sent.',
        error instanceof Error ? error.message : undefined,
      );
      return false;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { CreateContactInquiryDto } from './dto/create-contact-inquiry.dto.js';
import { MailerService } from './mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async submit(input: CreateContactInquiryDto): Promise<void> {
    if (input.website) {
      this.logger.warn('Discarded a contact submission that filled the honeypot.');
      return;
    }

    const inquiry = await this.prisma.contactInquiry.create({
      data: {
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        subject: input.subject.trim(),
        message: input.message.trim(),
        societyName: input.societyName?.trim() || null,
        privacyAcknowledged: true,
      },
      select: { id: true },
    });

    try {
      await this.mailer.notifyInquiry({
        id: inquiry.id,
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        subject: input.subject.trim(),
        message: input.message.trim(),
        societyName: input.societyName?.trim() || null,
      });
    } catch (error) {
      this.logger.error(
        `Contact inquiry ${inquiry.id} was stored, but notification failed.`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}

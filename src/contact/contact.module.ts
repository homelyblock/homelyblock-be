import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller.js';
import { ContactService } from './contact.service.js';
import { MailerService } from './mailer.service.js';

@Module({
  controllers: [ContactController],
  providers: [ContactService, MailerService],
})
export class ContactModule {}

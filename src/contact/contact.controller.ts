import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContactService } from './contact.service.js';
import { CreateContactInquiryDto } from './dto/create-contact-inquiry.dto.js';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Store a public contact message. Does not require a sign-in and does not create a society complaint.',
  })
  @ApiOkResponse({ description: 'The message was accepted' })
  async create(@Body() body: CreateContactInquiryDto) {
    await this.contactService.submit(body);
    return { data: { received: true } };
  }
}

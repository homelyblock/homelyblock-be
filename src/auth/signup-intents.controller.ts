import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RecordSignupIntentDto } from './dto/record-signup-intent.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('signup-intents')
@Controller('signup-intents')
export class SignupIntentsController {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Record a registration choice. Requires the server signup-intent key, not a user session.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid signup-intent key' })
  async record(
    @Headers('x-signup-intent-key') provided: string | undefined,
    @Body() body: RecordSignupIntentDto,
  ) {
    const expected = this.configService.get<string>('SIGNUP_INTENT_SECRET')?.trim();
    if (!expected) {
      throw new ServiceUnavailableException({
        message: 'Signup intent storage is not configured',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
    if (!provided || !secretsMatch(provided, expected)) {
      throw new UnauthorizedException({
        message: 'Signup intent key is invalid',
        code: 'UNAUTHORIZED',
      });
    }

    await this.usersService.recordSignupIntent(body);
    return { data: { recorded: true } };
  }
}

function secretsMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

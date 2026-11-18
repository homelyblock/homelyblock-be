import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MembershipRole } from '../../generated/prisma/client.js';

import { INDIAN_PHONE_MESSAGE, INDIAN_PHONE_PATTERN } from '../../common/indian-phone.js';

export class RecordSignupIntentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    enum: [MembershipRole.SOCIETY_ADMIN, MembershipRole.RESIDENT_USER],
  })
  @IsIn([MembershipRole.SOCIETY_ADMIN, MembershipRole.RESIDENT_USER])
  accountType!: MembershipRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  societyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(INDIAN_PHONE_PATTERN, { message: INDIAN_PHONE_MESSAGE })
  phone?: string;
}

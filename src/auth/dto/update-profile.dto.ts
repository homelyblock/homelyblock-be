import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { INDIAN_PHONE_MESSAGE, INDIAN_PHONE_PATTERN } from '../../common/indian-phone.js';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Priya Sharma' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: '+919876543210', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(INDIAN_PHONE_PATTERN, { message: INDIAN_PHONE_MESSAGE })
  phone?: string | null;
}

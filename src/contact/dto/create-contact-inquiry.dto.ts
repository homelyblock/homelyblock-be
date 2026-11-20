import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimToString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function emptyToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class CreateContactInquiryDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trimToString)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ maxLength: 254 })
  @Transform(trimToString)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 3, maxLength: 160 })
  @Transform(trimToString)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  subject!: string;

  @ApiProperty({ minLength: 10, maxLength: 4000 })
  @Transform(trimToString)
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  societyName?: string;

  @ApiProperty({ description: 'Must be true. The sender confirms they have read the privacy policy.' })
  @Transform(({ value }) => value === true)
  @Equals(true)
  privacyAcknowledged!: boolean;

  /**
   * Honeypot. Browsers leave this empty. A filled value is discarded and not stored.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  website?: string;
}

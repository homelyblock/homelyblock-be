import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { INDIAN_PHONE_MESSAGE, INDIAN_PHONE_PATTERN } from '../../common/indian-phone.js';

export class CreateExpectedVisitorDto {
  @ApiProperty({ example: 'Ravi Kumar' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  visitorName!: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  @Matches(INDIAN_PHONE_PATTERN, { message: INDIAN_PHONE_MESSAGE })
  visitorPhone!: string;

  @ApiProperty({ example: 'Family visit' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  purpose!: string;

  @ApiProperty({
    example: '2026-10-31T10:30:00.000Z',
    description: 'Expected visit time (ISO 8601)',
  })
  @IsDateString()
  expectedAt!: string;

  @ApiPropertyOptional({ example: 'MH12AB1234' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehicleNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

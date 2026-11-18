import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { INDIAN_PHONE_MESSAGE, INDIAN_PHONE_PATTERN } from '../../common/indian-phone.js';

export class CreateWalkInVisitorDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId!: string;

  @ApiProperty({ example: 'Suresh Patil' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  visitorName!: string;

  @ApiProperty({ example: '+919811122233' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  @Matches(INDIAN_PHONE_PATTERN, { message: INDIAN_PHONE_MESSAGE })
  visitorPhone!: string;

  @ApiProperty({ example: 'Delivery' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  purpose!: string;

  @ApiPropertyOptional({
    example: '2026-10-30T09:00:00.000Z',
    description: 'Defaults to now when omitted',
  })
  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @ApiPropertyOptional({ example: 'MH14CD5678' })
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

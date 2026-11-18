import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client.js';

export class RecordPaymentDto {
  @ApiProperty({
    example: '8f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f8',
    description:
      'Client-generated idempotency key for this payment attempt. Retries must reuse the same key and payload.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;

  @ApiProperty({ example: '500.00' })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({
    example: '2026-10-30T10:00:00.000Z',
    description: 'Payment date (ISO). Amount timing only; balances use this date for records.',
  })
  @IsDateString()
  paidAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  referenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

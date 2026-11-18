import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ServiceCategory } from '../../generated/prisma/client.js';

import { INDIAN_PHONE_MESSAGE, INDIAN_PHONE_PATTERN } from '../../common/indian-phone.js';

export class CreateServiceDto {
  @ApiProperty({ example: 'Shinde Plumbing Works' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ServiceCategory })
  @IsEnum(ServiceCategory)
  category!: ServiceCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactPerson?: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  @Matches(INDIAN_PHONE_PATTERN, { message: INDIAN_PHONE_MESSAGE })
  phone!: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(INDIAN_PHONE_PATTERN, { message: INDIAN_PHONE_MESSAGE })
  whatsappNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ComplaintCategory,
  ComplaintPriority,
} from '../../generated/prisma/client.js';

export class CreateComplaintDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ enum: ComplaintCategory })
  @IsEnum(ComplaintCategory)
  category!: ComplaintCategory;

  @ApiPropertyOptional({ enum: ComplaintPriority, default: ComplaintPriority.MEDIUM })
  @IsOptional()
  @IsEnum(ComplaintPriority)
  priority?: ComplaintPriority;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SearchUsersQueryDto {
  @ApiProperty({
    description: 'Search by display name or email (minimum 2 characters)',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q!: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for society admins. Name or partial email matches that society only. A full email also matches an account with no membership. Platform owners may omit it for a platform-wide search.',
  })
  @IsOptional()
  @IsUUID()
  societyId?: string;
}

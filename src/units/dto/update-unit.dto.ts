import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UnitStatus } from '../../generated/prisma/client.js';

export class UpdateUnitDto {
  @ApiPropertyOptional({ example: '101' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unitNumber?: string;

  @ApiPropertyOptional({ enum: UnitStatus })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;
}

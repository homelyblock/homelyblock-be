import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UnitStatus } from '../../generated/prisma/client.js';

export class CreateUnitDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  buildingId!: string;

  @ApiProperty({ example: '101' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(32)
  unitNumber!: string;

  @ApiPropertyOptional({ enum: UnitStatus, default: UnitStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;
}

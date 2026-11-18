import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  MaintenanceConfigScope,
  MaintenanceConfigStatus,
} from '../../generated/prisma/client.js';

export class UpdateMaintenanceConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  monthlyAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dueDayOfMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  additionalAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  additionalDescription?: string | null;

  @ApiPropertyOptional({ enum: MaintenanceConfigScope })
  @IsOptional()
  @IsEnum(MaintenanceConfigScope)
  scope?: MaintenanceConfigScope;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  targetBuildingId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  targetUnitId?: string | null;

  @ApiPropertyOptional({ enum: MaintenanceConfigStatus })
  @IsOptional()
  @IsEnum(MaintenanceConfigStatus)
  status?: MaintenanceConfigStatus;
}

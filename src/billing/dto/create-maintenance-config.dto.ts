import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
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

export class CreateMaintenanceConfigDto {
  @ApiProperty({ example: 'Standard monthly maintenance' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: '1500.00', description: 'Decimal string' })
  @IsString()
  @IsNotEmpty()
  monthlyAmount!: string;

  @ApiProperty({ example: 10, description: 'Due day of month (1-28)' })
  @IsInt()
  @Min(1)
  @Max(28)
  dueDayOfMonth!: number;

  @ApiPropertyOptional({ example: '0.00' })
  @IsOptional()
  @IsString()
  additionalAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  additionalDescription?: string;

  @ApiPropertyOptional({
    enum: MaintenanceConfigScope,
    default: MaintenanceConfigScope.SOCIETY,
  })
  @IsOptional()
  @IsEnum(MaintenanceConfigScope)
  scope?: MaintenanceConfigScope;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(
    (dto: CreateMaintenanceConfigDto) =>
      dto.scope === MaintenanceConfigScope.BUILDING ||
      dto.targetBuildingId !== undefined,
  )
  @IsUUID()
  targetBuildingId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(
    (dto: CreateMaintenanceConfigDto) =>
      dto.scope === MaintenanceConfigScope.UNIT ||
      dto.targetUnitId !== undefined,
  )
  @IsUUID()
  targetUnitId?: string;

  @ApiPropertyOptional({
    enum: MaintenanceConfigStatus,
    default: MaintenanceConfigStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(MaintenanceConfigStatus)
  status?: MaintenanceConfigStatus;
}

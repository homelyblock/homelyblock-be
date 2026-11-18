import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  NoticeAudienceType,
  NoticeCategory,
} from '../../generated/prisma/client.js';

export class UpdateNoticeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body?: string;

  @ApiPropertyOptional({ enum: NoticeCategory })
  @IsOptional()
  @IsEnum(NoticeCategory)
  category?: NoticeCategory;

  @ApiPropertyOptional({ enum: NoticeAudienceType })
  @IsOptional()
  @IsEnum(NoticeAudienceType)
  audienceType?: NoticeAudienceType;

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
}

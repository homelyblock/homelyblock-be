import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
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

export class CreateNoticeDto {
  @ApiProperty({ example: 'Water shutdown on Sunday' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Supply will pause from 10am to 2pm.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;

  @ApiPropertyOptional({
    enum: NoticeCategory,
    default: NoticeCategory.GENERAL,
  })
  @IsOptional()
  @IsEnum(NoticeCategory)
  category?: NoticeCategory;

  @ApiPropertyOptional({
    enum: NoticeAudienceType,
    default: NoticeAudienceType.SOCIETY,
  })
  @IsOptional()
  @IsEnum(NoticeAudienceType)
  audienceType?: NoticeAudienceType;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(
    (dto: CreateNoticeDto) =>
      dto.audienceType === NoticeAudienceType.BUILDING ||
      dto.targetBuildingId !== undefined,
  )
  @IsUUID()
  targetBuildingId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(
    (dto: CreateNoticeDto) =>
      dto.audienceType === NoticeAudienceType.UNIT ||
      dto.targetUnitId !== undefined,
  )
  @IsUUID()
  targetUnitId?: string;
}

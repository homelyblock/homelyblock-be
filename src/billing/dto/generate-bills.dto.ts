import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class GenerateBillsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  configId!: string;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear!: number;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @ApiPropertyOptional({
    example: '0.00',
    description: 'Optional discount applied equally to each generated bill',
  })
  @IsOptional()
  @IsString()
  discountAmount?: string;
}

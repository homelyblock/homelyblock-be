import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export class PageQueryDto {
  @ApiPropertyOptional({ default: DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_LIMIT,
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Case-insensitive search text' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export type PageResult<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

export function pageWindow(query: { page?: number; limit?: number }): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = query.page ?? DEFAULT_PAGE;
  const limit = Math.min(query.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
}

export function searchTerm(value?: string): string | undefined {
  const term = value?.trim();
  if (!term) return undefined;
  return term.slice(0, 80);
}

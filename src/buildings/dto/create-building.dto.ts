import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBuildingDto {
  @ApiProperty({ example: 'Wing A' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'A',
    description: 'Short code unique within the society',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code may only contain letters, numbers, _ and -',
  })
  code!: string;
}

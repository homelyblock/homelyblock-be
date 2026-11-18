import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { HouseholdRelationship } from '../../generated/prisma/client.js';

import { INDIAN_PHONE_MESSAGE, INDIAN_PHONE_PATTERN } from '../../common/indian-phone.js';

export class CreateOwnHouseholdMemberDto {
  @ApiProperty({
    description: 'Society whose membership owns this household roster',
  })
  @IsUUID()
  societyId!: string;

  @ApiProperty({ example: 'Aarav Sharma' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: HouseholdRelationship })
  @IsEnum(HouseholdRelationship)
  relationship!: HouseholdRelationship;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(INDIAN_PHONE_PATTERN, { message: INDIAN_PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({ example: 'aarav@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class CreateAdminHouseholdMemberDto {
  @ApiProperty({
    description: 'Target society membership that owns the household',
  })
  @IsUUID()
  membershipId!: string;

  @ApiProperty({ example: 'Aarav Sharma' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: HouseholdRelationship })
  @IsEnum(HouseholdRelationship)
  relationship!: HouseholdRelationship;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(INDIAN_PHONE_PATTERN, { message: INDIAN_PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({ example: 'aarav@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

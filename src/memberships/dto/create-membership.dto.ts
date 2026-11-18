import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';

import {
  MembershipRole,
  MembershipStatus,
} from '../../generated/prisma/client.js';

export class CreateMembershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    enum: [MembershipRole.SOCIETY_ADMIN, MembershipRole.RESIDENT_USER],
    description:
      'Society membership role only; platform roles are not assignable',
  })
  @IsIn([MembershipRole.SOCIETY_ADMIN, MembershipRole.RESIDENT_USER])
  role!: MembershipRole;

  @ApiPropertyOptional({
    enum: [MembershipStatus.INVITED],
    default: MembershipStatus.INVITED,
    description:
      'Only INVITED is accepted. Activate the membership with a later update.',
  })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional primary unit in this society',
  })
  @IsOptional()
  @IsUUID()
  primaryUnitId?: string;
}

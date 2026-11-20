import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import {
  MembershipRole,
  MembershipStatus,
} from '../../generated/prisma/client.js';

export class UpdateMembershipDto {
  @ApiPropertyOptional({
    enum: [MembershipRole.SOCIETY_ADMIN, MembershipRole.RESIDENT_USER],
    description:
      'Society membership role only; platform roles are not assignable',
  })
  @IsOptional()
  @IsIn([MembershipRole.SOCIETY_ADMIN, MembershipRole.RESIDENT_USER])
  role?: MembershipRole;

  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Set null to clear the primary unit',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  primaryUnitId?: string | null;

  @ApiPropertyOptional({
    description:
      'Refresh an expired or removed invitation. Active and suspended memberships cannot be reissued.',
  })
  @IsOptional()
  @IsBoolean()
  reissue?: boolean;
}

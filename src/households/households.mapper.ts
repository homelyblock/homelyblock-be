import type {
  HouseholdMember,
  HouseholdRelationship,
  MembershipRole,
  MembershipStatus,
} from '../generated/prisma/client.js';

export type HouseholdMemberDto = {
  id: string;
  membershipId: string;
  societyId: string;
  name: string;
  relationship: HouseholdRelationship;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HouseholdOccupancyDto = {
  membershipId: string;
  societyId: string;
  userId: string;
  displayName: string;
  email: string | null;
  role: MembershipRole;
  status: MembershipStatus;
  primaryUnitId: string | null;
  primaryUnitNumber: string | null;
  buildingName: string | null;
  activeHouseholdCount: number;
  householdMembers: HouseholdMemberDto[];
};

export function toHouseholdMemberDto(
  row: HouseholdMember,
  societyId: string,
): HouseholdMemberDto {
  return {
    id: row.id,
    membershipId: row.membershipId,
    societyId,
    name: row.name,
    relationship: row.relationship,
    phone: row.phone,
    email: row.email,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

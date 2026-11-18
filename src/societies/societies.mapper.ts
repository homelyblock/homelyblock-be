import type {
  MembershipRole,
  Society,
  SocietyStatus,
} from '../generated/prisma/client.js';

export type SocietyListItemDto = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: SocietyStatus;
  membershipRole: MembershipRole | null;
  createdAt: string;
  updatedAt: string;
};

export type SocietyDetailDto = {
  id: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  status: SocietyStatus;
  membershipRole: MembershipRole | null;
  createdAt: string;
  updatedAt: string;
};

/** Resident-safe detail: no membership PII of other users. */
export type SocietyResidentDetailDto = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: SocietyStatus;
  membershipRole: MembershipRole;
  createdAt: string;
  updatedAt: string;
};

export function toSocietyListItem(
  society: Pick<
    Society,
    'id' | 'name' | 'city' | 'state' | 'status' | 'createdAt' | 'updatedAt'
  >,
  membershipRole: MembershipRole | null = null,
): SocietyListItemDto {
  return {
    id: society.id,
    name: society.name,
    city: society.city,
    state: society.state,
    status: society.status,
    membershipRole,
    createdAt: society.createdAt.toISOString(),
    updatedAt: society.updatedAt.toISOString(),
  };
}

export function toSocietyDetail(
  society: Society,
  membershipRole: MembershipRole | null = null,
): SocietyDetailDto {
  return {
    id: society.id,
    name: society.name,
    addressLine1: society.addressLine1,
    addressLine2: society.addressLine2,
    city: society.city,
    state: society.state,
    postalCode: society.postalCode,
    status: society.status,
    membershipRole,
    createdAt: society.createdAt.toISOString(),
    updatedAt: society.updatedAt.toISOString(),
  };
}

export function toSocietyResidentDetail(
  society: Society,
  membershipRole: MembershipRole,
): SocietyResidentDetailDto {
  return {
    id: society.id,
    name: society.name,
    city: society.city,
    state: society.state,
    status: society.status,
    membershipRole,
    createdAt: society.createdAt.toISOString(),
    updatedAt: society.updatedAt.toISOString(),
  };
}

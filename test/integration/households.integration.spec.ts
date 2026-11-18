import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthorizationService } from '../../src/authorization/authorization.service.js';
import { UsersService } from '../../src/auth/users.service.js';
import { HouseholdsService } from '../../src/households/households.service.js';
import {
  HouseholdRelationship,
  MembershipRole,
  MembershipStatus,
  PrismaClient,
  UnitStatus,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe('Households PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let households: HouseholdsService;
  let users: UsersService;

  const adminId = randomUUID();
  const residentId = randomUUID();
  const otherResidentId = randomUUID();
  const otherAdminId = randomUUID();

  let societyAId = '';
  let societyBId = '';
  let unitAId = '';
  let membershipAId = '';
  let memberId = '';

  const admin = {
    id: adminId,
    displayName: 'Admin Household',
    email: 'admin-hh@example.com',
    platformRole: null,
  };
  const resident = {
    id: residentId,
    displayName: 'Resident Household',
    email: 'resident-hh@example.com',
    platformRole: null,
  };
  const otherResident = {
    id: otherResidentId,
    displayName: 'Other Resident Household',
    email: 'other-resident-hh@example.com',
    platformRole: null,
  };
  const otherAdmin = {
    id: otherAdminId,
    displayName: 'Other Admin Household',
    email: 'other-admin-hh@example.com',
    platformRole: null,
  };

  beforeAll(async () => {
    if (!databaseUrl) return;

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter });
    const prismaService = prisma as unknown as PrismaService;
    const authorization = new AuthorizationService(prismaService);
    households = new HouseholdsService(prismaService, authorization);
    users = new UsersService(prismaService);

    await prisma.householdMember.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();

    await prisma.userProfile.createMany({
      data: [
        { id: adminId, displayName: admin.displayName, email: admin.email },
        {
          id: residentId,
          displayName: resident.displayName,
          email: resident.email,
        },
        {
          id: otherResidentId,
          displayName: otherResident.displayName,
          email: otherResident.email,
        },
        {
          id: otherAdminId,
          displayName: otherAdmin.displayName,
          email: otherAdmin.email,
        },
      ],
    });

    const societyA = await prisma.society.create({
      data: { name: 'Household Society A' },
    });
    const societyB = await prisma.society.create({
      data: { name: 'Household Society B' },
    });
    societyAId = societyA.id;
    societyBId = societyB.id;

    const building = await prisma.building.create({
      data: {
        societyId: societyAId,
        name: 'Tower A',
        code: 'A',
      },
    });
    const unit = await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: building.id,
        unitNumber: '101',
        status: UnitStatus.ACTIVE,
      },
    });
    unitAId = unit.id;

    const membership = await prisma.societyMembership.create({
      data: {
        societyId: societyAId,
        userId: residentId,
        role: MembershipRole.RESIDENT_USER,
        status: MembershipStatus.ACTIVE,
        primaryUnitId: unitAId,
      },
    });
    membershipAId = membership.id;

    await prisma.societyMembership.createMany({
      data: [
        {
          societyId: societyAId,
          userId: adminId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        {
          societyId: societyAId,
          userId: otherResidentId,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: unitAId,
        },
        {
          societyId: societyBId,
          userId: otherAdminId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.householdMember.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.$disconnect();
  });

  it('lets a resident manage own household and blocks cross-household access', async () => {
    const profile = await users.updateOwnProfile(residentId, {
      displayName: 'Resident Household',
      phone: '+919811122233',
    });
    expect(profile.phone).toBe('+919811122233');

    // Profile update must not invent unit or membership changes
    expect(profile.memberships[0]?.primaryUnitId).toBe(unitAId);

    const created = await households.createOwn(resident, {
      societyId: societyAId,
      name: 'Aarav Sharma',
      relationship: HouseholdRelationship.CHILD,
      phone: '+919800000001',
    });
    memberId = created.id;
    expect(created.isActive).toBe(true);

    await expect(
      households.createOwn(resident, {
        societyId: societyAId,
        name: 'aarav sharma',
        relationship: HouseholdRelationship.CHILD,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const list = await households.listOwn(resident, societyAId);
    expect(list.items.some((item) => item.id === memberId)).toBe(true);

    await expect(
      households.listOwn(otherResident, societyAId),
    ).resolves.toMatchObject({ items: [] });

    await expect(
      households.deactivate(otherResident, memberId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await households.deactivate(resident, memberId);
    const after = await households.listOwn(resident, societyAId, true);
    expect(after.items.some((item) => item.id === memberId)).toBe(false);

    const includingInactive = await households.listOwn(
      resident,
      societyAId,
      false,
    );
    expect(includingInactive.items.some((item) => item.id === memberId)).toBe(
      true,
    );
  });

  it('scopes admin directory and unit occupancy; rejects cross-society admin', async () => {
    const reactivated = await households.createOwn(resident, {
      societyId: societyAId,
      name: 'Neha Sharma',
      relationship: HouseholdRelationship.SPOUSE,
    });

    const directory = await households.listSocietyHouseholds(
      admin,
      societyAId,
      { q: 'Resident' },
    );
    expect(directory.total).toBeGreaterThanOrEqual(1);
    const row = directory.items.find((item) => item.membershipId === membershipAId);
    expect(row?.householdMembers.some((m) => m.id === reactivated.id)).toBe(
      true,
    );

    const unitView = await households.getUnitHousehold(
      admin,
      societyAId,
      unitAId,
    );
    expect(unitView.items.length).toBeGreaterThanOrEqual(1);

    await expect(
      households.listSocietyHouseholds(otherAdmin, societyAId, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      households.getUnitHousehold(otherAdmin, societyAId, unitAId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      households.getUnitHousehold(admin, societyAId, randomUUID()),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Multiple memberships: household on society A is not visible via society B
    await expect(
      households.listOwn(resident, societyBId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

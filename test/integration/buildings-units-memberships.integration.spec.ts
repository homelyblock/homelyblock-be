import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { BuildingsService } from '../../src/buildings/buildings.service.js';
import { AuthorizationService } from '../../src/authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  PrismaClient,
  UnitStatus,
} from '../../src/generated/prisma/client.js';
import { MembershipsService } from '../../src/memberships/memberships.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { UnitsService } from '../../src/units/units.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe(
  'Buildings/units/memberships PostgreSQL integration',
  () => {
    let prisma: PrismaClient;
    let buildings: BuildingsService;
    let units: UnitsService;
    let memberships: MembershipsService;

    const ownerId = randomUUID();
    const adminAId = randomUUID();
    const adminBId = randomUUID();
    const residentId = randomUUID();
    const outsiderId = randomUUID();

    let societyAId = '';
    let societyBId = '';
    let buildingAId = '';
    let unitAId = '';

    const owner = {
      id: ownerId,
      displayName: 'Owner',
      email: 'owner-bum@example.com',
      platformRole: PlatformRole.PLATFORM_OWNER,
    };
    const adminA = {
      id: adminAId,
      displayName: 'Admin A',
      email: 'admin-a-bum@example.com',
      platformRole: null,
    };
    const adminB = {
      id: adminBId,
      displayName: 'Admin B',
      email: 'admin-b-bum@example.com',
      platformRole: null,
    };
    const resident = {
      id: residentId,
      displayName: 'Resident',
      email: 'resident-bum@example.com',
      platformRole: null,
    };

    beforeAll(async () => {
      if (!databaseUrl) {
        return;
      }

      execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'inherit',
      });

      const adapter = new PrismaPg({ connectionString: databaseUrl });
      prisma = new PrismaClient({ adapter });
      const prismaService = prisma as unknown as PrismaService;
      const authorization = new AuthorizationService(prismaService);
      buildings = new BuildingsService(prismaService, authorization);
      units = new UnitsService(prismaService, authorization);
      memberships = new MembershipsService(prismaService, authorization);

      await prisma.auditLog.deleteMany();
      await prisma.societyMembership.deleteMany();
      await prisma.unit.deleteMany();
      await prisma.building.deleteMany();
      await prisma.society.deleteMany();
      await prisma.userProfile.deleteMany();

      await prisma.userProfile.createMany({
        data: [
          {
            id: ownerId,
            displayName: 'Owner',
            email: 'owner-bum@example.com',
            platformRole: PlatformRole.PLATFORM_OWNER,
          },
          {
            id: adminAId,
            displayName: 'Admin A',
            email: 'admin-a-bum@example.com',
          },
          {
            id: adminBId,
            displayName: 'Admin B',
            email: 'admin-b-bum@example.com',
          },
          {
            id: residentId,
            displayName: 'Resident',
            email: 'resident-bum@example.com',
          },
          {
            id: outsiderId,
            displayName: 'Outsider',
            email: 'outsider-bum@example.com',
          },
        ],
      });

      const societyA = await prisma.society.create({
        data: { name: 'Society A BUM', city: 'Pune', state: 'MH' },
      });
      const societyB = await prisma.society.create({
        data: { name: 'Society B BUM', city: 'Nashik', state: 'MH' },
      });
      societyAId = societyA.id;
      societyBId = societyB.id;

      await prisma.societyMembership.createMany({
        data: [
          {
            societyId: societyAId,
            userId: adminAId,
            role: MembershipRole.SOCIETY_ADMIN,
            status: MembershipStatus.ACTIVE,
          },
          {
            societyId: societyBId,
            userId: adminBId,
            role: MembershipRole.SOCIETY_ADMIN,
            status: MembershipStatus.ACTIVE,
          },
          {
            societyId: societyAId,
            userId: residentId,
            role: MembershipRole.RESIDENT_USER,
            status: MembershipStatus.ACTIVE,
          },
        ],
      });
    });

    afterAll(async () => {
      if (!prisma) {
        return;
      }
      await prisma.auditLog.deleteMany();
      await prisma.societyMembership.deleteMany();
      await prisma.unit.deleteMany();
      await prisma.building.deleteMany();
      await prisma.society.deleteMany();
      await prisma.userProfile.deleteMany();
      await prisma.$disconnect();
    });

    it('creates buildings uniquely within a society', async () => {
      const building = await buildings.create(adminA, societyAId, {
        name: 'Wing A',
        code: 'a',
      });
      buildingAId = building.id;
      expect(building.code).toBe('A');

      await expect(
        buildings.create(adminA, societyAId, { name: 'Wing A2', code: 'A' }),
      ).rejects.toBeInstanceOf(ConflictException);

      // Same code allowed in another society
      await expect(
        buildings.create(adminB, societyBId, { name: 'Wing A', code: 'A' }),
      ).resolves.toMatchObject({ code: 'A' });
    });

    it('denies cross-society building administration', async () => {
      await expect(
        buildings.create(adminB, societyAId, { name: 'Hack', code: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await expect(
        buildings.getById(adminB, societyAId, buildingAId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates units under a valid building and rejects foreign buildings', async () => {
      const unit = await units.create(adminA, societyAId, {
        buildingId: buildingAId,
        unitNumber: '101',
      });
      unitAId = unit.id;
      expect(unit.status).toBe(UnitStatus.ACTIVE);

      await expect(
        units.create(adminA, societyAId, {
          buildingId: buildingAId,
          unitNumber: '101',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      const buildingB = await prisma.building.findFirst({
        where: { societyId: societyBId, code: 'A' },
      });
      expect(buildingB).toBeTruthy();

      await expect(
        units.create(adminA, societyAId, {
          buildingId: buildingB!.id,
          unitNumber: '202',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('prevents residents from mutating units', async () => {
      await expect(
        units.create(resident, societyAId, {
          buildingId: buildingAId,
          unitNumber: '303',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('associates existing users and rejects duplicates / bad units / missing users', async () => {
      const membership = await memberships.create(adminA, societyAId, {
        userId: outsiderId,
        role: MembershipRole.RESIDENT_USER,
        status: MembershipStatus.INVITED,
        primaryUnitId: unitAId,
      });
      expect(membership.primaryUnitId).toBe(unitAId);

      await expect(
        memberships.create(adminA, societyAId, {
          userId: outsiderId,
          role: MembershipRole.RESIDENT_USER,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      await expect(
        memberships.create(adminA, societyAId, {
          userId: randomUUID(),
          role: MembershipRole.RESIDENT_USER,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const unitB = await prisma.unit.create({
        data: {
          societyId: societyBId,
          buildingId: (
            await prisma.building.findFirstOrThrow({
              where: { societyId: societyBId },
            })
          ).id,
          unitNumber: '501',
        },
      });

      await expect(
        memberships.update(adminA, membership.id, {
          primaryUnitId: unitB.id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const updated = await memberships.update(adminA, membership.id, {
        status: MembershipStatus.ACTIVE,
      });
      expect(updated.status).toBe(MembershipStatus.ACTIVE);
    });

    it('denies membership changes across societies', async () => {
      const membership = await prisma.societyMembership.findFirstOrThrow({
        where: { societyId: societyAId, userId: outsiderId },
      });

      await expect(
        memberships.update(adminB, membership.id, {
          status: MembershipStatus.SUSPENDED,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns not found for buildings outside society scope', async () => {
      await expect(
        buildings.getById(owner, societyBId, buildingAId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  },
);

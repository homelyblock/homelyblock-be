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
import { AuthorizationService } from '../../src/authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  PrismaClient,
  VisitorEntryType,
  VisitorStatus,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { VisitorsService } from '../../src/visitors/visitors.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe('Visitors PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let visitors: VisitorsService;

  const adminAId = randomUUID();
  const adminBId = randomUUID();
  const residentAId = randomUUID();
  const residentA2Id = randomUUID();

  let societyAId = '';
  let societyBId = '';
  let buildingAId = '';
  let unitA1Id = '';
  let unitA2Id = '';
  let unitBId = '';

  const adminA = {
    id: adminAId,
    displayName: 'Admin A',
    email: 'admin-a-visitors@example.com',
    platformRole: null,
  };
  const adminB = {
    id: adminBId,
    displayName: 'Admin B',
    email: 'admin-b-visitors@example.com',
    platformRole: null,
  };
  const residentA = {
    id: residentAId,
    displayName: 'Resident A',
    email: 'resident-a-visitors@example.com',
    platformRole: null,
  };
  const residentA2 = {
    id: residentA2Id,
    displayName: 'Resident A2',
    email: 'resident-a2-visitors@example.com',
    platformRole: null,
  };

  const futureIso = () => new Date(Date.now() + 3_600_000).toISOString();

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
    visitors = new VisitorsService(
      prismaService,
      new AuthorizationService(prismaService),
    );

    await prisma.visitor.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();

    await prisma.userProfile.createMany({
      data: [
        {
          id: adminAId,
          displayName: 'Admin A',
          email: 'admin-a-visitors@example.com',
        },
        {
          id: adminBId,
          displayName: 'Admin B',
          email: 'admin-b-visitors@example.com',
        },
        {
          id: residentAId,
          displayName: 'Resident A',
          email: 'resident-a-visitors@example.com',
        },
        {
          id: residentA2Id,
          displayName: 'Resident A2',
          email: 'resident-a2-visitors@example.com',
        },
        {
          id: randomUUID(),
          displayName: 'Owner',
          email: 'owner-visitors@example.com',
          platformRole: PlatformRole.PLATFORM_OWNER,
        },
      ],
    });

    const societyA = await prisma.society.create({
      data: { name: 'Society A Visitors', city: 'Pune', state: 'MH' },
    });
    const societyB = await prisma.society.create({
      data: { name: 'Society B Visitors', city: 'Nashik', state: 'MH' },
    });
    societyAId = societyA.id;
    societyBId = societyB.id;

    const buildingA = await prisma.building.create({
      data: { societyId: societyAId, name: 'Wing A', code: 'A' },
    });
    const buildingB = await prisma.building.create({
      data: { societyId: societyBId, name: 'Wing B', code: 'B' },
    });
    buildingAId = buildingA.id;

    const unitA1 = await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: buildingAId,
        unitNumber: '101',
      },
    });
    const unitA2 = await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: buildingAId,
        unitNumber: '102',
      },
    });
    const unitB = await prisma.unit.create({
      data: {
        societyId: societyBId,
        buildingId: buildingB.id,
        unitNumber: '201',
      },
    });
    unitA1Id = unitA1.id;
    unitA2Id = unitA2.id;
    unitBId = unitB.id;

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
          userId: residentAId,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: unitA1Id,
        },
        {
          societyId: societyAId,
          userId: residentA2Id,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: unitA2Id,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.visitor.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.$disconnect();
  });

  it('registers expected visitors and enforces unit-scoped approval', async () => {
    const created = await visitors.createExpected(residentA, societyAId, {
      visitorName: 'Guest One',
      visitorPhone: '+919876543210',
      purpose: 'Family',
      expectedAt: futureIso(),
    });
    expect(created.entryType).toBe(VisitorEntryType.EXPECTED);
    expect(created.status).toBe(VisitorStatus.PENDING);
    expect(created.unitId).toBe(unitA1Id);

    await expect(
      visitors.approve(residentA2, created.id),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const approved = await visitors.approve(residentA, created.id);
    expect(approved.status).toBe(VisitorStatus.APPROVED);
    expect(approved.decisionByUserId).toBe(residentAId);
  });

  it('registers walk-ins as pending and denies cross-society admin ops', async () => {
    const walkIn = await visitors.createWalkIn(adminA, societyAId, {
      unitId: unitA1Id,
      visitorName: 'Courier',
      visitorPhone: '+919811122233',
      purpose: 'Delivery',
    });
    expect(walkIn.status).toBe(VisitorStatus.PENDING);

    await expect(
      visitors.createWalkIn(adminB, societyAId, {
        unitId: unitA1Id,
        visitorName: 'Hack',
        visitorPhone: '+919800011122',
        purpose: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      visitors.createWalkIn(adminA, societyAId, {
        unitId: unitBId,
        visitorName: 'Bad unit',
        visitorPhone: '+919800011122',
        purpose: 'Nope',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents duplicate check-in/out and invalid transitions', async () => {
    const created = await visitors.createExpected(residentA, societyAId, {
      visitorName: 'Guest Two',
      visitorPhone: '+919700011122',
      purpose: 'Visit',
      expectedAt: futureIso(),
    });
    await visitors.approve(residentA, created.id);

    const checkedIn = await visitors.checkIn(adminA, created.id);
    expect(checkedIn.status).toBe(VisitorStatus.CHECKED_IN);
    expect(checkedIn.checkedInAt).toBeTruthy();

    await expect(visitors.checkIn(adminA, created.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const checkedOut = await visitors.checkOut(adminA, created.id);
    expect(checkedOut.status).toBe(VisitorStatus.CHECKED_OUT);
    expect(checkedOut.checkedOutAt).toBeTruthy();

    await expect(visitors.checkOut(adminA, created.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('hides other-unit visitors and supports cancel + list privacy masking', async () => {
    const created = await visitors.createExpected(residentA, societyAId, {
      visitorName: 'Private Guest',
      visitorPhone: '+919955566677',
      purpose: 'Visit',
      expectedAt: futureIso(),
    });

    await expect(
      visitors.getById(residentA2, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const cancelled = await visitors.cancel(residentA, created.id);
    expect(cancelled.status).toBe(VisitorStatus.CANCELLED);

    const list = await visitors.list(adminA, societyAId, {
      page: 1,
      limit: 50,
      status: VisitorStatus.CANCELLED,
    });
    const item = list.items.find((row) => row.id === created.id);
    expect(item?.visitorPhone).toContain('6677');
    expect(item?.visitorPhone).not.toBe('+919955566677');
  });

  it('rejects check-in for rejected visitors', async () => {
    const created = await visitors.createWalkIn(adminA, societyAId, {
      unitId: unitA1Id,
      visitorName: 'Rejected Guest',
      visitorPhone: '+919933344455',
      purpose: 'Visit',
      expectedAt: futureIso(),
    });
    await visitors.reject(residentA, created.id);

    await expect(visitors.checkIn(adminA, created.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AuthorizationService } from '../../src/authorization/authorization.service.js';
import { ServiceDirectoryService } from '../../src/service-directory/service-directory.service.js';
import {
  MembershipRole,
  MembershipStatus,
  PrismaClient,
  ServiceCategory,
  UnitStatus,
} from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe('Service directory PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let services: ServiceDirectoryService;

  const adminId = randomUUID();
  const residentId = randomUUID();
  const otherAdminId = randomUUID();

  let societyAId = '';
  let societyBId = '';
  let providerId = '';

  const admin = {
    id: adminId,
    displayName: 'Admin Services',
    email: 'admin-services@example.com',
    platformRole: null,
  };
  const resident = {
    id: residentId,
    displayName: 'Resident Services',
    email: 'resident-services@example.com',
    platformRole: null,
  };
  const otherAdmin = {
    id: otherAdminId,
    displayName: 'Other Admin Services',
    email: 'other-admin-services@example.com',
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
    services = new ServiceDirectoryService(
      prismaService,
      new AuthorizationService(prismaService),
    );

    await prisma.serviceProvider.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();

    await prisma.userProfile.createMany({
      data: [
        {
          id: adminId,
          displayName: 'Admin Services',
          email: 'admin-services@example.com',
        },
        {
          id: residentId,
          displayName: 'Resident Services',
          email: 'resident-services@example.com',
        },
        {
          id: otherAdminId,
          displayName: 'Other Admin Services',
          email: 'other-admin-services@example.com',
        },
      ],
    });

    const societyA = await prisma.society.create({
      data: { name: 'Society A Services', city: 'Pune', state: 'MH' },
    });
    const societyB = await prisma.society.create({
      data: { name: 'Society B Services', city: 'Nashik', state: 'MH' },
    });
    societyAId = societyA.id;
    societyBId = societyB.id;

    const building = await prisma.building.create({
      data: { societyId: societyAId, name: 'Wing A', code: 'A' },
    });
    const unit = await prisma.unit.create({
      data: {
        societyId: societyAId,
        buildingId: building.id,
        unitNumber: '101',
        status: UnitStatus.ACTIVE,
      },
    });

    await prisma.societyMembership.createMany({
      data: [
        {
          societyId: societyAId,
          userId: adminId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        {
          societyId: societyBId,
          userId: otherAdminId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: MembershipStatus.ACTIVE,
        },
        {
          societyId: societyAId,
          userId: residentId,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
          primaryUnitId: unit.id,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.serviceProvider.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.$disconnect();
  });

  it('lets admins create providers and residents see only active ones', async () => {
    const created = await services.create(admin, societyAId, {
      name: 'Shinde Plumbing',
      category: ServiceCategory.PLUMBING,
      phone: '+919876543210',
      whatsappNumber: '+919876543210',
      description: 'Emergency plumbing',
    });
    providerId = created.id;
    expect(created.isActive).toBe(true);

    await expect(
      services.create(resident, societyAId, {
        name: 'Resident Provider',
        category: ServiceCategory.OTHER,
        phone: '+919800011122',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const residentList = await services.list(resident, societyAId, {});
    expect(residentList.items.some((item) => item.id === providerId)).toBe(true);

    await services.deactivate(admin, providerId);
    const afterDeactivate = await services.list(resident, societyAId, {});
    expect(afterDeactivate.items.some((item) => item.id === providerId)).toBe(
      false,
    );

    const adminList = await services.list(admin, societyAId, { active: false });
    expect(adminList.items.some((item) => item.id === providerId)).toBe(true);

    await expect(services.get(resident, providerId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('blocks cross-society admin mutations and resident edits', async () => {
    await expect(
      services.update(otherAdmin, providerId, { name: 'Hijacked' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      services.activate(resident, providerId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      services.deactivate(resident, providerId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(services.get(otherAdmin, providerId)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const activated = await services.activate(admin, providerId);
    expect(activated.isActive).toBe(true);

    const filtered = await services.list(admin, societyAId, {
      category: ServiceCategory.PLUMBING,
      q: 'Shinde',
    });
    expect(filtered.items).toHaveLength(1);
  });
});

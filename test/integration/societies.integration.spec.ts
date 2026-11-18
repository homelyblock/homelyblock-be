import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  PrismaClient,
  SocietyStatus,
} from '../../src/generated/prisma/client.js';
import { SocietiesService } from '../../src/societies/societies.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe('Societies PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let service: SocietiesService;

  const ownerId = randomUUID();
  const adminId = randomUUID();
  const residentId = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) {
      return;
    }

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    });

    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter });
    service = new SocietiesService(prisma);

    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();

    await prisma.userProfile.createMany({
      data: [
        {
          id: ownerId,
          displayName: 'Platform Owner',
          email: 'owner@example.com',
          platformRole: PlatformRole.PLATFORM_OWNER,
        },
        {
          id: adminId,
          displayName: 'Society Admin',
          email: 'admin@example.com',
        },
        {
          id: residentId,
          displayName: 'Resident User',
          email: 'resident@example.com',
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
    await prisma.society.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.$disconnect();
  });

  it('creates a society and ACTIVE SOCIETY_ADMIN membership transactionally', async () => {
    const result = await service.create(
      {
        id: ownerId,
        displayName: 'Platform Owner',
        email: 'owner@example.com',
        platformRole: PlatformRole.PLATFORM_OWNER,
      },
      {
        name: 'Integration Society',
        city: 'Pune',
        state: 'MH',
        initialAdminUserId: adminId,
      },
    );

    expect(result.society.status).toBe(SocietyStatus.ACTIVE);
    expect(result.initialAdminMembership).toMatchObject({
      userId: adminId,
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
    });

    const membership = await prisma.societyMembership.findUnique({
      where: {
        societyId_userId: {
          societyId: result.society.id,
          userId: adminId,
        },
      },
    });
    expect(membership).not.toBeNull();
  });

  it('rejects a nonexistent initial admin before writing a society', async () => {
    const before = await prisma.society.count();
    await expect(
      service.create(
        {
          id: ownerId,
          displayName: 'Platform Owner',
          platformRole: PlatformRole.PLATFORM_OWNER,
        },
        {
          name: 'Should Not Persist',
          initialAdminUserId: randomUUID(),
        },
      ),
    ).rejects.toThrow(/Initial society admin user was not found/);
    await expect(prisma.society.count()).resolves.toBe(before);
  });

  it('enforces unique society memberships', async () => {
    const society = await prisma.society.create({
      data: { name: 'Unique Membership Society' },
    });
    await prisma.societyMembership.create({
      data: {
        societyId: society.id,
        userId: adminId,
        role: MembershipRole.SOCIETY_ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    await expect(
      prisma.societyMembership.create({
        data: {
          societyId: society.id,
          userId: adminId,
          role: MembershipRole.RESIDENT_USER,
          status: MembershipStatus.ACTIVE,
        },
      }),
    ).rejects.toThrow();
  });

  it('hides cross-society access and allows admin updates only in scope', async () => {
    const societyA = await service.create(
      {
        id: ownerId,
        displayName: 'Platform Owner',
        platformRole: PlatformRole.PLATFORM_OWNER,
      },
      {
        name: 'Society A Access',
        initialAdminUserId: adminId,
      },
    );
    const societyB = await prisma.society.create({
      data: { name: 'Society B Access' },
    });

    await expect(
      service.getById(
        {
          id: adminId,
          displayName: 'Society Admin',
          platformRole: null,
        },
        societyB.id,
      ),
    ).rejects.toThrow(/Society not found/);

    await expect(
      service.update(
        {
          id: adminId,
          displayName: 'Society Admin',
          platformRole: null,
        },
        societyB.id,
        { name: 'Hijacked' },
      ),
    ).rejects.toThrow(/permission/);

    const updated = await service.update(
      {
        id: adminId,
        displayName: 'Society Admin',
        platformRole: null,
      },
      societyA.society.id,
      { city: 'Nagpur' },
    );
    expect(updated.city).toBe('Nagpur');

    await expect(
      service.update(
        {
          id: residentId,
          displayName: 'Resident User',
          platformRole: null,
        },
        societyA.society.id,
        { city: 'Denied' },
      ),
    ).rejects.toThrow(/permission/);
  });
});

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AccountType,
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  PrismaClient,
} from '../../src/generated/prisma/client.js';
import { UsersService } from '../../src/auth/users.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { requireIntegrationDatabaseUrl } from './safe-test-database.js';

const databaseUrl = requireIntegrationDatabaseUrl();

describe('Onboarding PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let service: UsersService;

  const ownerId = randomUUID();
  const adminId = randomUUID();
  const residentId = randomUUID();
  const incompleteAdminId = randomUUID();
  const missingIntentId = randomUUID();
  const completedId = randomUUID();

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
    service = new UsersService(prisma as unknown as PrismaService);

    await prisma.auditLog.deleteMany();
    await prisma.societyMembership.deleteMany();
    await prisma.society.deleteMany();
    await prisma.signupIntent.deleteMany();
    await prisma.userProfile.deleteMany();

    await prisma.userProfile.createMany({
      data: [
        {
          id: ownerId,
          displayName: 'Platform Owner',
          email: `owner-${ownerId}@example.com`,
          platformRole: PlatformRole.PLATFORM_OWNER,
        },
        {
          id: adminId,
          displayName: 'New Admin',
          email: `admin-${adminId}@example.com`,
        },
        {
          id: residentId,
          displayName: 'New Resident',
          email: `resident-${residentId}@example.com`,
        },
        {
          id: incompleteAdminId,
          displayName: 'Incomplete Admin',
          email: `incomplete-${incompleteAdminId}@example.com`,
        },
        {
          id: missingIntentId,
          displayName: 'Missing Intent',
          email: `missing-${missingIntentId}@example.com`,
        },
        {
          id: completedId,
          displayName: 'Completed Resident',
          email: `completed-${completedId}@example.com`,
          accountType: AccountType.RESIDENT_USER,
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
    await prisma.signupIntent.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.$disconnect();
  });

  it('keeps a resident a resident when society fields are offered at signup', async () => {
    await service.recordSignupIntent({
      userId: residentId,
      accountType: MembershipRole.RESIDENT_USER,
      societyName: 'Should Not Exist',
      city: 'Pune',
      phone: '+919800011122',
    });
    await expect(
      service.recordSignupIntent({
        userId: residentId,
        accountType: MembershipRole.SOCIETY_ADMIN,
        societyName: 'Upgrade Attempt',
        city: 'Pune',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const profile = await service.completeOnboarding(residentId);

    expect(profile.accountType).toBe(AccountType.RESIDENT_USER);
    expect(profile.platformRole).toBeNull();
    expect(profile.memberships).toHaveLength(0);
    expect(profile.phone).toBe('+919800011122');
    const intent = await prisma.signupIntent.findUniqueOrThrow({
      where: { userId: residentId },
    });
    expect(intent.accountType).toBe(AccountType.RESIDENT_USER);
    expect(intent.societyName).toBeNull();
    expect(intent.consumedAt).not.toBeNull();
    await expect(prisma.society.count()).resolves.toBe(0);
  });

  it('does not create a society when onboarding is repeated or forged later', async () => {
    await expect(service.completeOnboarding(residentId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(prisma.society.count()).resolves.toBe(0);
  });

  it('creates one society for the original society administrator', async () => {
    const intent = {
      userId: adminId,
      accountType: MembershipRole.SOCIETY_ADMIN,
      societyName: 'Palm Court',
      city: 'Pune',
      state: 'Maharashtra',
    };
    await service.recordSignupIntent(intent);
    await service.recordSignupIntent(intent);

    const profile = await service.completeOnboarding(adminId);
    await expect(service.completeOnboarding(adminId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(profile.accountType).toBe(AccountType.SOCIETY_ADMIN);
    expect(profile.memberships).toHaveLength(1);
    expect(profile.memberships[0]).toMatchObject({
      role: MembershipRole.SOCIETY_ADMIN,
      status: MembershipStatus.ACTIVE,
      society: { name: 'Palm Court' },
    });
    await expect(
      prisma.society.count({ where: { name: 'Palm Court' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.societyMembership.count({ where: { userId: adminId } }),
    ).resolves.toBe(1);
  });

  it('refuses platform owner provisioning', async () => {
    await expect(
      service.recordSignupIntent({
        userId: ownerId,
        accountType: MembershipRole.SOCIETY_ADMIN,
        societyName: 'Owner Society',
        city: 'Mumbai',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.recordSignupIntent({
        userId: incompleteAdminId,
        accountType: 'PLATFORM_OWNER' as MembershipRole,
        societyName: 'Nope',
        city: 'Pune',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await prisma.signupIntent.create({
      data: {
        userId: ownerId,
        accountType: AccountType.SOCIETY_ADMIN,
        societyName: 'Owner Society',
        city: 'Mumbai',
      },
    });
    await expect(service.completeOnboarding(ownerId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const intent = await prisma.signupIntent.findUniqueOrThrow({
      where: { userId: ownerId },
    });
    expect(intent.consumedAt).toBeNull();
    const owner = await prisma.userProfile.findUniqueOrThrow({
      where: { id: ownerId },
    });
    expect(owner.platformRole).toBe(PlatformRole.PLATFORM_OWNER);
    expect(owner.accountType).toBeNull();
    await expect(
      prisma.society.count({ where: { name: 'Owner Society' } }),
    ).resolves.toBe(0);
  });

  it('rejects a missing intent and incomplete administrator details', async () => {
    await expect(
      service.completeOnboarding(missingIntentId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.recordSignupIntent({
        userId: incompleteAdminId,
        accountType: MembershipRole.SOCIETY_ADMIN,
        societyName: 'P',
        city: 'Pune',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const missing = await prisma.userProfile.findUniqueOrThrow({
      where: { id: missingIntentId },
    });
    const incomplete = await prisma.userProfile.findUniqueOrThrow({
      where: { id: incompleteAdminId },
    });
    expect(missing.accountType).toBeNull();
    expect(incomplete.accountType).toBeNull();
    await expect(
      prisma.signupIntent.findUnique({ where: { userId: incompleteAdminId } }),
    ).resolves.toBeNull();
  });

  it('leaves an already onboarded account unchanged', async () => {
    await expect(
      service.recordSignupIntent({
        userId: completedId,
        accountType: MembershipRole.SOCIETY_ADMIN,
        societyName: 'Second Society',
        city: 'Pune',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.completeOnboarding(completedId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const profile = await prisma.userProfile.findUniqueOrThrow({
      where: { id: completedId },
    });
    expect(profile.accountType).toBe(AccountType.RESIDENT_USER);
    await expect(
      prisma.society.count({ where: { name: 'Second Society' } }),
    ).resolves.toBe(0);
    await expect(
      prisma.signupIntent.findUnique({ where: { userId: completedId } }),
    ).resolves.toBeNull();
  });
});

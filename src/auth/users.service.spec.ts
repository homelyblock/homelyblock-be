import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MembershipRole,
  PlatformRole,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService profile update', () => {
  const update = vi.fn();
  const auditCreate = vi.fn();
  const findUniqueOrThrow = vi.fn();
  const transaction = vi.fn();

  let service: UsersService;

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    update.mockReset();
    auditCreate.mockReset();
    findUniqueOrThrow.mockReset();
    transaction.mockReset();
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        userProfile: { update },
        auditLog: { create: auditCreate },
      }),
    );

    service = new UsersService({
      userProfile: { findUniqueOrThrow, update },
      auditLog: { create: auditCreate },
      $transaction: transaction,
    } as unknown as PrismaService);
  });

  it('updates displayName and phone for the authenticated user', async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: userId,
      displayName: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+919800011122',
      platformRole: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      memberships: [],
    });

    const result = await service.updateOwnProfile(userId, {
      displayName: 'Priya Sharma',
      phone: '+91 98000-11122',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: userId },
      data: {
        displayName: 'Priya Sharma',
        phone: '+919800011122',
      },
    });
    expect(auditCreate).toHaveBeenCalled();
    expect(result.displayName).toBe('Priya Sharma');
  });

  it('rejects empty update payloads', async () => {
    await expect(service.updateOwnProfile(userId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('never writes email or platformRole through updateOwnProfile', async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: userId,
      displayName: 'Priya',
      email: 'priya@example.com',
      phone: null,
      platformRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      memberships: [],
    });

    await service.updateOwnProfile(userId, { displayName: 'Priya' });
    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('platformRole');
    expect(data).not.toHaveProperty('accountType');
  });
});

describe('UsersService onboarding', () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const profileFind = vi.fn();
  const intentFind = vi.fn();
  const intentCreate = vi.fn();
  const findUniqueOrThrow = vi.fn();
  const profileUpdateMany = vi.fn();
  const intentUpdateMany = vi.fn();
  const societyCreate = vi.fn();
  const membershipCreate = vi.fn();
  const auditCreate = vi.fn();
  const transaction = vi.fn();

  let service: UsersService;

  beforeEach(() => {
    profileFind.mockReset();
    intentFind.mockReset();
    intentCreate.mockReset();
    findUniqueOrThrow.mockReset();
    profileUpdateMany.mockReset();
    intentUpdateMany.mockReset();
    societyCreate.mockReset();
    membershipCreate.mockReset();
    auditCreate.mockReset();
    transaction.mockReset();
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        userProfile: { updateMany: profileUpdateMany },
        signupIntent: { updateMany: intentUpdateMany },
        society: { create: societyCreate },
        societyMembership: { create: membershipCreate },
        auditLog: { create: auditCreate },
      }),
    );
    profileUpdateMany.mockResolvedValue({ count: 1 });
    intentUpdateMany.mockResolvedValue({ count: 1 });
    intentCreate.mockResolvedValue({ userId });
    societyCreate.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' });
    findUniqueOrThrow.mockResolvedValue({
      id: userId,
      displayName: 'Asha Rao',
      email: 'asha@example.com',
      phone: null,
      platformRole: null,
      accountType: MembershipRole.RESIDENT_USER,
      createdAt: new Date('2026-11-18T00:00:00.000Z'),
      updatedAt: new Date('2026-11-18T00:00:00.000Z'),
      memberships: [],
    });

    service = new UsersService({
      userProfile: { findUnique: profileFind, findUniqueOrThrow },
      signupIntent: {
        findUnique: intentFind,
        create: intentCreate,
        updateMany: intentUpdateMany,
      },
      society: { create: societyCreate },
      societyMembership: { create: membershipCreate },
      auditLog: { create: auditCreate },
      $transaction: transaction,
    } as unknown as PrismaService);
  });

  function openProfile() {
    profileFind.mockResolvedValue({
      id: userId,
      platformRole: null,
      accountType: null,
    });
  }

  it('stores a resident choice and ignores society fields offered with it', async () => {
    profileFind.mockResolvedValue(null);

    await service.recordSignupIntent({
      userId,
      accountType: MembershipRole.RESIDENT_USER,
      societyName: 'Should not be stored',
      city: 'Pune',
      state: 'Maharashtra',
      phone: '+91 98000 11122',
    });

    expect(intentCreate).toHaveBeenCalledWith({
      data: {
        userId,
        accountType: MembershipRole.RESIDENT_USER,
        societyName: null,
        city: null,
        state: null,
        phone: '+919800011122',
      },
    });
  });

  it('does not replace a recorded resident choice with a society administrator', async () => {
    profileFind.mockResolvedValue(null);
    intentFind.mockResolvedValue({
      accountType: MembershipRole.RESIDENT_USER,
      societyName: null,
      city: null,
      state: null,
      phone: null,
      consumedAt: null,
    });

    await expect(
      service.recordSignupIntent({
        userId,
        accountType: MembershipRole.SOCIETY_ADMIN,
        societyName: 'Palm Court',
        city: 'Pune',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(intentCreate).not.toHaveBeenCalled();
  });

  it('applies a resident intent without creating a society', async () => {
    openProfile();
    intentFind.mockResolvedValue({
      accountType: MembershipRole.RESIDENT_USER,
      societyName: null,
      city: null,
      state: null,
      phone: '+91 98000 11122',
      consumedAt: null,
    });

    await service.completeOnboarding(userId);

    expect(societyCreate).not.toHaveBeenCalled();
    expect(membershipCreate).not.toHaveBeenCalled();
    expect(profileUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: userId, accountType: null, platformRole: null },
        data: expect.objectContaining({
          accountType: MembershipRole.RESIDENT_USER,
          phone: '+919800011122',
        }),
      }),
    );
    expect(intentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId,
          accountType: MembershipRole.RESIDENT_USER,
          consumedAt: null,
        },
      }),
    );
  });

  it('creates one society from the stored administrator intent', async () => {
    openProfile();
    intentFind.mockResolvedValue({
      accountType: MembershipRole.SOCIETY_ADMIN,
      societyName: 'Palm Court',
      city: 'Pune',
      state: 'Maharashtra',
      phone: null,
      consumedAt: null,
    });

    await service.completeOnboarding(userId);

    expect(societyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Palm Court', city: 'Pune' }),
      }),
    );
    expect(membershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          role: MembershipRole.SOCIETY_ADMIN,
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('rejects platform owner selection, owner accounts, and a missing intent', async () => {
    profileFind.mockResolvedValue(null);
    await expect(
      service.recordSignupIntent({
        userId,
        accountType: 'PLATFORM_OWNER' as MembershipRole,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(intentCreate).not.toHaveBeenCalled();

    profileFind.mockResolvedValue({
      id: userId,
      platformRole: PlatformRole.PLATFORM_OWNER,
      accountType: null,
    });
    await expect(service.completeOnboarding(userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction).not.toHaveBeenCalled();

    openProfile();
    intentFind.mockResolvedValue(null);
    await expect(service.completeOnboarding(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a completed account, a lost claim, and a consumed intent', async () => {
    profileFind.mockResolvedValue({
      id: userId,
      platformRole: null,
      accountType: MembershipRole.RESIDENT_USER,
    });
    await expect(service.completeOnboarding(userId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(societyCreate).not.toHaveBeenCalled();

    openProfile();
    intentFind.mockResolvedValue({
      accountType: MembershipRole.RESIDENT_USER,
      societyName: null,
      city: null,
      state: null,
      phone: null,
      consumedAt: null,
    });
    profileUpdateMany.mockResolvedValue({ count: 0 });
    await expect(service.completeOnboarding(userId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(societyCreate).not.toHaveBeenCalled();

    profileUpdateMany.mockResolvedValue({ count: 1 });
    intentUpdateMany.mockResolvedValue({ count: 0 });
    await expect(service.completeOnboarding(userId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(societyCreate).not.toHaveBeenCalled();
    intentUpdateMany.mockResolvedValue({ count: 1 });

    profileUpdateMany.mockResolvedValue({ count: 1 });
    intentFind.mockResolvedValue({
      accountType: MembershipRole.SOCIETY_ADMIN,
      societyName: 'Palm Court',
      city: 'Pune',
      state: null,
      phone: null,
      consumedAt: new Date(),
    });
    await expect(service.completeOnboarding(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(societyCreate).not.toHaveBeenCalled();
  });

  it('requires society name and city before recording an administrator', async () => {
    profileFind.mockResolvedValue(null);
    await expect(
      service.recordSignupIntent({
        userId,
        accountType: MembershipRole.SOCIETY_ADMIN,
        societyName: 'P',
        city: 'Pune',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(intentCreate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('UsersService.ensureProfile', () => {
  const findUnique = vi.fn();
  const findFirst = vi.fn();
  const update = vi.fn();
  const create = vi.fn();
  let service: UsersService;

  const stored = {
    id: '33333333-3333-4333-8333-333333333333',
    displayName: 'Anita Desai',
    email: 'anita@example.com',
    platformRole: null,
  };

  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
    update.mockReset();
    create.mockReset();
    service = new UsersService({
      userProfile: { findUnique, findFirst, update, create },
    } as unknown as PrismaService);
  });

  it('returns the existing profile when the verified email belongs to an older auth id', async () => {
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(stored);

    const result = await service.ensureProfile({
      sub: '44444444-4444-4444-8444-444444444444',
      email: 'Anita@example.com',
      emailVerified: true,
      displayName: 'Anita Desai',
    });

    expect(result.id).toBe(stored.id);
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps the current profile when another profile already owns the new email', async () => {
    findUnique.mockResolvedValue({ ...stored, email: 'old@example.com' });
    findFirst.mockResolvedValue({ id: 'other' });

    const result = await service.ensureProfile({
      sub: stored.id,
      email: 'anita@example.com',
      emailVerified: true,
      displayName: 'Anita Desai',
    });

    expect(result.email).toBe('old@example.com');
    expect(update).not.toHaveBeenCalled();
  });

  it('does not adopt another profile when the email is not verified', async () => {
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(stored);

    await expect(
      service.ensureProfile({
        sub: '44444444-4444-4444-8444-444444444444',
        email: 'anita@example.com',
        emailVerified: false,
        displayName: 'Anita Desai',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });
});

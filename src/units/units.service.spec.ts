import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { Prisma, UnitStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UnitsService } from './units.service.js';

describe('UnitsService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const otherSocietyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const buildingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const unitId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const admin: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Admin',
    email: 'admin@example.com',
    platformRole: null,
  };

  const assertCanAdministerSociety = vi.fn();
  const buildingFindFirst = vi.fn();
  const unitFindMany = vi.fn();
  const unitFindFirst = vi.fn();
  const unitCreate = vi.fn();
  const unitUpdate = vi.fn();
  const auditCreate = vi.fn();

  let service: UnitsService;

  beforeEach(() => {
    assertCanAdministerSociety.mockReset().mockResolvedValue(undefined);
    buildingFindFirst.mockReset();
    unitFindMany.mockReset();
    unitFindFirst.mockReset();
    unitCreate.mockReset();
    unitUpdate.mockReset();
    auditCreate.mockReset().mockResolvedValue({});

    service = new UnitsService(
      {
        building: { findFirst: buildingFindFirst },
        unit: {
          findMany: unitFindMany,
          findFirst: unitFindFirst,
          create: unitCreate,
          update: unitUpdate,
        },
        auditLog: { create: auditCreate },
      } as unknown as PrismaService,
      {
        assertCanAdministerSociety,
      } as unknown as AuthorizationService,
    );
  });

  it('rejects create when building is not in the society', async () => {
    buildingFindFirst.mockResolvedValue(null);

    await expect(
      service.create(admin, societyId, {
        buildingId,
        unitNumber: '101',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(unitCreate).not.toHaveBeenCalled();
  });

  it('creates a unit scoped to the path society, ignoring foreign buildings', async () => {
    buildingFindFirst.mockResolvedValue({ id: buildingId, societyId });
    unitCreate.mockResolvedValue({
      id: unitId,
      societyId,
      buildingId,
      unitNumber: '101',
      status: UnitStatus.ACTIVE,
      createdAt: new Date('2026-10-29T12:00:00.000Z'),
      updatedAt: new Date('2026-10-29T12:00:00.000Z'),
    });

    const result = await service.create(admin, societyId, {
      buildingId,
      unitNumber: ' 101 ',
    });

    expect(buildingFindFirst).toHaveBeenCalledWith({
      where: { id: buildingId, societyId },
      select: { id: true, societyId: true },
    });
    expect(result.societyId).toBe(societyId);
    expect(result.societyId).not.toBe(otherSocietyId);
  });

  it('maps duplicate unit numbers to conflict', async () => {
    buildingFindFirst.mockResolvedValue({ id: buildingId, societyId });
    unitCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create(admin, societyId, {
        buildingId,
        unitNumber: '101',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns not found for units outside the society', async () => {
    unitFindFirst.mockResolvedValue(null);

    await expect(
      service.getById(admin, societyId, unitId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
  });

  it('rejects directory reads when the caller cannot administer the society', async () => {
    assertCanAdministerSociety.mockRejectedValue(new ForbiddenException());

    await expect(
      service.listBySociety(admin, societyId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getById(admin, societyId, unitId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(unitFindMany).not.toHaveBeenCalled();
    expect(unitFindFirst).not.toHaveBeenCalled();
  });
});

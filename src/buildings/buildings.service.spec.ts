import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BuildingsService } from './buildings.service.js';

describe('BuildingsService', () => {
  const societyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const buildingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const admin: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Admin',
    email: 'admin@example.com',
    platformRole: null,
  };

  const assertCanAdministerSociety = vi.fn();
  const findMany = vi.fn();
  const count = vi.fn();
  const findFirst = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const auditCreate = vi.fn();

  let service: BuildingsService;

  beforeEach(() => {
    assertCanAdministerSociety.mockReset().mockResolvedValue(undefined);
    findMany.mockReset();
    count.mockReset().mockResolvedValue(1);
    findFirst.mockReset();
    create.mockReset();
    update.mockReset();
    auditCreate.mockReset().mockResolvedValue({});

    service = new BuildingsService(
      {
        building: { findMany, findFirst, create, update, count },
        auditLog: { create: auditCreate },
      } as unknown as PrismaService,
      {
        assertCanAdministerSociety,
      } as unknown as AuthorizationService,
    );
  });

  it('lists buildings only after administer authorization', async () => {
    findMany.mockResolvedValue([
      {
        id: buildingId,
        societyId,
        name: 'Wing A',
        code: 'A',
        createdAt: new Date('2026-10-29T12:00:00.000Z'),
        updatedAt: new Date('2026-10-29T12:00:00.000Z'),
      },
    ]);

    const result = await service.list(admin, societyId);
    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
    expect(result.items[0]?.code).toBe('A');
    expect(result.total).toBe(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { societyId },
        orderBy: [{ code: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('creates a building and normalizes code', async () => {
    create.mockResolvedValue({
      id: buildingId,
      societyId,
      name: 'Wing A',
      code: 'A',
      createdAt: new Date('2026-10-29T12:00:00.000Z'),
      updatedAt: new Date('2026-10-29T12:00:00.000Z'),
    });

    const result = await service.create(admin, societyId, {
      name: ' Wing A ',
      code: 'a',
    });

    expect(assertCanAdministerSociety).toHaveBeenCalledWith(admin, societyId);
    expect(create).toHaveBeenCalledWith({
      data: { societyId, name: 'Wing A', code: 'A' },
    });
    expect(result.code).toBe('A');
  });

  it('maps unique constraint violations to conflict', async () => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create(admin, societyId, { name: 'Wing A', code: 'A' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects update when building is missing in society', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.update(admin, societyId, buildingId, { name: 'Wing B' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects empty update payloads', async () => {
    findFirst.mockResolvedValue({ id: buildingId });

    await expect(
      service.update(admin, societyId, buildingId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects directory reads when the caller cannot administer the society', async () => {
    assertCanAdministerSociety.mockRejectedValue(new ForbiddenException());

    await expect(service.list(admin, societyId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.getById(admin, societyId, buildingId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('propagates forbidden from authorization', async () => {
    assertCanAdministerSociety.mockRejectedValue(new ForbiddenException());

    await expect(
      service.create(admin, societyId, { name: 'Wing A', code: 'A' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

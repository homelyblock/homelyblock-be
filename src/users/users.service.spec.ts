import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../auth/users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('UsersService.searchProfiles', () => {
  const findMany = vi.fn();
  let service: UsersService;

  beforeEach(() => {
    findMany.mockReset();
    service = new UsersService({
      userProfile: { findMany },
    } as unknown as PrismaService);
  });

  it('returns an empty list for short queries without hitting the database', async () => {
    await expect(
      service.searchProfiles('a', 10, { type: 'platform' }),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('searches by display name and email with a capped limit', async () => {
    findMany.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        displayName: 'Ankit',
        email: 'ankit@example.com',
      },
    ]);

    await expect(
      service.searchProfiles('ank', 5, { type: 'platform' }),
    ).resolves.toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('limits a society name search to that society', async () => {
    findMany.mockResolvedValue([]);
    const societyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    await service.searchProfiles('ank', 10, { type: 'society', societyId });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        where: {
          OR: [
            {
              AND: [
                expect.objectContaining({ OR: expect.any(Array) }),
                { memberships: { some: { societyId } } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('finds an unaffiliated account only by full email', async () => {
    findMany.mockResolvedValue([]);
    const societyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    await service.searchProfiles('  Person@Example.com ', 50, {
      type: 'society',
      societyId,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        where: {
          OR: [
            {
              AND: [
                expect.objectContaining({ OR: expect.any(Array) }),
                { memberships: { some: { societyId } } },
              ],
            },
            {
              AND: [
                {
                  email: {
                    equals: 'person@example.com',
                    mode: 'insensitive',
                  },
                },
                { memberships: { none: {} } },
              ],
            },
          ],
        },
      }),
    );
  });
});

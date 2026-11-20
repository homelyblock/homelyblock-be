import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  pageWindow,
  searchTerm,
  type PageResult,
} from '../common/dto/page-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBuildingDto } from './dto/create-building.dto.js';
import type { ListBuildingsQueryDto } from './dto/list-buildings-query.dto.js';
import type { UpdateBuildingDto } from './dto/update-building.dto.js';

export type BuildingDto = {
  id: string;
  societyId: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class BuildingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(
    user: AuthenticatedUser,
    societyId: string,
    query: ListBuildingsQueryDto = {},
  ): Promise<PageResult<BuildingDto>> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const { page, limit, skip } = pageWindow(query);
    const term = searchTerm(query.q);
    const where: Prisma.BuildingWhereInput = {
      societyId,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { code: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, buildings] = await Promise.all([
      this.prisma.building.count({ where }),
      this.prisma.building.findMany({
        where,
        orderBy: [{ code: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
      }),
    ]);
    return { items: buildings.map(toBuildingDto), page, limit, total };
  }

  async create(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateBuildingDto,
  ): Promise<BuildingDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);

    try {
      const building = await this.prisma.building.create({
        data: {
          societyId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
        },
      });

      await this.prisma.auditLog.create({
        data: {
          societyId,
          actorUserId: user.id,
          action: 'building.create',
          entityType: 'building',
          entityId: building.id,
          metadata: { code: building.code },
        },
      });

      return toBuildingDto(building);
    } catch (error) {
      throwUniqueOrRethrow(
        error,
        'Building code already exists in this society',
      );
    }
  }

  async getById(
    user: AuthenticatedUser,
    societyId: string,
    buildingId: string,
  ): Promise<BuildingDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, societyId },
    });
    if (!building) {
      throw new NotFoundException({
        message: 'Building not found',
        code: 'NOT_FOUND',
      });
    }
    return toBuildingDto(building);
  }

  async update(
    user: AuthenticatedUser,
    societyId: string,
    buildingId: string,
    dto: UpdateBuildingDto,
  ): Promise<BuildingDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);

    const existing = await this.prisma.building.findFirst({
      where: { id: buildingId, societyId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({
        message: 'Building not found',
        code: 'NOT_FOUND',
      });
    }

    const data: { name?: string; code?: string } = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.code !== undefined) {
      data.code = dto.code.trim().toUpperCase();
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        message: 'No updatable fields were provided',
        code: 'BAD_REQUEST',
      });
    }

    try {
      const building = await this.prisma.building.update({
        where: { id: buildingId },
        data,
      });

      await this.prisma.auditLog.create({
        data: {
          societyId,
          actorUserId: user.id,
          action: 'building.update',
          entityType: 'building',
          entityId: building.id,
          metadata: data,
        },
      });

      return toBuildingDto(building);
    } catch (error) {
      throwUniqueOrRethrow(
        error,
        'Building code already exists in this society',
      );
    }
  }
}

function toBuildingDto(building: {
  id: string;
  societyId: string;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}): BuildingDto {
  return {
    id: building.id,
    societyId: building.societyId,
    name: building.name,
    code: building.code,
    createdAt: building.createdAt.toISOString(),
    updatedAt: building.updatedAt.toISOString(),
  };
}

function throwUniqueOrRethrow(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException({ message, code: 'CONFLICT' });
  }
  throw error;
}

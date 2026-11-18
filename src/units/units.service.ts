import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { Prisma, UnitStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUnitDto } from './dto/create-unit.dto.js';
import type { UpdateUnitDto } from './dto/update-unit.dto.js';

export type UnitDto = {
  id: string;
  societyId: string;
  buildingId: string;
  unitNumber: string;
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async listBySociety(
    user: AuthenticatedUser,
    societyId: string,
    buildingId?: string,
  ): Promise<UnitDto[]> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const units = await this.prisma.unit.findMany({
      where: {
        societyId,
        ...(buildingId ? { buildingId } : {}),
      },
      orderBy: [{ buildingId: 'asc' }, { unitNumber: 'asc' }],
    });
    return units.map(toUnitDto);
  }

  async create(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateUnitDto,
  ): Promise<UnitDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);

    const building = await this.prisma.building.findFirst({
      where: { id: dto.buildingId, societyId },
      select: { id: true, societyId: true },
    });
    if (!building) {
      throw new BadRequestException({
        message: 'Building not found in this society',
        code: 'BAD_REQUEST',
      });
    }

    try {
      const unit = await this.prisma.unit.create({
        data: {
          societyId,
          buildingId: building.id,
          unitNumber: dto.unitNumber.trim(),
          status: dto.status ?? UnitStatus.ACTIVE,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          societyId,
          actorUserId: user.id,
          action: 'unit.create',
          entityType: 'unit',
          entityId: unit.id,
          metadata: {
            buildingId: unit.buildingId,
            unitNumber: unit.unitNumber,
          },
        },
      });

      return toUnitDto(unit);
    } catch (error) {
      throwUniqueOrRethrow(
        error,
        'Unit number already exists in this building',
      );
    }
  }

  async getById(
    user: AuthenticatedUser,
    societyId: string,
    unitId: string,
  ): Promise<UnitDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, societyId },
    });
    if (!unit) {
      throw new NotFoundException({
        message: 'Unit not found',
        code: 'NOT_FOUND',
      });
    }
    return toUnitDto(unit);
  }

  async update(
    user: AuthenticatedUser,
    societyId: string,
    unitId: string,
    dto: UpdateUnitDto,
  ): Promise<UnitDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);

    const existing = await this.prisma.unit.findFirst({
      where: { id: unitId, societyId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({
        message: 'Unit not found',
        code: 'NOT_FOUND',
      });
    }

    const data: { unitNumber?: string; status?: UnitStatus } = {};
    if (dto.unitNumber !== undefined) {
      data.unitNumber = dto.unitNumber.trim();
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        message: 'No updatable fields were provided',
        code: 'BAD_REQUEST',
      });
    }

    try {
      const unit = await this.prisma.unit.update({
        where: { id: unitId },
        data,
      });

      await this.prisma.auditLog.create({
        data: {
          societyId,
          actorUserId: user.id,
          action: 'unit.update',
          entityType: 'unit',
          entityId: unit.id,
          metadata: data,
        },
      });

      return toUnitDto(unit);
    } catch (error) {
      throwUniqueOrRethrow(
        error,
        'Unit number already exists in this building',
      );
    }
  }
}

function toUnitDto(unit: {
  id: string;
  societyId: string;
  buildingId: string;
  unitNumber: string;
  status: UnitStatus;
  createdAt: Date;
  updatedAt: Date;
}): UnitDto {
  return {
    id: unit.id,
    societyId: unit.societyId,
    buildingId: unit.buildingId,
    unitNumber: unit.unitNumber,
    status: unit.status,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
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

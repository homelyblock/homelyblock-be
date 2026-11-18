import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  Prisma,
} from '../generated/prisma/client.js';
import { normalizeIndianPhone } from '../common/indian-phone.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateServiceDto } from './dto/create-service.dto.js';
import type { ListServicesQueryDto } from './dto/list-services-query.dto.js';
import type { UpdateServiceDto } from './dto/update-service.dto.js';
import {
  toServiceProviderDto,
  type ServiceProviderDto,
} from './service-directory.mapper.js';

export type PaginatedServices = {
  items: ServiceProviderDto[];
  page: number;
  limit: number;
  total: number;
};

@Injectable()
export class ServiceDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(
    user: AuthenticatedUser,
    societyId: string,
    query: ListServicesQueryDto,
  ): Promise<PaginatedServices> {
    const membership = await this.authorization.assertCanViewSociety(
      user,
      societyId,
    );
    const isAdmin = await this.isSocietyAdmin(user, societyId, membership?.role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const where: Prisma.ServiceProviderWhereInput = {
      societyId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.q?.trim()
        ? {
            name: {
              contains: query.q.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
    };

    if (isAdmin) {
      if (query.active !== undefined) {
        where.isActive = query.active;
      }
    } else {
      where.isActive = true;
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.serviceProvider.count({ where }),
      this.prisma.serviceProvider.findMany({
        where,
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map(toServiceProviderDto),
      page,
      limit,
      total,
    };
  }

  async create(
    user: AuthenticatedUser,
    societyId: string,
    dto: CreateServiceDto,
  ): Promise<ServiceProviderDto> {
    await this.authorization.assertCanAdministerSociety(user, societyId);
    const provider = await this.prisma.serviceProvider.create({
      data: {
        societyId,
        name: dto.name.trim(),
        category: dto.category,
        description: optionalTrim(dto.description),
        contactPerson: optionalTrim(dto.contactPerson),
        phone: normalizePhone(dto.phone),
        whatsappNumber: optionalPhone(dto.whatsappNumber),
        address: optionalTrim(dto.address),
        isActive: true,
        createdByUserId: user.id,
      },
    });
    await this.audit(user.id, societyId, 'service_provider.create', provider.id);
    return toServiceProviderDto(provider);
  }

  async get(
    user: AuthenticatedUser,
    serviceId: string,
  ): Promise<ServiceProviderDto> {
    const provider = await this.requireProvider(serviceId);
    await this.assertCanViewProvider(user, provider);
    return toServiceProviderDto(provider);
  }

  async update(
    user: AuthenticatedUser,
    serviceId: string,
    dto: UpdateServiceDto,
  ): Promise<ServiceProviderDto> {
    const provider = await this.requireProvider(serviceId);
    await this.authorization.assertCanAdministerSociety(
      user,
      provider.societyId,
    );

    const updated = await this.prisma.serviceProvider.update({
      where: { id: serviceId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined
          ? { description: optionalTrim(dto.description) }
          : {}),
        ...(dto.contactPerson !== undefined
          ? { contactPerson: optionalTrim(dto.contactPerson) }
          : {}),
        ...(dto.phone !== undefined ? { phone: normalizePhone(dto.phone) } : {}),
        ...(dto.whatsappNumber !== undefined
          ? { whatsappNumber: optionalPhone(dto.whatsappNumber) }
          : {}),
        ...(dto.address !== undefined
          ? { address: optionalTrim(dto.address) }
          : {}),
      },
    });
    await this.audit(
      user.id,
      provider.societyId,
      'service_provider.update',
      serviceId,
    );
    return toServiceProviderDto(updated);
  }

  async deactivate(
    user: AuthenticatedUser,
    serviceId: string,
  ): Promise<ServiceProviderDto> {
    return this.setActive(user, serviceId, false);
  }

  async activate(
    user: AuthenticatedUser,
    serviceId: string,
  ): Promise<ServiceProviderDto> {
    return this.setActive(user, serviceId, true);
  }

  private async setActive(
    user: AuthenticatedUser,
    serviceId: string,
    isActive: boolean,
  ): Promise<ServiceProviderDto> {
    const provider = await this.requireProvider(serviceId);
    await this.authorization.assertCanAdministerSociety(
      user,
      provider.societyId,
    );
    const updated = await this.prisma.serviceProvider.update({
      where: { id: serviceId },
      data: { isActive },
    });
    await this.audit(
      user.id,
      provider.societyId,
      isActive ? 'service_provider.activate' : 'service_provider.deactivate',
      serviceId,
    );
    return toServiceProviderDto(updated);
  }

  private async requireProvider(serviceId: string) {
    const provider = await this.prisma.serviceProvider.findUnique({
      where: { id: serviceId },
    });
    if (!provider) {
      throw new NotFoundException({
        message: 'Service provider not found',
        code: 'NOT_FOUND',
      });
    }
    return provider;
  }

  private async assertCanViewProvider(
    user: AuthenticatedUser,
    provider: { societyId: string; isActive: boolean },
  ): Promise<void> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) {
      await this.authorization.ensureSocietyExists(provider.societyId);
      return;
    }

    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId: provider.societyId,
        status: MembershipStatus.ACTIVE,
      },
      select: { role: true },
    });
    if (!membership) {
      throw new NotFoundException({
        message: 'Service provider not found',
        code: 'NOT_FOUND',
      });
    }
    if (membership.role === MembershipRole.SOCIETY_ADMIN) return;
    if (!provider.isActive) {
      throw new NotFoundException({
        message: 'Service provider not found',
        code: 'NOT_FOUND',
      });
    }
  }

  private async isSocietyAdmin(
    user: AuthenticatedUser,
    societyId: string,
    membershipRole?: MembershipRole,
  ): Promise<boolean> {
    if (user.platformRole === PlatformRole.PLATFORM_OWNER) return true;
    if (membershipRole === MembershipRole.SOCIETY_ADMIN) return true;
    const admin = await this.prisma.societyMembership.findFirst({
      where: {
        userId: user.id,
        societyId,
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.SOCIETY_ADMIN,
      },
      select: { id: true },
    });
    return Boolean(admin);
  }

  private async audit(
    actorUserId: string,
    societyId: string,
    action: string,
    entityId: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        societyId,
        actorUserId,
        action,
        entityType: 'service_provider',
        entityId,
      },
    });
  }
}

function optionalTrim(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePhone(value: string): string {
  return normalizeIndianPhone(value);
}

function optionalPhone(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? normalizeIndianPhone(trimmed) : null;
}

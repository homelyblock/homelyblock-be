import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type HealthStatus = {
  status: 'ok';
};

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getStatus(): HealthStatus {
    return { status: 'ok' };
  }

  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

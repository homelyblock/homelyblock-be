import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service.js';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Application health' })
  @ApiOkResponse({
    description: 'Reports that the NestJS process is running',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
          },
        },
      },
    },
  })
  getHealth() {
    return {
      data: this.healthService.getStatus(),
    };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness, including a database connectivity check',
  })
  @ApiOkResponse({
    description: 'Process is up and the database accepted a query',
  })
  @ApiServiceUnavailableResponse({
    description: 'Process is up but the database could not be reached',
  })
  async getReadiness() {
    const ready = await this.healthService.isDatabaseReachable();
    if (!ready) {
      throw new ServiceUnavailableException({
        message: 'Database is unavailable',
      });
    }
    return {
      data: { status: 'ok' as const },
    };
  }
}

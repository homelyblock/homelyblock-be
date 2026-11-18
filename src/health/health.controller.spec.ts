import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  const queryRaw = vi.fn();

  beforeEach(async () => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ ok: 1 }]);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: queryRaw },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns a safe running status without querying the database', () => {
    expect(controller.getHealth()).toEqual({
      data: { status: 'ok' },
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reports ready when the database accepts a query', async () => {
    await expect(controller.getReadiness()).resolves.toEqual({
      data: { status: 'ok' },
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('reports unavailable when the database query fails', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

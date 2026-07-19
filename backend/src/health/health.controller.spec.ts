import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

// B-08: split liveness (static) from readiness (a cheap DB SELECT 1). Readiness
// is the deploy gate, so it must 503 when the DB is unreachable; liveness must
// stay green regardless so a transient blip never triggers a restart loop.
describe('HealthController', () => {
  it('liveness is static and does not touch the DB', () => {
    const prisma = { $queryRaw: vi.fn() } as unknown as PrismaService;
    const controller = new HealthController(prisma);
    expect(controller.check().status).toBe('ok');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('readiness returns ready when the DB answers', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;
    const controller = new HealthController(prisma);
    await expect(controller.ready()).resolves.toMatchObject({ status: 'ready' });
  });

  it('readiness 503s when the DB is unreachable', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("can't reach database")),
    } as unknown as PrismaService;
    const controller = new HealthController(prisma);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

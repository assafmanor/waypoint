import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness (B-08): a static "the process is up" signal, deliberately
   *  independent of DB/storage so a transient dependency blip never triggers a
   *  restart loop. This is what a process-restart policy should watch. */
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'waypoint-api',
      time: new Date().toISOString(),
    };
  }

  /** Readiness (B-08): "can this instance actually serve traffic" — a cheap
   *  `SELECT 1`. Used as the deploy health gate (railway.json) so a new instance
   *  whose DB is unreachable is never routed to. Returns 503 when the DB is down. */
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        error: { code: 'NOT_READY', message: 'Database unreachable' },
      });
    }
    return { status: 'ready', time: new Date().toISOString() };
  }
}

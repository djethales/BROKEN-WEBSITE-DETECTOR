import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV, type Env } from './config/env';
import { PrismaService } from './prisma/prisma.module';
import { REDIS } from './redis/redis.module';

interface DependencyHealth {
  ok: boolean;
  error?: string;
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async getHealth(): Promise<Record<string, unknown>> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const healthy = database.ok && redis.ok;
    const result = {
      status: healthy ? 'ok' : 'error',
      service: 'api',
      environment: this.env.NODE_ENV,
      database,
      redis,
      checkedAt: new Date().toISOString(),
    };
    if (!healthy) {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'database unavailable' };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    try {
      await this.redis.ping();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'redis unavailable' };
    }
  }
}

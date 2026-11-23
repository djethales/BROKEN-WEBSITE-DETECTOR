import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.module';
import {
  defaultJobOptions,
  QUEUE_BATCH,
  QUEUE_INSPECT,
  QUEUE_SYNC,
} from '../queues/queues';
import { dispatchDueSites } from './dispatch-due-sites';

type SchedulerEnv = Pick<Env, 'SYNC_INTERVAL_CRON' | 'BATCH_INTERVAL_CRON' | 'BATCH_SIZE'>;

@Injectable()
export class MonitoringScheduler implements OnModuleInit {
  private readonly logger = new Logger(MonitoringScheduler.name);

  constructor(
    @Inject(ENV) private readonly env: SchedulerEnv,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_SYNC) private readonly syncQueue: Queue,
    @InjectQueue(QUEUE_BATCH) private readonly batchQueue: Queue,
    @InjectQueue(QUEUE_INSPECT) private readonly inspectQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([
      this.syncQueue.upsertJobScheduler(
        'sites-sync',
        { pattern: this.env.SYNC_INTERVAL_CRON, immediately: true },
        { name: 'sync-sites', data: {}, opts: defaultJobOptions },
      ),
      this.batchQueue.upsertJobScheduler(
        'due-sites',
        { pattern: this.env.BATCH_INTERVAL_CRON, immediately: true },
        { name: 'enqueue-due-sites', data: {}, opts: defaultJobOptions },
      ),
    ]);
    this.logger.log('Planification de la synchronisation et des contrôles activée');
  }

  async enqueueDueSites(): Promise<{ queued: number; skipped: number }> {
    const sites = await this.prisma.site.findMany({
      where: {
        monitoringEnabled: true,
        currentState: { not: 'MAINTENANCE' },
        nextCheckAt: { lte: new Date() },
      },
      orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
      take: this.env.BATCH_SIZE,
      select: { id: true },
    });

    const result = await dispatchDueSites(sites, {
      getJob: (jobId) => this.inspectQueue.getJob(jobId),
      add: (jobId, siteId) =>
        this.inspectQueue.add(
          'inspect-site',
          { siteId },
          { ...defaultJobOptions, jobId },
        ),
    });
    const { queued, skipped } = result;
    this.logger.log({ queued, skipped }, 'contrôles planifiés');
    return result;
  }
}


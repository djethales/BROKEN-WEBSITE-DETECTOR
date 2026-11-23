import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { Prisma } from '@prisma/client';
import { ENV, type Env } from '../config/env';
import { INCIDENT_LABELS, type IncidentType, type LogEntry } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';
import { defaultJobOptions, EVENTS_CHANNEL, QUEUE_NOTIFY } from '../queues/queues';
import { transition } from './transition';

@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE_NOTIFY) private readonly notifyQueue: Queue,
  ) {}

  async apply(checkId: string): Promise<void> {
    const check = await this.prisma.check.findUnique({ where: { id: checkId } });
    if (!check?.verdict) {
      return;
    }
    const site = await this.prisma.site.findUnique({ where: { id: check.siteId } });
    if (!site || !site.monitoringEnabled || site.currentState === 'MAINTENANCE') {
      return;
    }
    const open = await this.prisma.incident.findFirst({
      where: { siteId: site.id, resolvedAt: null },
    });
    const result = transition(
      {
        currentState: site.currentState,
        consecutiveFailures: site.consecutiveFailures,
        hasOpenIncident: Boolean(open),
      },
      {
        verdict: check.verdict,
        incidentType: check.incidentType,
        failureThreshold: this.env.FAILURE_THRESHOLD,
        recheckDelayMinutes: this.env.RECHECK_DELAY_MINUTES,
        checkIntervalMinutes: this.env.CHECK_INTERVAL_MINUTES,
        now: new Date(),
      },
    );

    let incidentId: string | null = null;
    let notifyKind: 'open' | 'resolve' | null = null;
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.site.update({
        where: { id: site.id },
        data: {
          currentState: result.currentState,
          consecutiveFailures: result.consecutiveFailures,
          nextCheckAt: result.nextCheckAt,
          stateSince: result.stateChanged ? new Date() : site.stateSince,
          stateReason: check.reason,
          lastCheckedAt: check.startedAt,
        },
      });
      if (result.openIncident && check.incidentType) {
        const created = await tx.incident.create({
          data: {
            siteId: site.id,
            type: check.incidentType,
            firstCheckId: check.id,
            lastCheckId: check.id,
          },
        });
        incidentId = created.id;
        notifyKind = 'open';
      } else if (result.updateOpenIncident && open) {
        await tx.incident.update({ where: { id: open.id }, data: { lastCheckId: check.id } });
      } else if (result.resolveIncident && open) {
        await tx.incident.update({
          where: { id: open.id },
          data: { resolvedAt: new Date(), lastCheckId: check.id },
        });
        incidentId = open.id;
        notifyKind = 'resolve';
      }
    });

    await this.redis.publish(
      EVENTS_CHANNEL,
      JSON.stringify({
        type: result.stateChanged ? 'state-changed' : 'check-finished',
        siteId: site.id,
        state: result.currentState,
        verdict: check.verdict,
        at: new Date().toISOString(),
      }),
    );
    if (incidentId && notifyKind) {
      await this.redis.publish(
        EVENTS_CHANNEL,
        JSON.stringify({
          type: notifyKind === 'open' ? 'incident-opened' : 'incident-resolved',
          siteId: site.id,
          incidentId,
          at: new Date().toISOString(),
        }),
      );
      await this.notifyQueue.add(
        'notify',
        { incidentId, kind: notifyKind },
        { ...defaultJobOptions, jobId: `notify:${incidentId}:${notifyKind}` },
      );
    }
    this.logger.log({ siteId: site.id, state: result.currentState, verdict: check.verdict }, 'état mis à jour');
  }
}

export function incidentLabel(type: IncidentType): string {
  return INCIDENT_LABELS[type];
}

export function relevantLogs(entries: LogEntry[]): LogEntry[] {
  return entries.slice(0, 8);
}

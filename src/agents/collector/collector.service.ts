import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { toJson } from '../../common/json';
import { PrismaService } from '../../prisma/prisma.module';
import { mapPayload, planSync } from './field-map';

@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async sync(): Promise<{ upserted: number; disabled: number; skipped: number }> {
    const payload = await this.fetchPayload();
    const mapped = mapPayload(payload, this.env.SITES_FIELD_MAP);
    const existing = await this.prisma.site.findMany({
      select: { id: true, externalId: true, currentState: true, consecutiveFailures: true },
    });
    const plan = planSync(existing, mapped.sites, this.env.SOURCE_STATUS_MAP, mapped.skipped);
    if (mapped.sites.length === 0) {
      this.logger.error('Endpoint de sites vide ou illisible : aucun site désactivé');
      return { upserted: 0, disabled: 0, skipped: plan.skipped.length };
    }

    for (const item of plan.upserts) {
      const site = item.incoming;
      const shared = {
        name: site.name,
        url: site.url,
        clientName: site.clientName,
        sourceStatus: site.sourceStatus,
        metadata: toJson(site.metadata),
        criticality: site.criticality,
        alertEmails: site.alertEmails,
        monitoringEnabled: item.monitoringEnabled,
      };
      const statePatch = item.currentState
        ? { currentState: item.currentState, stateSince: new Date(), stateReason: null as string | null }
        : {};
      const schedulePatch = item.resetSchedule ? { nextCheckAt: new Date() } : {};
      await this.prisma.site.upsert({
        where: { externalId: site.externalId },
        create: {
          externalId: site.externalId,
          ...shared,
          currentState: item.currentState ?? 'UNKNOWN',
          nextCheckAt: new Date(),
        },
        update: { ...shared, ...statePatch, ...schedulePatch },
      });
    }

    if (plan.disableExternalIds.length > 0) {
      await this.prisma.site.updateMany({
        where: { externalId: { in: plan.disableExternalIds } },
        data: { monitoringEnabled: false },
      });
    }
    this.logger.log(
      { upserted: plan.upserts.length, disabled: plan.disableExternalIds.length, skipped: plan.skipped.length },
      'sites synchronisés',
    );
    return {
      upserted: plan.upserts.length,
      disabled: plan.disableExternalIds.length,
      skipped: plan.skipped.length,
    };
  }

  private async fetchPayload(): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.env.SITES_ENDPOINT_TOKEN) {
      headers.authorization = `Bearer ${this.env.SITES_ENDPOINT_TOKEN}`;
    }
    const response = await fetch(this.env.SITES_ENDPOINT_URL, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      throw new Error(`Endpoint sites HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  }
}

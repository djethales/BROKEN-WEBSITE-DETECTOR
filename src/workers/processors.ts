import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { INCIDENT_LABELS, type IncidentType } from '../common/types';
import { toJson } from '../common/json';
import { ENV, type Env, getEnv } from '../config/env';
import { CollectorService } from '../agents/collector/collector.service';
import { InspectorService } from '../agents/inspector/inspector.service';
import { MailService } from '../mail/mail.module';
import { PrismaService } from '../prisma/prisma.module';
import { StateMachineService } from '../orchestrator/state-machine.service';
import { evaluateCheck, mergeAnalyses } from '../rules/evaluate';
import { RulesService } from '../rules/rules.service';
import {
  defaultJobOptions,
  QUEUE_BATCH,
  QUEUE_INSPECT,
  QUEUE_NOTIFY,
  QUEUE_SYNC,
} from '../queues/queues';
import { MonitoringScheduler } from './monitoring.scheduler';
import type { Job, Queue } from 'bullmq';

interface InspectJobData {
  siteId: string;
}

interface NotificationJobData {
  incidentId: string;
  kind: 'open' | 'resolve';
}

@Processor(QUEUE_SYNC)
export class SyncSitesProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncSitesProcessor.name);

  constructor(
    private readonly collector: CollectorService,
    @InjectQueue(QUEUE_BATCH) private readonly batchQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== 'sync-sites') {
      throw new Error(`Job de synchronisation inconnu : ${job.name}`);
    }
    const result = await this.collector.sync();
    this.logger.log(result, 'synchronisation des sites terminée');
    await this.batchQueue.add('enqueue-due-sites', {}, defaultJobOptions);
    return result;
  }
}

@Processor(QUEUE_BATCH)
export class DueSitesProcessor extends WorkerHost {
  constructor(private readonly scheduler: MonitoringScheduler) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== 'enqueue-due-sites') {
      throw new Error(`Job de planification inconnu : ${job.name}`);
    }
    return this.scheduler.enqueueDueSites();
  }
}

@Processor(QUEUE_INSPECT, { concurrency: getEnv().INSPECT_CONCURRENCY })
export class InspectionProcessor extends WorkerHost {
  private readonly logger = new Logger(InspectionProcessor.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly inspector: InspectorService,
    private readonly rules: RulesService,
    private readonly stateMachine: StateMachineService,
  ) {
    super();
  }

  async process(job: Job<InspectJobData>): Promise<{ checkId?: string; skipped?: boolean }> {
    if (job.name !== 'inspect-site' || !job.data?.siteId) {
      throw new Error('Données de job d’inspection invalides');
    }

    const site = await this.prisma.site.findUnique({
      where: { id: job.data.siteId },
      select: { id: true, url: true, monitoringEnabled: true, currentState: true },
    });
    if (!site || !site.monitoringEnabled || site.currentState === 'MAINTENANCE') {
      return { skipped: true };
    }

    const [inspection, knownNoise] = await Promise.all([
      this.inspector.inspect(site.url),
      this.prisma.knownNoise.findMany({
        where: { siteId: site.id, isActive: true },
        select: { signature: true },
      }),
    ]);
    const noiseSignatures = new Set(knownNoise.map((item) => item.signature));
    const analyses = inspection.captures.map((capture) =>
      evaluateCheck({
        entries: capture.entries,
        dom: capture.dom,
        navigation: capture.navigation,
        noiseSignatures,
        rules: this.rules.getRules(),
        visibleTextMinLength: this.env.VISIBLE_TEXT_MIN_LENGTH,
        ignoredThirdPartyDomains: this.env.IGNORED_THIRD_PARTY_DOMAINS,
        unknownThirdPartyPolicy: this.env.UNKNOWN_THIRD_PARTY_POLICY,
      }),
    );
    const analysis = mergeAnalyses(analyses);
    const check = await this.prisma.check.create({
      data: {
        siteId: site.id,
        viewport: inspection.captures.map((capture) => capture.viewport).join(','),
        durationMs: inspection.durationMs,
        navigation: toJson(
          inspection.captures.map((capture) => ({
            viewport: capture.viewport,
            ...capture.navigation,
          })),
        ),
        entries: toJson(
          inspection.captures.map((capture) => ({
            viewport: capture.viewport,
            entries: capture.entries,
          })),
        ),
        dom: toJson(
          inspection.captures.map((capture) => ({
            viewport: capture.viewport,
            ...capture.dom,
          })),
        ),
        matchedRules: toJson(analysis.matchedRules),
        verdict: analysis.verdict,
        verdictSource: 'RULES',
        incidentType: analysis.incidentType,
        reason: analysis.reason,
      },
    });

    await this.stateMachine.apply(check.id);
    this.logger.log(
      { siteId: site.id, checkId: check.id, verdict: analysis.verdict },
      'contrôle terminé',
    );
    return { checkId: check.id };
  }
}

@Processor(QUEUE_NOTIFY)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    if (
      job.name !== 'notify' ||
      !job.data?.incidentId ||
      (job.data.kind !== 'open' && job.data.kind !== 'resolve')
    ) {
      throw new Error('Données de notification invalides');
    }
    const incident = await this.prisma.incident.findUnique({
      where: { id: job.data.incidentId },
      include: { site: true, lastCheck: true },
    });
    if (!incident) {
      throw new Error(`Incident introuvable : ${job.data.incidentId}`);
    }

    const recipients = incident.site.alertEmails.length
      ? [...new Set(incident.site.alertEmails)]
      : [this.env.ADMIN_ALERT_EMAIL];
    const resolved = job.data.kind === 'resolve';
    const check = incident.lastCheck;
    const incidentType: IncidentType = incident.type;
    await this.mail.send({
      to: recipients,
      subject: `[Monitor] ${resolved ? 'Site rétabli' : 'Incident'} : ${incident.site.name}`,
      text: [
        `Site : ${incident.site.name}`,
        `URL : ${incident.site.url}`,
        `Incident : ${INCIDENT_LABELS[incidentType]}`,
        `État : ${resolved ? 'résolu' : 'ouvert'}`,
        `Détail : ${check.reason ?? 'Aucun détail disponible.'}`,
        `Date du contrôle : ${check.startedAt.toISOString()}`,
      ].join('\n'),
    });

    await this.prisma.incident.update({
      where: { id: incident.id },
      data: resolved ? { notifiedResolvedAt: new Date() } : { notifiedOpenAt: new Date() },
    });
    this.logger.log({ incidentId: incident.id, kind: job.data.kind }, 'notification envoyée');
  }
}

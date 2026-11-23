import type { SourceStatusMap, FieldMap } from '../../config/env';
import type { SiteState } from '../../common/types';

export interface MappedSite {
  externalId: string;
  name: string;
  url: string;
  sourceStatus: string;
  clientName: string | null;
  alertEmails: string[];
  criticality: number;
  metadata: Record<string, unknown>;
}

export interface ExistingSiteRef {
  id: string;
  externalId: string;
  currentState: SiteState;
  consecutiveFailures: number;
}

export interface StatusAction {
  monitoringEnabled?: boolean;
  state?: 'MAINTENANCE' | null;
}

export interface SiteUpsertPlan {
  incoming: MappedSite;
  monitoringEnabled: boolean;
  currentState?: SiteState;
  resetSchedule: boolean;
}

export interface SyncPlan {
  upserts: SiteUpsertPlan[];
  disableExternalIds: string[];
  skipped: string[];
}

function readPath(source: unknown, path: string | undefined): unknown {
  if (!path) {
    return undefined;
  }
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function asEmails(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.includes('@'));
  }
  if (typeof value === 'string' && value.includes('@')) {
    return [value.trim()];
  }
  return [];
}

export function mapPayload(payload: unknown, fieldMap: FieldMap): { sites: MappedSite[]; skipped: string[] } {
  const items = readPath(payload, fieldMap.items);
  if (!Array.isArray(items)) {
    throw new Error(`Le champ « ${fieldMap.items} » ne contient pas une liste.`);
  }
  const sites: MappedSite[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    const externalId = readPath(item, fieldMap.externalId);
    const name = readPath(item, fieldMap.name);
    const url = readPath(item, fieldMap.url);
    const sourceStatus = readPath(item, fieldMap.sourceStatus);
    const idText = externalId === undefined || externalId === null ? '' : String(externalId);
    if (!idText || typeof name !== 'string' || typeof url !== 'string') {
      skipped.push(idText || '(sans id)');
      continue;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      skipped.push(idText);
      continue;
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      skipped.push(idText);
      continue;
    }
    const criticalityRaw = readPath(item, fieldMap.criticality);
    const criticality = typeof criticalityRaw === 'number' && Number.isFinite(criticalityRaw) ? criticalityRaw : 0;
    sites.push({
      externalId: idText,
      name,
      url,
      sourceStatus: sourceStatus === undefined || sourceStatus === null ? 'active' : String(sourceStatus),
      clientName: (() => {
        const value = readPath(item, fieldMap.clientName);
        return typeof value === 'string' ? value : null;
      })(),
      alertEmails: asEmails(readPath(item, fieldMap.alertEmails)),
      criticality,
      metadata: item && typeof item === 'object' ? (item as Record<string, unknown>) : {},
    });
  }
  return { sites, skipped };
}

export function statusAction(sourceStatus: string, map: SourceStatusMap): StatusAction {
  return map[sourceStatus] ?? map[sourceStatus.toLowerCase()] ?? {};
}

export function planSync(
  existing: ExistingSiteRef[],
  incoming: MappedSite[],
  statusMap: SourceStatusMap,
  skipped: string[],
): SyncPlan {
  if (incoming.length === 0) {
    return { upserts: [], disableExternalIds: [], skipped };
  }
  const seen = new Set(incoming.map((site) => site.externalId));
  const existingByExternal = new Map(existing.map((site) => [site.externalId, site]));
  const upserts = incoming.map((site) => {
    const action = statusAction(site.sourceStatus, statusMap);
    const previous = existingByExternal.get(site.externalId);
    const leavingMaintenance =
      previous?.currentState === 'MAINTENANCE' &&
      action.state !== 'MAINTENANCE' &&
      action.monitoringEnabled !== false;
    let monitoringEnabled = action.monitoringEnabled ?? true;
    let currentState: SiteState | undefined;
    if (action.state === 'MAINTENANCE') {
      currentState = 'MAINTENANCE';
      monitoringEnabled = action.monitoringEnabled ?? false;
    } else if (leavingMaintenance) {
      currentState = 'UNKNOWN';
      monitoringEnabled = true;
    }
    return {
      incoming: site,
      monitoringEnabled,
      currentState,
      resetSchedule: leavingMaintenance,
    };
  });
  const disableExternalIds = existing
    .filter((site) => !seen.has(site.externalId))
    .map((site) => site.externalId);
  return { upserts, disableExternalIds, skipped };
}

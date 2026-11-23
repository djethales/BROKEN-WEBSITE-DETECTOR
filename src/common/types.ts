export const SITE_STATES = [
  'HEALTHY',
  'BROKEN',
  'DOUBTFUL',
  'BLOCKED',
  'MAINTENANCE',
  'UNKNOWN',
] as const;
export type SiteState = (typeof SITE_STATES)[number];

export const VERDICTS = ['HEALTHY', 'BROKEN', 'DOUBTFUL', 'BLOCKED'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const INCIDENT_TYPES = [
  'HTTP_ERROR',
  'UNREACHABLE',
  'CSS_FAILED',
  'JS_FAILED',
  'JS_ERROR',
  'BLANK_PAGE',
  'OTHER',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const LOG_SOURCES = ['console', 'pageerror', 'network', 'dom'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export interface LogEntry {
  source: LogSource;
  level: string;
  text: string;
  url?: string;
  resourceType?: string;
  status?: string;
  isFirstParty?: boolean;
  signature: string;
  count: number;
}

export interface DomMetrics {
  stylesheetLinks: number;
  accessibleStylesheets: number;
  cssRulesTotal: number;
  scriptCount: number;
  visibleTextLength: number;
  scrollHeight: number;
  hasH1: boolean;
  hasHeader: boolean;
  hasMain: boolean;
  hasFooter: boolean;
  hasNav: boolean;
}

export interface NavigationInfo {
  documentStatus: number | null;
  finalUrl: string | null;
  redirectCount: number;
  error: string | null;
  blocked: boolean;
  challenge: boolean;
}

export interface MatchedRule {
  id: string;
  count: number;
}

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  HTTP_ERROR: 'Erreur HTTP',
  UNREACHABLE: 'Site injoignable',
  CSS_FAILED: 'CSS en échec',
  JS_FAILED: 'JavaScript en échec',
  JS_ERROR: 'Erreur JavaScript',
  BLANK_PAGE: 'Page blanche',
  OTHER: 'Autre',
};

export const STATE_LABELS: Record<SiteState, string> = {
  HEALTHY: 'Sain',
  BROKEN: 'Cassé',
  DOUBTFUL: 'Douteux',
  BLOCKED: 'Bloqué',
  MAINTENANCE: 'Maintenance',
  UNKNOWN: 'Inconnu',
};

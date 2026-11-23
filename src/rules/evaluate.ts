import type { DomMetrics, IncidentType, LogEntry, MatchedRule, NavigationInfo, Verdict } from '../common/types';
import type { ErrorRule } from './rules.schema';

export interface EvaluateInput {
  entries: LogEntry[];
  dom: DomMetrics;
  navigation: NavigationInfo;
  noiseSignatures: ReadonlySet<string>;
  rules: ErrorRule[];
  visibleTextMinLength: number;
  ignoredThirdPartyDomains: string[];
  unknownThirdPartyPolicy: 'ignore' | 'doubtful';
}

export interface Analysis {
  verdict: Verdict;
  incidentType: IncidentType | null;
  reason: string;
  matchedRules: MatchedRule[];
  needsJudge: boolean;
  unknownEntries: LogEntry[];
}

const VERDICT_RANK: Record<Verdict, number> = {
  HEALTHY: 1,
  DOUBTFUL: 2,
  BLOCKED: 3,
  BROKEN: 4,
};

function testPattern(pattern: string | undefined, value: string | undefined): boolean {
  if (!pattern) {
    return true;
  }
  if (!value) {
    return false;
  }
  return new RegExp(pattern, 'i').test(value);
}

export function ruleMatchesEntry(rule: ErrorRule, entry: LogEntry): boolean {
  if (rule.source === 'dom' || rule.domCheck) {
    return false;
  }
  if (rule.source !== '*' && rule.source !== entry.source) {
    return false;
  }
  if (rule.resourceType && rule.resourceType !== entry.resourceType) {
    return false;
  }
  if (rule.firstPartyOnly && entry.isFirstParty !== true) {
    return false;
  }
  return (
    testPattern(rule.urlMatch, entry.url) &&
    testPattern(rule.textMatch, entry.text) &&
    testPattern(rule.statusMatch, entry.status)
  );
}

function domMatches(rule: ErrorRule, dom: DomMetrics, visibleTextMinLength: number): boolean {
  if (rule.domCheck === 'visibleTextTooShort') {
    return dom.visibleTextLength < visibleTextMinLength;
  }
  if (rule.domCheck === 'stylesheetsDeclaredButEmpty') {
    return dom.stylesheetLinks > 0 && dom.accessibleStylesheets > 0 && dom.cssRulesTotal === 0;
  }
  return false;
}

function blockedResult(): Analysis {
  return {
    verdict: 'BLOCKED',
    incidentType: null,
    reason: 'Accès refusé ou challenge anti-bot. Action requise : allowlist IP du VPS et en-tête X-Monitor-Token.',
    matchedRules: [],
    needsJudge: false,
    unknownEntries: [],
  };
}

function brokenResult(incidentType: IncidentType, reason: string, matchedRules: MatchedRule[]): Analysis {
  return {
    verdict: 'BROKEN',
    incidentType,
    reason,
    matchedRules,
    needsJudge: false,
    unknownEntries: [],
  };
}

function hostIsIgnored(url: string | undefined, domains: string[]): boolean {
  if (!url || domains.length === 0) {
    return false;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function evaluateCheck(input: EvaluateInput): Analysis {
  const { navigation } = input;
  if (navigation.blocked) {
    return blockedResult();
  }
  if (navigation.error) {
    return brokenResult('UNREACHABLE', `Navigation impossible : ${navigation.error}`, []);
  }
  if (navigation.documentStatus !== null && navigation.documentStatus >= 400) {
    return brokenResult(
      'HTTP_ERROR',
      `Le document a répondu HTTP ${navigation.documentStatus}.`,
      [],
    );
  }

  const classified = input.entries.map((entry) => ({
    entry,
    rule: input.rules.find((rule) => ruleMatchesEntry(rule, entry)) ?? null,
  }));

  const counts = new Map<string, number>();
  const addCount = (rule: ErrorRule, count: number) => {
    counts.set(rule.id, (counts.get(rule.id) ?? 0) + count);
  };

  for (const item of classified) {
    if (item.rule?.verdict === 'BROKEN') {
      addCount(item.rule, item.entry.count);
    }
  }
  for (const rule of input.rules) {
    if (rule.verdict === 'BROKEN' && rule.domCheck && domMatches(rule, input.dom, input.visibleTextMinLength)) {
      addCount(rule, 1);
    }
  }

  const triggered = input.rules
    .map((rule) => ({ rule, count: counts.get(rule.id) ?? 0 }))
    .filter((item) => item.count >= (item.rule.minCount ?? 1) && item.count > 0);

  const broken = triggered.filter((item) => item.rule.verdict === 'BROKEN');
  if (broken.length > 0) {
    const winner = broken[0];
    if (!winner) {
      throw new Error('Règle BROKEN introuvable');
    }
    return brokenResult(
      winner.rule.incidentType ?? 'OTHER',
      winner.rule.description,
      broken.map((item) => ({ id: item.rule.id, count: item.count })),
    );
  }

  const remaining = classified.filter((item) => {
    if (item.rule?.verdict === 'IGNORE' || item.rule?.verdict === 'BROKEN') {
      return false;
    }
    if (input.noiseSignatures.has(item.entry.signature)) {
      return false;
    }
    return true;
  });

  const doubtfulCounts = new Map<string, number>();
  for (const item of remaining) {
    if (item.rule?.verdict === 'DOUBTFUL') {
      doubtfulCounts.set(item.rule.id, (doubtfulCounts.get(item.rule.id) ?? 0) + item.entry.count);
    }
  }
  for (const rule of input.rules) {
    if (
      rule.verdict === 'DOUBTFUL' &&
      rule.domCheck &&
      domMatches(rule, input.dom, input.visibleTextMinLength)
    ) {
      doubtfulCounts.set(rule.id, 1);
    }
  }

  const doubtful = input.rules
    .map((rule) => ({ rule, count: doubtfulCounts.get(rule.id) ?? 0 }))
    .filter((item) => item.rule.verdict === 'DOUBTFUL' && item.count >= (item.rule.minCount ?? 1) && item.count > 0);

  const unknown = remaining.filter((item) => {
    if (item.rule) {
      return false;
    }
    if (hostIsIgnored(item.entry.url, input.ignoredThirdPartyDomains)) {
      return false;
    }
    if (item.entry.isFirstParty === true) {
      return true;
    }
    return input.unknownThirdPartyPolicy === 'doubtful';
  });
  const unknownFirstParty = unknown
    .filter((item) => item.entry.isFirstParty === true)
    .map((item) => item.entry);

  if (doubtful.length > 0 || unknown.length > 0) {
    const reason =
      doubtful[0]?.rule.description ??
      'Entrées de log inconnues, revue nécessaire.';
    return {
      verdict: 'DOUBTFUL',
      incidentType: null,
      reason,
      matchedRules: doubtful.map((item) => ({ id: item.rule.id, count: item.count })),
      needsJudge: unknownFirstParty.length > 0,
      unknownEntries: unknownFirstParty,
    };
  }

  return {
    verdict: 'HEALTHY',
    incidentType: null,
    reason: 'Aucune erreur retenue.',
    matchedRules: [],
    needsJudge: false,
    unknownEntries: [],
  };
}

export function mergeAnalyses(analyses: Analysis[]): Analysis {
  if (analyses.length === 0) {
    return {
      verdict: 'DOUBTFUL',
      incidentType: null,
      reason: 'Aucune analyse produite.',
      matchedRules: [],
      needsJudge: false,
      unknownEntries: [],
    };
  }
  const ranked = [...analyses].sort((a, b) => VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict]);
  const winner = ranked[0];
  if (!winner) {
    throw new Error('Analyse introuvable');
  }
  const matched = new Map<string, number>();
  const unknown: LogEntry[] = [];
  for (const analysis of analyses) {
    for (const rule of analysis.matchedRules) {
      matched.set(rule.id, (matched.get(rule.id) ?? 0) + rule.count);
    }
    unknown.push(...analysis.unknownEntries);
  }
  return {
    ...winner,
    matchedRules: [...matched.entries()].map(([id, count]) => ({ id, count })),
    needsJudge: winner.verdict === 'DOUBTFUL' && analyses.some((item) => item.needsJudge),
    unknownEntries: winner.verdict === 'DOUBTFUL' ? unknown : [],
  };
}

import type { DomMetrics, LogEntry, NavigationInfo } from '../../common/types';
import { evaluateCheck } from '../../rules/evaluate';
import { ruleMatchesEntry } from '../../rules/evaluate';
import type { ErrorRule } from '../../rules/rules.schema';

export interface NoiseVisit {
  entries: LogEntry[];
  dom: DomMetrics;
  navigation: NavigationInfo;
}

export interface NoiseSignature {
  signature: string;
  source: string;
  sampleText: string;
  seenCount: number;
}

export interface NoiseProfileDraft {
  ok: boolean;
  reason: string;
  signatures: NoiseSignature[];
}

export function buildNoiseProfile(input: {
  visits: NoiseVisit[];
  rules: ErrorRule[];
  visibleTextMinLength: number;
  ignoredThirdPartyDomains: string[];
  unknownThirdPartyPolicy: 'ignore' | 'doubtful';
}): NoiseProfileDraft {
  if (input.visits.length === 0) {
    return { ok: false, reason: 'Aucune visite de calibration.', signatures: [] };
  }

  for (const visit of input.visits) {
    const analysis = evaluateCheck({
      entries: visit.entries,
      dom: visit.dom,
      navigation: visit.navigation,
      noiseSignatures: new Set(),
      rules: input.rules,
      visibleTextMinLength: input.visibleTextMinLength,
      ignoredThirdPartyDomains: input.ignoredThirdPartyDomains,
      unknownThirdPartyPolicy: input.unknownThirdPartyPolicy,
    });
    if (analysis.verdict === 'BROKEN' || analysis.verdict === 'BLOCKED') {
      return { ok: false, reason: `Calibration refusée : ${analysis.reason}`, signatures: [] };
    }
  }

  const needed = Math.ceil((input.visits.length * 2) / 3);
  const seen = new Map<string, NoiseSignature & { sample: LogEntry }>();
  for (const visit of input.visits) {
    const unique = new Set<string>();
    for (const entry of visit.entries) {
      if (unique.has(entry.signature)) {
        continue;
      }
      unique.add(entry.signature);
      const current = seen.get(entry.signature);
      if (current) {
        current.seenCount += 1;
      } else {
        seen.set(entry.signature, {
          signature: entry.signature,
          source: entry.source,
          sampleText: entry.text,
          seenCount: 1,
          sample: entry,
        });
      }
    }
  }

  const signatures = [...seen.values()]
    .filter((item) => item.seenCount >= needed)
    .filter((item) => !input.rules.some((rule) => rule.verdict === 'BROKEN' && ruleMatchesEntry(rule, item.sample)))
    .map(({ signature, source, sampleText, seenCount }) => ({ signature, source, sampleText, seenCount }));

  return { ok: true, reason: 'Profil de bruit enregistré.', signatures };
}

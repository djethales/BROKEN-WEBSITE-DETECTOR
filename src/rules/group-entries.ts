import type { LogEntry, LogSource } from '../common/types';
import { isFirstParty, normalizeText, signatureOf } from './normalize';

export interface RawLog {
  source: LogSource;
  level: string;
  text: string;
  url?: string;
  resourceType?: string;
  status?: string;
}

export function groupEntries(
  raw: RawLog[],
  pageUrl: string,
  maxEntries: number,
  maxTextLength: number,
): LogEntry[] {
  const grouped = new Map<string, LogEntry>();
  for (const item of raw) {
    const text = normalizeText(item.text, maxTextLength);
    const signature = signatureOf({
      source: item.source,
      resourceType: item.resourceType,
      url: item.url,
      text,
    });
    const existing = grouped.get(signature);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(signature, {
      source: item.source,
      level: item.level,
      text,
      url: item.url,
      resourceType: item.resourceType,
      status: item.status,
      isFirstParty: item.url ? isFirstParty(item.url, pageUrl) : true,
      signature,
      count: 1,
    });
  }
  return [...grouped.values()].slice(0, maxEntries);
}

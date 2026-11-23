import { createHash } from 'crypto';
import { parse } from 'tldts';

export function registrableDomain(rawUrl: string): string {
  const parsed = parse(rawUrl);
  return (parsed.domain ?? parsed.hostname ?? '').toLowerCase();
}

export function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isFirstParty(resourceUrl: string, pageUrl: string): boolean {
  const resource = registrableDomain(resourceUrl);
  const page = registrableDomain(pageUrl);
  if (!resource || !page) {
    return hostnameOf(resourceUrl) !== '' && hostnameOf(resourceUrl) === hostnameOf(pageUrl);
  }
  return resource === page;
}

export function domainMatches(rawUrl: string, domains: string[]): boolean {
  const host = hostnameOf(rawUrl);
  if (!host) {
    return false;
  }
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function normalizePath(pathname: string): string {
  return pathname
    .replace(/\.[a-f0-9]{6,}(?=\.)/gi, '.[hash]')
    .replace(/\/[a-f0-9]{16,}(?=\/|$)/gi, '/[hex]')
    .replace(/\/\d+(?=\/|$)/g, '/[n]');
}

export function normalizeText(input: string, maxLength: number): string {
  const withoutUrls = input.replace(/https?:\/\/[^\s)'"]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${normalizePath(parsed.pathname)}`;
    } catch {
      return url;
    }
  });
  const normalized = withoutUrls
    .replace(/\?[^\s)]*/g, '')
    .replace(/#[^\s)]*/g, '')
    .replace(/\b[a-f0-9]{16,}\b/gi, '[hex]')
    .replace(/\b[A-Za-z0-9+/]{24,}={0,2}\b/g, '[token]')
    .replace(/\b\d+\b/g, '[n]')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.slice(0, maxLength);
}

export function resourceParts(rawUrl: string | undefined): { host: string; path: string } {
  if (!rawUrl) {
    return { host: '', path: '' };
  }
  try {
    const parsed = new URL(rawUrl);
    return { host: parsed.hostname.toLowerCase(), path: normalizePath(parsed.pathname) };
  } catch {
    return { host: '', path: normalizePath(rawUrl) };
  }
}

export function signatureOf(parts: {
  source: string;
  resourceType?: string;
  url?: string;
  text: string;
}): string {
  const resource = resourceParts(parts.url);
  const material = [
    parts.source,
    parts.resourceType ?? '',
    resource.host,
    resource.path,
    parts.text,
  ].join('|');
  return createHash('sha1').update(material).digest('hex');
}

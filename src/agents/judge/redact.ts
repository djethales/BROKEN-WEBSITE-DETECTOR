const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_HEX = /\b[a-f0-9]{16,}\b/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{24,}\b/g;

export function redactForJudge(input: string): string {
  return input
    .replace(/https?:\/\/[^\s)'"]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return url;
      }
    })
    .replace(/\?[^#\s)]*/g, '')
    .replace(/#[^\s)]*/g, '')
    .replace(EMAIL, '[email]')
    .replace(LONG_HEX, '[hex]')
    .replace(LONG_TOKEN, '[token]')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isUnderDailyLimit(callsToday: number, limit: number): boolean {
  return callsToday < limit;
}

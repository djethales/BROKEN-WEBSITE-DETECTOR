export const VIEWPORT_SIZES = {
  desktop: { width: 1366, height: 768 },
  mobile: { width: 390, height: 844 },
} as const;

export type ViewportName = keyof typeof VIEWPORT_SIZES;

export const CHALLENGE_PATTERN =
  /just a moment|cf-browser-verification|cf-challenge|attention required|checking your browser|ddos-guard|captcha/i;

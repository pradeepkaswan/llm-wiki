export const MIN_CONTENT_LENGTH = 200; // D-04: named constant, not user-configurable

const PAYWALL_INDICATORS = [
  'subscribe to continue reading',
  'sign in to read',
  'create a free account to access',
]; // D-05: best-effort heuristic

export interface QualityResult {
  excluded: boolean;
  reason: string | null;
}

export function checkQuality(markdown: string): QualityResult {
  if (markdown.length < MIN_CONTENT_LENGTH) {
    return { excluded: true, reason: `content_too_short (${markdown.length} chars)` };
  }
  const lower = markdown.toLowerCase();
  for (const indicator of PAYWALL_INDICATORS) {
    if (lower.includes(indicator)) {
      return { excluded: true, reason: `paywall_detected: "${indicator}"` };
    }
  }
  return { excluded: false, reason: null };
}

const FETCH_TIMEOUT_MS = 15_000; // D-18: 15 second timeout
const USER_AGENT = 'Mozilla/5.0 (compatible; LLMWiki/1.0; +https://github.com/user/llm-wiki)';

export interface FetchResult {
  body: ArrayBuffer;
  contentType: string;
}

export function isPdf(url: string, contentType: string): boolean {
  return url.toLowerCase().endsWith('.pdf') || contentType.includes('application/pdf');
}

export function normalizeArxivUrl(url: string): string {
  // D-17: Convert PDF links to abstract pages for better Readability extraction
  // e.g. https://arxiv.org/pdf/2307.08691 → https://arxiv.org/abs/2307.08691
  return url.replace(/arxiv\.org\/pdf\//, 'arxiv.org/abs/');
}

export async function fetchUrl(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    const body = await res.arrayBuffer();
    return { body, contentType };
  } finally {
    clearTimeout(timer);
  }
}

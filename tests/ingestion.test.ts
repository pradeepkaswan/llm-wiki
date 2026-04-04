import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Module-level mock for pdf-parse — hoisted automatically by vitest
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    async parse(_buf: Buffer) {
      return { text: 'First paragraph of content.\n\nSecond paragraph here.' };
    }
  },
}));

// ─── fetcher tests ────────────────────────────────────────────────────────────

describe('fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isPdf returns true for .pdf URL extension', async () => {
    const { isPdf } = await import('../src/ingestion/fetcher.js');
    expect(isPdf('https://example.com/paper.pdf', 'text/html')).toBe(true);
  });

  it('isPdf returns true for application/pdf content type', async () => {
    const { isPdf } = await import('../src/ingestion/fetcher.js');
    expect(isPdf('https://example.com/paper', 'application/pdf')).toBe(true);
  });

  it('isPdf returns false for text/html content type', async () => {
    const { isPdf } = await import('../src/ingestion/fetcher.js');
    expect(isPdf('https://example.com/page', 'text/html')).toBe(false);
  });

  it('normalizeArxivUrl converts arxiv.org/pdf/ to arxiv.org/abs/', async () => {
    const { normalizeArxivUrl } = await import('../src/ingestion/fetcher.js');
    expect(normalizeArxivUrl('https://arxiv.org/pdf/2307.08691')).toBe(
      'https://arxiv.org/abs/2307.08691'
    );
  });

  it('normalizeArxivUrl leaves non-arxiv URLs unchanged', async () => {
    const { normalizeArxivUrl } = await import('../src/ingestion/fetcher.js');
    const url = 'https://example.com/pdf/some-doc';
    expect(normalizeArxivUrl(url)).toBe(url);
  });

  it('fetchUrl sends request with User-Agent header containing LLMWiki', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchUrl } = await import('../src/ingestion/fetcher.js');
    await fetchUrl('https://example.com');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('LLMWiki');
  });

  it('fetchUrl throws on non-2xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => 'text/html' },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchUrl } = await import('../src/ingestion/fetcher.js');
    await expect(fetchUrl('https://example.com/missing')).rejects.toThrow('HTTP 404');
  });

  it('fetchUrl returns body and contentType on success', async () => {
    const buf = new ArrayBuffer(16);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
      arrayBuffer: () => Promise.resolve(buf),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { fetchUrl } = await import('../src/ingestion/fetcher.js');
    const result = await fetchUrl('https://example.com');
    expect(result.body).toBe(buf);
    expect(result.contentType).toBe('text/html; charset=utf-8');
  });

  it('fetchUrl aborts after timeout using AbortController', async () => {
    let capturedSignal: AbortSignal | undefined;
    const mockFetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      capturedSignal = options.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        if (options.signal) {
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        }
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    vi.useFakeTimers();
    const { fetchUrl } = await import('../src/ingestion/fetcher.js');
    const fetchPromise = fetchUrl('https://slow.example.com');
    vi.advanceTimersByTime(15001);
    await expect(fetchPromise).rejects.toThrow();
    vi.useRealTimers();
  });
});

// ─── extractor tests ──────────────────────────────────────────────────────────

describe('extractor', () => {
  it('extractFromHtml returns { title, markdown } for valid article HTML', async () => {
    const { extractFromHtml } = await import('../src/ingestion/extractor.js');
    const html = `
      <html>
        <head><title>Test Article</title></head>
        <body>
          <article>
            <h1>Test Article</h1>
            <p>This is the article content with enough text to be recognized by Readability as a proper article.</p>
            <p>Second paragraph with more content to ensure extraction works properly and returns meaningful markdown.</p>
          </article>
        </body>
      </html>
    `;
    const result = extractFromHtml(html, 'https://example.com/article');
    expect(result).not.toBeNull();
    expect(result!.title).toBeTruthy();
    expect(result!.markdown).toBeTruthy();
  });

  it('extractFromHtml returns null for empty HTML (no parseable content)', async () => {
    const { extractFromHtml } = await import('../src/ingestion/extractor.js');
    // Readability returns null when there is literally no document to parse
    const html = '';
    const result = extractFromHtml(html, 'https://example.com');
    expect(result).toBeNull();
  });

  it('extractFromHtml passes URL to JSDOM for relative link resolution', async () => {
    const { extractFromHtml } = await import('../src/ingestion/extractor.js');
    const html = `
      <html>
        <head><title>Article with Links</title></head>
        <body>
          <article>
            <p>Here is some <a href="/relative/path">relative link</a> in the content.</p>
            <p>And more content to ensure Readability processes this as an article with enough text.</p>
          </article>
        </body>
      </html>
    `;
    const result = extractFromHtml(html, 'https://example.com');
    expect(result).not.toBeNull();
    // URL passed to JSDOM means relative links get resolved — we just verify extraction works
    expect(result!.markdown).toBeTruthy();
  });
});

// ─── pdf-extractor tests ──────────────────────────────────────────────────────

describe('pdf-extractor', () => {
  it('extractFromPdf returns markdown string from PDF buffer', async () => {
    const { extractFromPdf } = await import('../src/ingestion/pdf-extractor.js');
    const buffer = new ArrayBuffer(8);
    const result = await extractFromPdf(buffer);
    expect(typeof result).toBe('string');
    expect(result).toContain('First paragraph');
    expect(result).toContain('Second paragraph');
  });
});

// ─── quality tests ────────────────────────────────────────────────────────────

describe('quality', () => {
  it('checkQuality returns excluded=false for content >= 200 chars', async () => {
    const { checkQuality } = await import('../src/ingestion/quality.js');
    const longContent = 'a'.repeat(200);
    const result = checkQuality(longContent);
    expect(result.excluded).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('checkQuality returns excluded=true with content_too_short reason for content < 200 chars', async () => {
    const { checkQuality } = await import('../src/ingestion/quality.js');
    const shortContent = 'too short';
    const result = checkQuality(shortContent);
    expect(result.excluded).toBe(true);
    expect(result.reason).toMatch(/content_too_short/);
  });

  it('checkQuality returns excluded=true with paywall_detected reason for paywall content', async () => {
    const { checkQuality } = await import('../src/ingestion/quality.js');
    // Pad to >= 200 chars to ensure content_too_short check does not fire first
    const padding = ' '.repeat(150);
    const paywallContent = `Some article text...${padding} subscribe to continue reading more of this content.`;
    const result = checkQuality(paywallContent);
    expect(result.excluded).toBe(true);
    expect(result.reason).toMatch(/paywall_detected/);
  });

  it('checkQuality detects sign in to read paywall indicator', async () => {
    const { checkQuality } = await import('../src/ingestion/quality.js');
    // Pad to >= 200 chars to ensure content_too_short check does not fire first
    const padding = ' '.repeat(150);
    const content = `Article preview with enough text.${padding} Sign in to read the full article and access premium features.`;
    const result = checkQuality(content);
    expect(result.excluded).toBe(true);
    expect(result.reason).toMatch(/paywall_detected/);
  });
});

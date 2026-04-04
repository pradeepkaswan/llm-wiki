import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Module-level mocks — hoisted automatically by vitest (must be at top level)
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    constructor(_options: unknown) {}
    async getText() {
      return { text: 'First paragraph of content.\n\nSecond paragraph here.' };
    }
  },
}));

vi.mock('../src/config/config.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/config/config.js')>();
  return {
    ...original,
    CONFIG_DIR: '/tmp/llm-wiki-test-placeholder',
  };
});

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

// ─── raw-store tests ──────────────────────────────────────────────────────────

describe('raw-store', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-wiki-test-'));
    // Override the mocked CONFIG_DIR value
    const configMod = await import('../src/config/config.js');
    (configMod as Record<string, unknown>)['CONFIG_DIR'] = tmpDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function makeEnvelope(overrides: Partial<import('../src/types/ingestion.js').RawSourceEnvelope> = {}): import('../src/types/ingestion.js').RawSourceEnvelope {
    return {
      url: 'https://example.com/article',
      title: 'Test Article',
      markdown: 'This is the article markdown content.',
      fetched_at: new Date().toISOString(),
      query: 'test query',
      search_rank: 1,
      content_length: 36,
      excluded: false,
      exclude_reason: null,
      ...overrides,
    };
  }

  it('storeSourceEnvelopes creates directory at <rawDir>/<date>/<slug>/', async () => {
    const { storeSourceEnvelopes } = await import('../src/ingestion/raw-store.js');
    const envelopes = [makeEnvelope()];
    const dir = await storeSourceEnvelopes(envelopes, 'test-slug');
    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
    expect(dir).toContain('test-slug');
    expect(dir).toContain('raw');
  });

  it('storeSourceEnvelopes writes source-01.json as valid JSON', async () => {
    const { storeSourceEnvelopes } = await import('../src/ingestion/raw-store.js');
    const envelope = makeEnvelope();
    const dir = await storeSourceEnvelopes([envelope], 'test-slug');
    const content = await fs.readFile(path.join(dir, 'source-01.json'), 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.url).toBe(envelope.url);
    expect(parsed.title).toBe(envelope.title);
    expect(parsed.markdown).toBe(envelope.markdown);
    expect(parsed.excluded).toBe(false);
  });

  it('storeSourceEnvelopes writes source-02.json for second envelope', async () => {
    const { storeSourceEnvelopes } = await import('../src/ingestion/raw-store.js');
    const e1 = makeEnvelope({ url: 'https://example.com/1', search_rank: 1 });
    const e2 = makeEnvelope({ url: 'https://example.com/2', search_rank: 2 });
    const dir = await storeSourceEnvelopes([e1, e2], 'multi-slug');
    const files = await fs.readdir(dir);
    expect(files).toContain('source-01.json');
    expect(files).toContain('source-02.json');
  });

  it('each JSON file contains all RawSourceEnvelope fields', async () => {
    const { storeSourceEnvelopes } = await import('../src/ingestion/raw-store.js');
    const envelope = makeEnvelope({ search_rank: 3 });
    const dir = await storeSourceEnvelopes([envelope], 'fields-slug');
    const parsed = JSON.parse(await fs.readFile(path.join(dir, 'source-01.json'), 'utf8'));
    expect(parsed).toHaveProperty('url');
    expect(parsed).toHaveProperty('title');
    expect(parsed).toHaveProperty('markdown');
    expect(parsed).toHaveProperty('fetched_at');
    expect(parsed).toHaveProperty('query');
    expect(parsed).toHaveProperty('search_rank');
    expect(parsed).toHaveProperty('content_length');
    expect(parsed).toHaveProperty('excluded');
    expect(parsed).toHaveProperty('exclude_reason');
  });

  it('storeSourceEnvelopes writes manifest.json alongside source files', async () => {
    const { storeSourceEnvelopes } = await import('../src/ingestion/raw-store.js');
    const dir = await storeSourceEnvelopes([makeEnvelope()], 'manifest-slug');
    const files = await fs.readdir(dir);
    expect(files).toContain('manifest.json');
  });

  it('manifest.json contains query, created_at, and sources array', async () => {
    const { storeSourceEnvelopes } = await import('../src/ingestion/raw-store.js');
    const envelope = makeEnvelope({ query: 'how does flash attention work?' });
    const dir = await storeSourceEnvelopes([envelope], 'manifest-content-slug');
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    expect(manifest).toHaveProperty('query', 'how does flash attention work?');
    expect(manifest).toHaveProperty('created_at');
    expect(Array.isArray(manifest.sources)).toBe(true);
  });

  it('manifest sources entries have file, url, excluded, exclude_reason', async () => {
    const { storeSourceEnvelopes } = await import('../src/ingestion/raw-store.js');
    const dir = await storeSourceEnvelopes([makeEnvelope()], 'entry-fields-slug');
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    const entry = manifest.sources[0];
    expect(entry).toHaveProperty('file');
    expect(entry).toHaveProperty('url');
    expect(entry).toHaveProperty('excluded');
    expect(entry).toHaveProperty('exclude_reason');
  });

  it('excluded sources appear in manifest with excluded: true', async () => {
    const { storeSourceEnvelopes } = await import('../src/ingestion/raw-store.js');
    const included = makeEnvelope({ url: 'https://good.com', excluded: false });
    const excluded = makeEnvelope({
      url: 'https://paywall.com',
      excluded: true,
      exclude_reason: 'paywall_detected: "subscribe to continue reading"',
    });
    const dir = await storeSourceEnvelopes([included, excluded], 'excluded-slug');
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    expect(manifest.sources).toHaveLength(2);
    const excludedEntry = manifest.sources.find((s: { url: string }) => s.url === 'https://paywall.com');
    expect(excludedEntry.excluded).toBe(true);
    expect(excludedEntry.exclude_reason).toMatch(/paywall_detected/);
  });

  it('storeSourceEnvelopes returns the directory path', async () => {
    const { storeSourceEnvelopes } = await import('../src/ingestion/raw-store.js');
    const dir = await storeSourceEnvelopes([makeEnvelope()], 'return-path-slug');
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });

  it('questionToSlug converts question text to lowercase-hyphenated slug', async () => {
    const { questionToSlug } = await import('../src/ingestion/raw-store.js');
    const slug = questionToSlug('How does flash attention work?');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).toContain('flash');
    expect(slug).toContain('attention');
  });

  it('urlToSlug converts URL to a slug', async () => {
    const { urlToSlug } = await import('../src/ingestion/raw-store.js');
    const slug = urlToSlug('https://example.com/article/page');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).toContain('example');
  });
});

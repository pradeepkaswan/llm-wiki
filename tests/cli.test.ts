import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);
const CLI = `npx tsx ${path.resolve('./src/index.ts')}`;

// Helper: run CLI command, capture stdout and stderr separately
async function runCLI(args: string): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execAsync(`${CLI} ${args}`, {
      cwd: path.resolve('.'),
      timeout: 15000,
    });
    return { stdout, stderr, code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

describe('CLI stdout/stderr separation (INTG-02)', () => {
  it('wiki ask produces nothing on stdout', async () => {
    const { stdout } = await runCLI('ask "How does attention work?"');
    expect(stdout.trim()).toBe('');
  });

  it('wiki ask writes progress to stderr', async () => {
    const { stderr } = await runCLI('ask "How does attention work?"');
    // After wiring, ask command writes "Searching for:" to stderr (or error message)
    // Either searching message or an error — both go to stderr
    expect(stderr.length).toBeGreaterThan(0);
  });

  it('wiki ingest produces nothing on stdout', async () => {
    const { stdout } = await runCLI('ingest https://example.com');
    expect(stdout.trim()).toBe('');
  });

  it('wiki --help output goes to stderr (not stdout)', async () => {
    const { stdout, stderr } = await runCLI('--help');
    // configureOutput redirects Commander help to stderr
    expect(stdout.trim()).toBe('');
    expect(stderr).toContain('wiki');
  });
});

describe('CLI commands wire correctly (FOUND-01)', () => {
  it('wiki list exits 0', async () => {
    const { code } = await runCLI('list');
    expect(code).toBe(0);
  });

  it('wiki search exits 0 against empty vault', async () => {
    const { code, stdout } = await runCLI('search "anything"');
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('[]'); // empty JSON array to stdout
  });
});

// --- Unit tests for wired ask command (using vi.mock) ---

describe('ask command — ingestion pipeline wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wires search -> fetch -> extract -> quality -> store', async () => {
    // Mock all dependencies
    vi.doMock('../src/config/config.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        vault_path: '/tmp/test-vault',
        llm_provider: 'claude',
        search_provider: 'exa',
      }),
    }));

    vi.doMock('../src/search/search-provider.js', () => ({
      createSearchProvider: vi.fn().mockReturnValue({
        search: vi.fn().mockResolvedValue([
          { url: 'https://example.com/article', title: 'Test Article', rank: 1 },
        ]),
      }),
    }));

    vi.doMock('../src/ingestion/fetcher.js', () => ({
      fetchUrl: vi.fn().mockResolvedValue({
        body: new TextEncoder().encode('<html><body><article>Test content about AI</article></body></html>').buffer,
        contentType: 'text/html',
      }),
      isPdf: vi.fn().mockReturnValue(false),
      normalizeArxivUrl: vi.fn().mockImplementation((url: string) => url),
    }));

    vi.doMock('../src/ingestion/extractor.js', () => ({
      extractFromHtml: vi.fn().mockReturnValue({
        title: 'Test Article',
        markdown: 'Test content about AI. '.repeat(50), // enough to pass quality
      }),
    }));

    vi.doMock('../src/ingestion/pdf-extractor.js', () => ({
      extractFromPdf: vi.fn().mockResolvedValue('PDF content'),
    }));

    vi.doMock('../src/ingestion/quality.js', () => ({
      checkQuality: vi.fn().mockReturnValue({ excluded: false, reason: null }),
    }));

    const storedDir = '/tmp/.llm-wiki/raw/2026-04-04/test-question';
    vi.doMock('../src/ingestion/raw-store.js', () => ({
      storeSourceEnvelopes: vi.fn().mockResolvedValue(storedDir),
      questionToSlug: vi.fn().mockReturnValue('test-question'),
    }));

    // Import command after mocks are set up
    const { askCommand } = await import('../src/commands/ask.js');

    // Spy on stderr to verify output goes there
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // Note: when calling askCommand.parseAsync directly (not via program),
    // Commander strips argv[0] and argv[1], so pass ['node', 'script', '<question>']
    await askCommand.parseAsync(['node', 'wiki', 'test question']);

    // Verify stderr was used (not stdout)
    expect(stderrSpy).toHaveBeenCalled();
    // Verify process.exit(1) was NOT called (happy path)
    expect(exitSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('writes nothing to stdout', async () => {
    vi.doMock('../src/config/config.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        vault_path: '/tmp/test-vault',
        llm_provider: 'claude',
        search_provider: 'exa',
      }),
    }));

    vi.doMock('../src/search/search-provider.js', () => ({
      createSearchProvider: vi.fn().mockReturnValue({
        search: vi.fn().mockResolvedValue([
          { url: 'https://example.com/article', title: 'Test Article', rank: 1 },
        ]),
      }),
    }));

    vi.doMock('../src/ingestion/fetcher.js', () => ({
      fetchUrl: vi.fn().mockResolvedValue({
        body: new TextEncoder().encode('<html><body>Content</body></html>').buffer,
        contentType: 'text/html',
      }),
      isPdf: vi.fn().mockReturnValue(false),
      normalizeArxivUrl: vi.fn().mockImplementation((url: string) => url),
    }));

    vi.doMock('../src/ingestion/extractor.js', () => ({
      extractFromHtml: vi.fn().mockReturnValue({
        title: 'Article',
        markdown: 'Long content here. '.repeat(60),
      }),
    }));

    vi.doMock('../src/ingestion/pdf-extractor.js', () => ({
      extractFromPdf: vi.fn().mockResolvedValue(''),
    }));

    vi.doMock('../src/ingestion/quality.js', () => ({
      checkQuality: vi.fn().mockReturnValue({ excluded: false, reason: null }),
    }));

    vi.doMock('../src/ingestion/raw-store.js', () => ({
      storeSourceEnvelopes: vi.fn().mockResolvedValue('/tmp/dir'),
      questionToSlug: vi.fn().mockReturnValue('test'),
    }));

    const { askCommand } = await import('../src/commands/ask.js');

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await askCommand.parseAsync(['node', 'wiki', 'test question']);

    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it('exits non-zero when all sources are excluded', async () => {
    vi.doMock('../src/config/config.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        vault_path: '/tmp/test-vault',
        llm_provider: 'claude',
        search_provider: 'exa',
      }),
    }));

    vi.doMock('../src/search/search-provider.js', () => ({
      createSearchProvider: vi.fn().mockReturnValue({
        search: vi.fn().mockResolvedValue([
          { url: 'https://example.com/paywall', title: 'Paywalled', rank: 1 },
        ]),
      }),
    }));

    vi.doMock('../src/ingestion/fetcher.js', () => ({
      fetchUrl: vi.fn().mockResolvedValue({
        body: new TextEncoder().encode('<html><body>Subscribe</body></html>').buffer,
        contentType: 'text/html',
      }),
      isPdf: vi.fn().mockReturnValue(false),
      normalizeArxivUrl: vi.fn().mockImplementation((url: string) => url),
    }));

    vi.doMock('../src/ingestion/extractor.js', () => ({
      extractFromHtml: vi.fn().mockReturnValue({ title: 'Short', markdown: 'Too short' }),
    }));

    vi.doMock('../src/ingestion/pdf-extractor.js', () => ({
      extractFromPdf: vi.fn().mockResolvedValue(''),
    }));

    vi.doMock('../src/ingestion/quality.js', () => ({
      checkQuality: vi.fn().mockReturnValue({ excluded: true, reason: 'too_short' }),
    }));

    vi.doMock('../src/ingestion/raw-store.js', () => ({
      storeSourceEnvelopes: vi.fn().mockResolvedValue('/tmp/dir'),
      questionToSlug: vi.fn().mockReturnValue('test'),
    }));

    const { askCommand } = await import('../src/commands/ask.js');

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await askCommand.parseAsync(['node', 'wiki', 'test question']);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

// --- Unit tests for wired ingest command (using vi.mock) ---

describe('ingest command — URL ingestion pipeline wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wires fetch -> extract -> quality -> store for a web URL', async () => {
    vi.doMock('../src/ingestion/fetcher.js', () => ({
      fetchUrl: vi.fn().mockResolvedValue({
        body: new TextEncoder().encode('<html><body><article>Article content here</article></body></html>').buffer,
        contentType: 'text/html',
      }),
      isPdf: vi.fn().mockReturnValue(false),
      normalizeArxivUrl: vi.fn().mockImplementation((url: string) => url),
    }));

    vi.doMock('../src/ingestion/extractor.js', () => ({
      extractFromHtml: vi.fn().mockReturnValue({
        title: 'Test Article',
        markdown: 'Article content here. '.repeat(60),
      }),
    }));

    vi.doMock('../src/ingestion/pdf-extractor.js', () => ({
      extractFromPdf: vi.fn().mockResolvedValue(''),
    }));

    vi.doMock('../src/ingestion/quality.js', () => ({
      checkQuality: vi.fn().mockReturnValue({ excluded: false, reason: null }),
    }));

    const storedDir = '/tmp/.llm-wiki/raw/2026-04-04/example-com';
    const storeEnvelopesMock = vi.fn().mockResolvedValue(storedDir);
    vi.doMock('../src/ingestion/raw-store.js', () => ({
      storeSourceEnvelopes: storeEnvelopesMock,
      urlToSlug: vi.fn().mockReturnValue('example-com'),
    }));

    const { ingestCommand } = await import('../src/commands/ingest.js');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // Note: when calling ingestCommand.parseAsync directly (not via program),
    // Commander strips argv[0] and argv[1], so pass ['node', 'script', '<url>']
    await ingestCommand.parseAsync(['node', 'wiki', 'https://example.com']);

    // Verify storeSourceEnvelopes was called
    expect(storeEnvelopesMock).toHaveBeenCalledOnce();
    // Verify stderr was used
    expect(stderrSpy).toHaveBeenCalled();
    // Verify no error exit
    expect(exitSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('writes nothing to stdout', async () => {
    vi.doMock('../src/ingestion/fetcher.js', () => ({
      fetchUrl: vi.fn().mockResolvedValue({
        body: new TextEncoder().encode('<html><body>Content</body></html>').buffer,
        contentType: 'text/html',
      }),
      isPdf: vi.fn().mockReturnValue(false),
      normalizeArxivUrl: vi.fn().mockImplementation((url: string) => url),
    }));

    vi.doMock('../src/ingestion/extractor.js', () => ({
      extractFromHtml: vi.fn().mockReturnValue({ title: 'Title', markdown: 'Content. '.repeat(60) }),
    }));

    vi.doMock('../src/ingestion/pdf-extractor.js', () => ({
      extractFromPdf: vi.fn().mockResolvedValue(''),
    }));

    vi.doMock('../src/ingestion/quality.js', () => ({
      checkQuality: vi.fn().mockReturnValue({ excluded: false, reason: null }),
    }));

    vi.doMock('../src/ingestion/raw-store.js', () => ({
      storeSourceEnvelopes: vi.fn().mockResolvedValue('/tmp/dir'),
      urlToSlug: vi.fn().mockReturnValue('example-com'),
    }));

    const { ingestCommand } = await import('../src/commands/ingest.js');

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // Note: when calling ingestCommand.parseAsync directly (not via program),
    // Commander strips argv[0] and argv[1], so pass ['node', 'script', '<url>']
    await ingestCommand.parseAsync(['node', 'wiki', 'https://example.com']);

    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it('stores envelope with query=null and search_rank=null for direct ingest', async () => {
    vi.doMock('../src/ingestion/fetcher.js', () => ({
      fetchUrl: vi.fn().mockResolvedValue({
        body: new TextEncoder().encode('<html><body>Content</body></html>').buffer,
        contentType: 'text/html',
      }),
      isPdf: vi.fn().mockReturnValue(false),
      normalizeArxivUrl: vi.fn().mockImplementation((url: string) => url),
    }));

    vi.doMock('../src/ingestion/extractor.js', () => ({
      extractFromHtml: vi.fn().mockReturnValue({ title: 'Title', markdown: 'Content. '.repeat(60) }),
    }));

    vi.doMock('../src/ingestion/pdf-extractor.js', () => ({
      extractFromPdf: vi.fn().mockResolvedValue(''),
    }));

    vi.doMock('../src/ingestion/quality.js', () => ({
      checkQuality: vi.fn().mockReturnValue({ excluded: false, reason: null }),
    }));

    const storeEnvelopesMock = vi.fn().mockResolvedValue('/tmp/dir');
    vi.doMock('../src/ingestion/raw-store.js', () => ({
      storeSourceEnvelopes: storeEnvelopesMock,
      urlToSlug: vi.fn().mockReturnValue('example-com'),
    }));

    const { ingestCommand } = await import('../src/commands/ingest.js');

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // Note: when calling ingestCommand.parseAsync directly (not via program),
    // Commander strips argv[0] and argv[1], so pass ['node', 'script', '<url>']
    await ingestCommand.parseAsync(['node', 'wiki', 'https://example.com/article']);

    // Verify the stored envelope has query=null and search_rank=null
    expect(storeEnvelopesMock).toHaveBeenCalledOnce();
    const [envelopes] = storeEnvelopesMock.mock.calls[0] as [Array<{ query: null; search_rank: null }>];
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].query).toBeNull();
    expect(envelopes[0].search_rank).toBeNull();
  });

  it('exits non-zero if fetch fails', async () => {
    vi.doMock('../src/ingestion/fetcher.js', () => ({
      fetchUrl: vi.fn().mockRejectedValue(new Error('Network error')),
      isPdf: vi.fn().mockReturnValue(false),
      normalizeArxivUrl: vi.fn().mockImplementation((url: string) => url),
    }));

    vi.doMock('../src/ingestion/extractor.js', () => ({
      extractFromHtml: vi.fn(),
    }));

    vi.doMock('../src/ingestion/pdf-extractor.js', () => ({
      extractFromPdf: vi.fn(),
    }));

    vi.doMock('../src/ingestion/quality.js', () => ({
      checkQuality: vi.fn(),
    }));

    vi.doMock('../src/ingestion/raw-store.js', () => ({
      storeSourceEnvelopes: vi.fn(),
      urlToSlug: vi.fn().mockReturnValue('example-com'),
    }));

    const { ingestCommand } = await import('../src/commands/ingest.js');

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // Note: when calling ingestCommand.parseAsync directly (not via program),
    // Commander strips argv[0] and argv[1], so pass ['node', 'script', '<url>']
    await ingestCommand.parseAsync(['node', 'wiki', 'https://example.com']);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('debug mock', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('synthesizer mock works', async () => {
    vi.doMock('../src/config/config.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        vault_path: '/tmp/test-vault',
        llm_provider: 'claude',
        search_provider: 'exa',
        coverage_threshold: 5.0,
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

    const synthesizeMock = vi.fn().mockResolvedValue({
      articles: [{ frontmatter: { title: 'Test' }, slug: 'test', body: '' }],
      updatedSlugs: [],
    });
    vi.doMock('../src/synthesis/synthesizer.js', () => ({
      synthesize: synthesizeMock,
    }));

    vi.doMock('../src/store/wiki-store.js', () => ({
      WikiStore: class MockWikiStore {
        constructor() {}
      },
    }));

    // Phase 5: mock assessCoverage to return not covered — fall through to web search
    vi.doMock('../src/retrieval/orchestrator.js', () => ({
      assessCoverage: vi.fn().mockResolvedValue({ covered: false, articles: [] }),
    }));

    vi.doMock('../src/retrieval/wiki-answer.js', () => ({
      generateWikiAnswer: vi.fn(),
    }));

    vi.doMock('../src/retrieval/article-filer.js', () => ({
      fileAnswerAsArticle: vi.fn(),
    }));

    const { askCommand } = await import('../src/commands/ask.js');

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await askCommand.parseAsync(['node', 'wiki', 'test question']);

    console.log('exit called:', exitSpy.mock.calls);
    console.log('synthesize called:', synthesizeMock.mock.calls.length);
    expect(exitSpy).not.toHaveBeenCalled();
    
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

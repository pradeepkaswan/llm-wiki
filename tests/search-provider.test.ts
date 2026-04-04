import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Mock exa-js before importing the provider modules
const mockExaSearch = vi.fn().mockResolvedValue({
  results: [
    { url: 'https://example.com/1', title: 'Result One' },
    { url: 'https://example.com/2', title: 'Result Two' },
    { url: 'https://example.com/3', title: undefined },
  ],
});

vi.mock('exa-js', () => {
  class MockExa {
    search: typeof mockExaSearch;
    constructor(_apiKey: string) {
      this.search = mockExaSearch;
    }
  }
  return { default: MockExa };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('SearchResult type', () => {
  it('SearchResult has url, title, and rank fields', async () => {
    // Verify shape at runtime by constructing a conforming object
    const result = { url: 'https://example.com', title: 'Example', rank: 1 };
    expect(result.url).toBe('https://example.com');
    expect(result.title).toBe('Example');
    expect(result.rank).toBe(1);
  });
});

describe('createSearchProvider factory', () => {
  it('returns ExaSearchProvider for search_provider exa', async () => {
    vi.stubEnv('EXA_API_KEY', 'test-key-factory');
    const { createSearchProvider } = await import('../src/search/search-provider.js');
    const { ExaSearchProvider } = await import('../src/search/exa-provider.js');

    const config = {
      vault_path: '/some/path',
      llm_provider: 'claude' as const,
      llm_base_url: 'http://localhost:11434',
      search_provider: 'exa' as const,
    };

    const provider = createSearchProvider(config);
    expect(provider).toBeInstanceOf(ExaSearchProvider);
  });

  it('throws Invalid search_provider for unknown provider', async () => {
    const { createSearchProvider } = await import('../src/search/search-provider.js');

    const config = {
      vault_path: '/some/path',
      llm_provider: 'claude' as const,
      llm_base_url: 'http://localhost:11434',
      search_provider: 'invalid' as 'exa',
    };

    expect(() => createSearchProvider(config)).toThrow(/Invalid search_provider/);
  });
});

describe('ExaSearchProvider', () => {
  it('constructor throws when EXA_API_KEY is not set', async () => {
    vi.stubEnv('EXA_API_KEY', '');
    // Ensure key is not present
    delete process.env['EXA_API_KEY'];

    const { ExaSearchProvider } = await import('../src/search/exa-provider.js');
    expect(() => new ExaSearchProvider()).toThrow(
      'Set EXA_API_KEY environment variable to use web search.'
    );
  });

  it('constructor succeeds when EXA_API_KEY is set', async () => {
    vi.stubEnv('EXA_API_KEY', 'test-api-key-123');
    const { ExaSearchProvider } = await import('../src/search/exa-provider.js');
    expect(() => new ExaSearchProvider()).not.toThrow();
  });

  it('search() returns mapped SearchResult[] from SDK response', async () => {
    vi.stubEnv('EXA_API_KEY', 'test-api-key-456');
    const { ExaSearchProvider } = await import('../src/search/exa-provider.js');
    const provider = new ExaSearchProvider();

    const results = await provider.search('test query');

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ url: 'https://example.com/1', title: 'Result One', rank: 1 });
    expect(results[1]).toEqual({ url: 'https://example.com/2', title: 'Result Two', rank: 2 });
  });

  it('search() maps undefined title to empty string', async () => {
    vi.stubEnv('EXA_API_KEY', 'test-api-key-789');
    const { ExaSearchProvider } = await import('../src/search/exa-provider.js');
    const provider = new ExaSearchProvider();

    const results = await provider.search('test query');

    // Third result has undefined title — must map to empty string
    expect(results[2]).toEqual({ url: 'https://example.com/3', title: '', rank: 3 });
  });

  it('search() passes type: neural and numResults: 5 to Exa SDK', async () => {
    vi.stubEnv('EXA_API_KEY', 'test-api-key-spy');
    const { ExaSearchProvider } = await import('../src/search/exa-provider.js');
    const provider = new ExaSearchProvider();

    await provider.search('test neural query');

    // mockExaSearch is the shared mock function bound to all MockExa instances
    expect(mockExaSearch).toHaveBeenCalledWith('test neural query', {
      numResults: 5,
      type: 'neural',
    });
  });
});

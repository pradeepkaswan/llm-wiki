import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM adapter — must be declared before any imports that use it
vi.mock('../src/llm/adapter.js', () => ({
  generateText: vi.fn(),
}));

// Mock the search index — used by assessCoverage
vi.mock('../src/search/search-index.js', () => ({
  buildIndex: vi.fn().mockReturnValue({}),
  search: vi.fn().mockReturnValue([]),
}));

import { generateText } from '../src/llm/adapter.js';
import { buildIndex, search } from '../src/search/search-index.js';
import { assessCoverage } from '../src/retrieval/orchestrator.js';
import { generateWikiAnswer } from '../src/retrieval/wiki-answer.js';
import { buildWikiAnswerPrompt, WIKI_CONTEXT_MAX_CHARS } from '../src/retrieval/prompt-builder.js';
import { DEFAULTS, validateConfig } from '../src/config/config.js';
import type { Article, Frontmatter } from '../src/types/article.js';
import type { Config } from '../src/config/config.js';

// --- Mock WikiStore ---

class MockWikiStore {
  private articles = new Map<string, Article>();

  slugify(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async saveArticle(article: Article): Promise<string> {
    this.articles.set(article.slug, article);
    return `/tmp/vault/articles/${article.slug}.md`;
  }

  async listArticles(): Promise<Article[]> {
    return Array.from(this.articles.values());
  }

  async getArticle(slug: string): Promise<Article | null> {
    return this.articles.get(slug) ?? null;
  }

  seedArticle(article: Article): void {
    this.articles.set(article.slug, article);
  }
}

// --- Fixture helpers ---

function makeArticle(slug: string, title: string, body: string): Article {
  const frontmatter: Frontmatter = {
    title,
    tags: ['test'],
    categories: ['Test'],
    sources: ['https://example.com'],
    sourced_at: '2026-04-04T00:00:00.000Z',
    type: 'web',
    created_at: '2026-04-04T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
    summary: `Summary of ${title}`,
  };
  return { slug, frontmatter, body };
}

// --- Tests ---

describe('Config coverage_threshold', () => {
  it('DEFAULTS has coverage_threshold === 5.0', () => {
    expect(DEFAULTS.coverage_threshold).toBe(5.0);
  });

  it('validateConfig throws for negative coverage_threshold', () => {
    const config: Config = {
      vault_path: '/tmp/vault',
      llm_provider: 'claude',
      search_provider: 'exa',
      coverage_threshold: -1,
    };
    expect(() => validateConfig(config)).toThrow('coverage_threshold');
    expect(() => validateConfig(config)).toThrow('non-negative number');
  });

  it('validateConfig accepts coverage_threshold of 0', () => {
    const config: Config = {
      vault_path: '/tmp/vault',
      llm_provider: 'claude',
      search_provider: 'exa',
      coverage_threshold: 0,
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('validateConfig throws for non-number coverage_threshold', () => {
    const config = {
      vault_path: '/tmp/vault',
      llm_provider: 'claude',
      search_provider: 'exa',
      coverage_threshold: 'high' as unknown as number,
    } as Config;
    expect(() => validateConfig(config)).toThrow('coverage_threshold');
  });
});

describe('assessCoverage', () => {
  let store: MockWikiStore;

  beforeEach(() => {
    store = new MockWikiStore();
    vi.mocked(buildIndex).mockReturnValue({} as ReturnType<typeof buildIndex>);
    vi.mocked(search).mockReturnValue([]);
  });

  it('returns { covered: false, articles: [] } when store.listArticles() returns []', async () => {
    const result = await assessCoverage('What is flash attention?', store as never, 5.0);
    expect(result).toEqual({ covered: false, articles: [] });
    // buildIndex should not have been called since wiki is empty
    expect(buildIndex).not.toHaveBeenCalled();
  });

  it('returns { covered: true, articles: [...] } when top BM25 score >= threshold', async () => {
    const article = makeArticle('flash-attention', 'Flash Attention', 'Flash attention is a technique...');
    store.seedArticle(article);

    vi.mocked(search).mockReturnValue([
      { slug: 'flash-attention', title: 'Flash Attention', summary: 'Summary', score: 8.5 },
    ]);

    const result = await assessCoverage('What is flash attention?', store as never, 5.0);
    expect(result.covered).toBe(true);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.slug).toBe('flash-attention');
  });

  it('returns { covered: false, articles: [] } when top BM25 score < threshold', async () => {
    const article = makeArticle('flash-attention', 'Flash Attention', 'Flash attention is a technique...');
    store.seedArticle(article);

    vi.mocked(search).mockReturnValue([
      { slug: 'flash-attention', title: 'Flash Attention', summary: 'Summary', score: 2.0 },
    ]);

    const result = await assessCoverage('What is flash attention?', store as never, 5.0);
    expect(result.covered).toBe(false);
    expect(result.articles).toEqual([]);
  });

  it('returns at most 5 articles even when more results exist', async () => {
    // Seed 7 articles
    for (let i = 1; i <= 7; i++) {
      store.seedArticle(makeArticle(`article-${i}`, `Article ${i}`, `Content ${i}`));
    }

    // Mock search returning 7 results all above threshold
    vi.mocked(search).mockReturnValue([
      { slug: 'article-1', title: 'Article 1', summary: 'S1', score: 10.0 },
      { slug: 'article-2', title: 'Article 2', summary: 'S2', score: 9.0 },
      { slug: 'article-3', title: 'Article 3', summary: 'S3', score: 8.0 },
      { slug: 'article-4', title: 'Article 4', summary: 'S4', score: 7.0 },
      { slug: 'article-5', title: 'Article 5', summary: 'S5', score: 6.5 },
      { slug: 'article-6', title: 'Article 6', summary: 'S6', score: 6.0 },
      { slug: 'article-7', title: 'Article 7', summary: 'S7', score: 5.5 },
    ]);

    const result = await assessCoverage('Some question', store as never, 5.0);
    expect(result.covered).toBe(true);
    expect(result.articles).toHaveLength(5);
  });

  it('returns covered: false when no search results', async () => {
    const article = makeArticle('some-article', 'Some Article', 'Some content');
    store.seedArticle(article);

    vi.mocked(search).mockReturnValue([]);

    const result = await assessCoverage('Completely unrelated question', store as never, 5.0);
    expect(result.covered).toBe(false);
    expect(result.articles).toEqual([]);
  });
});

describe('generateWikiAnswer', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
  });

  it('calls generateText with system prompt containing "wiki"', async () => {
    vi.mocked(generateText).mockResolvedValue('The answer to your question...');
    const articles = [makeArticle('flash-attention', 'Flash Attention', 'Flash attention content')];

    await generateWikiAnswer('What is flash attention?', articles);

    expect(generateText).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(generateText).mock.calls[0]!;
    expect(options?.system).toContain('wiki');
  });

  it('calls generateText with article context in prompt', async () => {
    vi.mocked(generateText).mockResolvedValue('The answer...');
    const articles = [makeArticle('flash-attention', 'Flash Attention', 'Flash attention content')];

    await generateWikiAnswer('What is flash attention?', articles);

    const [prompt] = vi.mocked(generateText).mock.calls[0]!;
    expect(prompt).toContain('Flash attention content');
    expect(prompt).toContain('What is flash attention?');
  });

  it('calls generateText with temperature 0.2 and maxOutputTokens 2048', async () => {
    vi.mocked(generateText).mockResolvedValue('The answer...');
    const articles = [makeArticle('article-1', 'Article 1', 'Content 1')];

    await generateWikiAnswer('question', articles);

    const [, options] = vi.mocked(generateText).mock.calls[0]!;
    expect(options?.temperature).toBe(0.2);
    expect(options?.maxOutputTokens).toBe(2048);
  });

  it('returns the text from generateText', async () => {
    vi.mocked(generateText).mockResolvedValue('This is the wiki answer.');
    const articles = [makeArticle('article-1', 'Article 1', 'Content 1')];

    const result = await generateWikiAnswer('What is this?', articles);
    expect(result).toBe('This is the wiki answer.');
  });
});

describe('buildWikiAnswerPrompt', () => {
  it('WIKI_CONTEXT_MAX_CHARS is 3000', () => {
    expect(WIKI_CONTEXT_MAX_CHARS).toBe(3000);
  });

  it('includes the question in output', () => {
    const articles = [makeArticle('article-1', 'Article 1', 'Content')];
    const prompt = buildWikiAnswerPrompt('What is flash attention?', articles);
    expect(prompt).toContain('What is flash attention?');
  });

  it('includes article title and body in output', () => {
    const articles = [
      makeArticle('flash-attention', 'Flash Attention', 'This explains flash attention algorithms.'),
    ];
    const prompt = buildWikiAnswerPrompt('What is flash attention?', articles);
    expect(prompt).toContain('Flash Attention');
    expect(prompt).toContain('This explains flash attention algorithms.');
  });

  it('includes article summary in output', () => {
    const articles = [makeArticle('article-1', 'Article 1', 'Body content')];
    const prompt = buildWikiAnswerPrompt('test question', articles);
    expect(prompt).toContain('Summary of Article 1');
  });

  it('truncates article bodies at WIKI_CONTEXT_MAX_CHARS', () => {
    const longBody = 'x'.repeat(5000);
    const articles = [makeArticle('article-1', 'Article 1', longBody)];
    const prompt = buildWikiAnswerPrompt('test question', articles);
    // Should NOT contain the full body
    expect(prompt).not.toContain('x'.repeat(5000));
    // Should contain truncation marker
    expect(prompt).toContain('[truncated]');
    // The body portion should be at most WIKI_CONTEXT_MAX_CHARS chars
    expect(prompt).toContain('x'.repeat(WIKI_CONTEXT_MAX_CHARS));
  });

  it('does not truncate article bodies shorter than WIKI_CONTEXT_MAX_CHARS', () => {
    const shortBody = 'Short content that fits within the limit.';
    const articles = [makeArticle('article-1', 'Article 1', shortBody)];
    const prompt = buildWikiAnswerPrompt('test question', articles);
    expect(prompt).toContain(shortBody);
    expect(prompt).not.toContain('[truncated]');
  });

  it('includes article count in output', () => {
    const articles = [
      makeArticle('article-1', 'Article 1', 'Content 1'),
      makeArticle('article-2', 'Article 2', 'Content 2'),
    ];
    const prompt = buildWikiAnswerPrompt('test question', articles);
    expect(prompt).toContain('2 total');
  });
});

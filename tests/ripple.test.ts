import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Article } from '../src/types/article.js';

// Mock LLM adapter before any imports that use it
vi.mock('../src/llm/adapter.js', () => ({
  generateText: vi.fn(),
}));

// Mock search-index for BM25 control
vi.mock('../src/search/search-index.js', () => ({
  buildIndex: vi.fn().mockReturnValue({}),
  search: vi.fn().mockReturnValue([]),
}));

import { generateText } from '../src/llm/adapter.js';
import { buildIndex, search } from '../src/search/search-index.js';
import { rippleUpdates } from '../src/synthesis/ripple.js';
import { upsertSeeAlsoEntry } from '../src/synthesis/see-also.js';

// ---- MockWikiStore ----

class MockWikiStore {
  private articles = new Map<string, Article>();

  slugify(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async saveArticle(article: Article, _operation?: 'create' | 'update'): Promise<string> {
    this.articles.set(article.slug, article);
    return `/tmp/vault/articles/${article.slug}.md`;
  }

  async listArticles(): Promise<Article[]> {
    return Array.from(this.articles.values());
  }

  async getArticle(slug: string): Promise<Article | null> {
    return this.articles.get(slug) ?? null;
  }

  async readSchema(): Promise<string | null> {
    return null;
  }

  async updateSchema(_content: string): Promise<void> {}

  async appendLog(_op: string, _desc: string): Promise<void> {}

  seedArticle(article: Article): void {
    this.articles.set(article.slug, article);
  }
}

// ---- Fixture helpers ----

function makeArticle(slug: string, title: string, summary: string): Article {
  return {
    slug,
    frontmatter: {
      title,
      tags: [],
      categories: ['Test'],
      sources: [],
      sourced_at: null,
      type: 'web',
      created_at: '2026-04-04T00:00:00.000Z',
      updated_at: '2026-04-04T00:00:00.000Z',
      summary,
    },
    body: `## Overview\n\n${summary}\n`,
  };
}

// ---- Tests ----

describe('upsertSeeAlsoEntry()', () => {
  it('appends See Also section when body has no See Also section', () => {
    const body = '## Overview\n\nSome content.\n';
    const entry = '[[flash-attention]] — Describes the attention algorithm';
    const result = upsertSeeAlsoEntry(body, entry);
    expect(result).toContain('## See Also');
    expect(result).toContain('- [[flash-attention]]');
  });

  it('adds entry to existing See Also section', () => {
    const body = '## Overview\n\nSome content.\n\n## See Also\n\n- [[existing-article]] — An existing link\n';
    const entry = '[[flash-attention]] — Describes the attention algorithm';
    const result = upsertSeeAlsoEntry(body, entry);
    expect(result).toContain('- [[existing-article]]');
    expect(result).toContain('- [[flash-attention]]');
  });

  it('returns body unchanged when entry already exists (idempotency)', () => {
    const entry = '[[flash-attention]] — Describes the attention algorithm';
    const body = `## Overview\n\nSome content.\n\n## See Also\n\n- ${entry}\n`;
    const result = upsertSeeAlsoEntry(body, entry);
    expect(result).toBe(body);
  });

  it('inserts See Also BEFORE ## Sources section when Sources exists', () => {
    const body = '## Overview\n\nContent.\n\n## Sources\n\n1. [Source](https://example.com)\n';
    const entry = '[[flash-attention]] — Describes the attention algorithm';
    const result = upsertSeeAlsoEntry(body, entry);
    const seeAlsoIdx = result.indexOf('## See Also');
    const sourcesIdx = result.indexOf('## Sources');
    expect(seeAlsoIdx).toBeGreaterThan(-1);
    expect(sourcesIdx).toBeGreaterThan(-1);
    expect(seeAlsoIdx).toBeLessThan(sourcesIdx);
  });

  it('appends See Also at end when no Sources section exists', () => {
    const body = '## Overview\n\nContent without sources.\n';
    const entry = '[[flash-attention]] — Describes the attention algorithm';
    const result = upsertSeeAlsoEntry(body, entry);
    expect(result.trim().endsWith('- [[flash-attention]] — Describes the attention algorithm')).toBe(true);
  });
});

describe('rippleUpdates()', () => {
  let store: MockWikiStore;
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
  const mockBuildIndex = buildIndex as ReturnType<typeof vi.fn>;
  const mockSearch = search as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new MockWikiStore();
    mockGenerateText.mockReset();
    mockBuildIndex.mockReturnValue({});
    mockSearch.mockReturnValue([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('returns empty result when wiki has 0 articles', async () => {
    const primary = makeArticle('flash-attention', 'Flash Attention', 'Memory-efficient attention algorithm');
    const result = await rippleUpdates([primary], store, 'schema');
    expect(result.updatedSlugs).toEqual([]);
    expect(result.skippedSlugs).toEqual([]);
  });

  it('queries BM25 index and excludes primary article slugs from results', async () => {
    const primary = makeArticle('flash-attention', 'Flash Attention', 'Memory-efficient attention algorithm');
    // Seed a related article in the store
    store.seedArticle(makeArticle('transformer-architecture', 'Transformer Architecture', 'Foundation of modern LLMs'));

    // Return the primary slug in BM25 results to verify it's excluded
    mockSearch.mockReturnValue([
      { slug: 'flash-attention', title: 'Flash Attention', summary: 'Memory-efficient attention', score: 8.0 },
      { slug: 'transformer-architecture', title: 'Transformer Architecture', summary: 'Foundation of LLMs', score: 5.0 },
    ]);

    mockGenerateText.mockResolvedValueOnce(
      JSON.stringify([{ slug: 'transformer-architecture', seeAlsoText: '[[flash-attention]] — Efficient attention algorithm' }])
    );

    const result = await rippleUpdates([primary], store, 'schema');
    // transformer-architecture should be updated, flash-attention should be excluded (it's primary)
    expect(result.updatedSlugs).toContain('transformer-architecture');
    expect(result.updatedSlugs).not.toContain('flash-attention');
  });

  it('filters BM25 results below relevance threshold (score < 3.0)', async () => {
    const primary = makeArticle('flash-attention', 'Flash Attention', 'Memory-efficient attention algorithm');
    store.seedArticle(makeArticle('low-relevance', 'Low Relevance Article', 'Unrelated content'));

    // Return results with score below threshold
    mockSearch.mockReturnValue([
      { slug: 'low-relevance', title: 'Low Relevance', summary: 'Unrelated', score: 1.5 },
    ]);

    const result = await rippleUpdates([primary], store, 'schema');
    // No LLM call should be made since all results are below threshold
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(result.updatedSlugs).toEqual([]);
  });

  it('makes a single LLM call with all target summaries and returns structured RippleTarget[] from parsed JSON', async () => {
    const primary = makeArticle('flash-attention', 'Flash Attention', 'Memory-efficient attention algorithm');
    store.seedArticle(makeArticle('transformer-architecture', 'Transformer Architecture', 'Foundation of modern LLMs'));
    store.seedArticle(makeArticle('attention-mechanism', 'Attention Mechanism', 'Core attention concept'));

    mockSearch.mockReturnValue([
      { slug: 'transformer-architecture', title: 'Transformer Architecture', summary: 'Foundation of LLMs', score: 6.0 },
      { slug: 'attention-mechanism', title: 'Attention Mechanism', summary: 'Core attention concept', score: 5.0 },
    ]);

    const llmResponse = JSON.stringify([
      { slug: 'transformer-architecture', seeAlsoText: '[[flash-attention]] — Efficient attention for transformers' },
      { slug: 'attention-mechanism', seeAlsoText: '[[flash-attention]] — Optimized attention implementation' },
    ]);
    mockGenerateText.mockResolvedValueOnce(llmResponse);

    const result = await rippleUpdates([primary], store, 'schema');

    // Only one LLM call for all targets
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(result.updatedSlugs).toContain('transformer-architecture');
    expect(result.updatedSlugs).toContain('attention-mechanism');
  });

  it('applies upsertSeeAlsoEntry and calls store.saveArticle with operation update', async () => {
    const primary = makeArticle('flash-attention', 'Flash Attention', 'Memory-efficient attention algorithm');
    const target = makeArticle('transformer-architecture', 'Transformer Architecture', 'Foundation of modern LLMs');
    store.seedArticle(target);

    mockSearch.mockReturnValue([
      { slug: 'transformer-architecture', title: 'Transformer Architecture', summary: 'Foundation of LLMs', score: 6.0 },
    ]);

    mockGenerateText.mockResolvedValueOnce(
      JSON.stringify([{ slug: 'transformer-architecture', seeAlsoText: '[[flash-attention]] — Efficient attention' }])
    );

    const saveArticleSpy = vi.spyOn(store, 'saveArticle');
    await rippleUpdates([primary], store, 'schema');

    expect(saveArticleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'transformer-architecture' }),
      'update'
    );
  });

  it('handles malformed LLM JSON gracefully — returns empty result, does not throw', async () => {
    const primary = makeArticle('flash-attention', 'Flash Attention', 'Memory-efficient attention algorithm');
    store.seedArticle(makeArticle('transformer-architecture', 'Transformer Architecture', 'Foundation of modern LLMs'));

    mockSearch.mockReturnValue([
      { slug: 'transformer-architecture', title: 'Transformer Architecture', summary: 'Foundation of LLMs', score: 6.0 },
    ]);

    mockGenerateText.mockResolvedValueOnce('NOT VALID JSON AT ALL {{{');

    const result = await rippleUpdates([primary], store, 'schema');
    expect(result.updatedSlugs).toEqual([]);
    expect(result.skippedSlugs).toEqual([]);
  });

  it('strips markdown code fences from LLM output before JSON.parse', async () => {
    const primary = makeArticle('flash-attention', 'Flash Attention', 'Memory-efficient attention algorithm');
    store.seedArticle(makeArticle('transformer-architecture', 'Transformer Architecture', 'Foundation of modern LLMs'));

    mockSearch.mockReturnValue([
      { slug: 'transformer-architecture', title: 'Transformer Architecture', summary: 'Foundation of LLMs', score: 6.0 },
    ]);

    // LLM response wrapped in code fences
    mockGenerateText.mockResolvedValueOnce(
      '```json\n[{"slug":"transformer-architecture","seeAlsoText":"[[flash-attention]] — Efficient attention"}]\n```'
    );

    const result = await rippleUpdates([primary], store, 'schema');
    expect(result.updatedSlugs).toContain('transformer-architecture');
  });
});

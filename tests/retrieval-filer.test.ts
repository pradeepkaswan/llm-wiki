import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM adapter — must be declared before any imports that use it
vi.mock('../src/llm/adapter.js', () => ({
  generateText: vi.fn(),
}));

// Mock the search index (used by deduplicator)
vi.mock('../src/search/search-index.js', () => ({
  buildIndex: vi.fn().mockReturnValue({}),
  search: vi.fn().mockReturnValue([]),
}));

import { generateText } from '../src/llm/adapter.js';
import {
  buildFilingPrompt,
  buildCompoundArticle,
  buildUpdatedCompoundArticle,
  fileAnswerAsArticle,
} from '../src/retrieval/article-filer.js';
import type { Article, Frontmatter } from '../src/types/article.js';

// --- Mock WikiStore ---

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

// --- Fixture helpers ---

function makeArticle(slug: string, title: string, body = '## Overview\n\nContent here.'): Article {
  const fm: Frontmatter = {
    title,
    tags: [],
    categories: ['Technology'],
    sources: [`https://example.com/${slug}`],
    sourced_at: '2026-04-01T00:00:00.000Z',
    type: 'web',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    summary: `Summary of ${title}`,
  };
  return { slug, frontmatter: fm, body };
}

function makeLlmArticleOutput(
  title: string,
  summary: string,
  categories: string,
  body: string,
  sourceRefs: string,
): string {
  return `TITLE: ${title}

SUMMARY: ${summary}

CATEGORIES: ${categories}

BODY:
${body}

## Sources

${sourceRefs}`;
}

// --- Tests ---

describe('buildFilingPrompt', () => {
  const question = 'How does flash attention work?';
  const answer = 'Flash attention works by tiling the attention computation...';
  const sourceArticles = [
    makeArticle('flash-attention', 'Flash Attention'),
    makeArticle('transformers-overview', 'Transformers Overview'),
  ];

  it('includes the original question in the prompt', () => {
    const prompt = buildFilingPrompt(question, answer, sourceArticles, '');
    expect(prompt).toContain(question);
  });

  it('includes the answer text in the prompt', () => {
    const prompt = buildFilingPrompt(question, answer, sourceArticles, '');
    expect(prompt).toContain(answer);
  });

  it('includes source article titles in the prompt', () => {
    const prompt = buildFilingPrompt(question, answer, sourceArticles, '');
    expect(prompt).toContain('Flash Attention');
    expect(prompt).toContain('Transformers Overview');
  });

  it('includes a ## Sources section', () => {
    const prompt = buildFilingPrompt(question, answer, sourceArticles, '');
    expect(prompt).toContain('## Sources');
  });

  it('uses wiki:// prefix in source references', () => {
    const prompt = buildFilingPrompt(question, answer, sourceArticles, '');
    expect(prompt).toContain('wiki://flash-attention');
    expect(prompt).toContain('wiki://transformers-overview');
  });

  it('uses numbered link format in source refs', () => {
    const prompt = buildFilingPrompt(question, answer, sourceArticles, '');
    expect(prompt).toContain('1. [Flash Attention](wiki://flash-attention)');
    expect(prompt).toContain('2. [Transformers Overview](wiki://transformers-overview)');
  });

  it('works with empty source articles list', () => {
    const prompt = buildFilingPrompt(question, answer, [], '');
    expect(prompt).toContain(question);
    expect(prompt).toContain(answer);
    expect(prompt).toContain('0 total');
  });
});

describe('buildCompoundArticle', () => {
  const sourceArticles = [
    makeArticle('flash-attention', 'Flash Attention'),
    makeArticle('memory-efficiency', 'Memory Efficiency in Transformers'),
  ];
  const parsed = {
    title: 'Flash Attention Deep Dive',
    summary: 'A deep dive into flash attention mechanisms',
    categories: ['Machine Learning', 'Algorithms'],
    body: '## Overview\n\nFlash attention is efficient.\n\n## Sources\n\n1. [Flash Attention](wiki://flash-attention)',
    sourceRefs: [{ index: 1, title: 'Flash Attention', url: 'wiki://flash-attention' }],
  };

  it('sets frontmatter.type to compound', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.frontmatter.type).toBe('compound');
  });

  it('does NOT set frontmatter.type to web', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.frontmatter.type).not.toBe('web');
  });

  it('sets sources to wiki:// prefixed slugs from source articles', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.frontmatter.sources).toEqual([
      'wiki://flash-attention',
      'wiki://memory-efficiency',
    ]);
  });

  it('sets sourced_at to an ISO date string', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.frontmatter.sourced_at).toBeTruthy();
    expect(new Date(article.frontmatter.sourced_at!).toISOString()).toBe(article.frontmatter.sourced_at);
  });

  it('sets categories from parsed output', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.frontmatter.categories).toEqual(['Machine Learning', 'Algorithms']);
  });

  it('falls back to Uncategorized when parsed categories is empty', () => {
    const parsedNoCategories = { ...parsed, categories: [] };
    const article = buildCompoundArticle(parsedNoCategories, sourceArticles);
    expect(article.frontmatter.categories).toEqual(['Uncategorized']);
  });

  it('generates slug from parsed title via slugify', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.slug).toBe('flash-attention-deep-dive');
  });

  it('sets title from parsed output', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.frontmatter.title).toBe('Flash Attention Deep Dive');
  });

  it('sets summary from parsed output', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.frontmatter.summary).toBe('A deep dive into flash attention mechanisms');
  });

  it('sets body from parsed output', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.body).toBe(parsed.body);
  });

  it('has empty tags array', () => {
    const article = buildCompoundArticle(parsed, sourceArticles);
    expect(article.frontmatter.tags).toEqual([]);
  });
});

describe('buildUpdatedCompoundArticle', () => {
  const existingArticle = makeArticle('flash-attention-deep-dive', 'Flash Attention Deep Dive');
  // Override to be compound with wiki:// sources
  const existing: Article = {
    ...existingArticle,
    frontmatter: {
      ...existingArticle.frontmatter,
      type: 'compound',
      sources: ['wiki://flash-attention', 'wiki://transformers'],
      created_at: '2026-03-01T00:00:00.000Z',
    },
  };

  const newSources = [
    makeArticle('memory-efficiency', 'Memory Efficiency in Transformers'),
    makeArticle('flash-attention', 'Flash Attention'), // duplicate
  ];

  const parsed = {
    title: 'Flash Attention Deep Dive Updated',
    summary: 'Updated summary about flash attention',
    categories: ['Machine Learning'],
    body: '## Updated Overview\n\nUpdated content.\n\n## Sources\n\n1. [Memory Efficiency](wiki://memory-efficiency)',
    sourceRefs: [{ index: 1, title: 'Memory Efficiency', url: 'wiki://memory-efficiency' }],
  };

  it('preserves the existing slug', () => {
    const updated = buildUpdatedCompoundArticle(existing, parsed, newSources);
    expect(updated.slug).toBe('flash-attention-deep-dive');
  });

  it('preserves created_at from existing article', () => {
    const updated = buildUpdatedCompoundArticle(existing, parsed, newSources);
    expect(updated.frontmatter.created_at).toBe('2026-03-01T00:00:00.000Z');
  });

  it('merges sources as union (deduplicates)', () => {
    const updated = buildUpdatedCompoundArticle(existing, parsed, newSources);
    // existing: ['wiki://flash-attention', 'wiki://transformers']
    // new from sources: ['wiki://memory-efficiency', 'wiki://flash-attention']
    // merged union: ['wiki://flash-attention', 'wiki://transformers', 'wiki://memory-efficiency']
    expect(updated.frontmatter.sources).toContain('wiki://flash-attention');
    expect(updated.frontmatter.sources).toContain('wiki://transformers');
    expect(updated.frontmatter.sources).toContain('wiki://memory-efficiency');
    // no duplicates
    const flashCount = updated.frontmatter.sources.filter(s => s === 'wiki://flash-attention').length;
    expect(flashCount).toBe(1);
  });

  it('updates summary from parsed output', () => {
    const updated = buildUpdatedCompoundArticle(existing, parsed, newSources);
    expect(updated.frontmatter.summary).toBe('Updated summary about flash attention');
  });

  it('updates categories from parsed output when non-empty', () => {
    const updated = buildUpdatedCompoundArticle(existing, parsed, newSources);
    expect(updated.frontmatter.categories).toEqual(['Machine Learning']);
  });

  it('preserves existing categories when parsed categories is empty', () => {
    const parsedNoCategories = { ...parsed, categories: [] };
    const updated = buildUpdatedCompoundArticle(existing, parsedNoCategories, newSources);
    expect(updated.frontmatter.categories).toEqual(existing.frontmatter.categories);
  });

  it('sets updated_at to current time', () => {
    const before = new Date().toISOString();
    const updated = buildUpdatedCompoundArticle(existing, parsed, newSources);
    const after = new Date().toISOString();
    expect(updated.frontmatter.updated_at >= before).toBe(true);
    expect(updated.frontmatter.updated_at <= after).toBe(true);
  });

  it('updates body from parsed output', () => {
    const updated = buildUpdatedCompoundArticle(existing, parsed, newSources);
    expect(updated.body).toBe(parsed.body);
  });
});

describe('fileAnswerAsArticle', () => {
  let store: MockWikiStore;

  beforeEach(() => {
    store = new MockWikiStore();
    vi.clearAllMocks();
  });

  const question = 'How does flash attention work?';
  const answer = 'Flash attention works by tiling the attention computation to reduce memory usage.';
  const sourceArticles = [
    makeArticle('flash-attention', 'Flash Attention'),
  ];

  const validLlmOutput = makeLlmArticleOutput(
    'Flash Attention Explained',
    'A comprehensive explanation of flash attention',
    'Machine Learning, Algorithms',
    '## Overview\n\nFlash attention is efficient.\n\nIt reduces memory complexity.',
    '1. [Flash Attention](wiki://flash-attention)',
  );

  it('calls generateText with the filing prompt', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);

    await fileAnswerAsArticle(question, answer, sourceArticles, store as any, '');

    expect(generateText).toHaveBeenCalledOnce();
    const [prompt] = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(prompt).toContain(question);
    expect(prompt).toContain(answer);
  });

  it('returns article with type: compound', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);

    const result = await fileAnswerAsArticle(question, answer, sourceArticles, store as any, '');

    expect(result.frontmatter.type).toBe('compound');
  });

  it('saves the article via store.saveArticle', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);
    const saveSpy = vi.spyOn(store, 'saveArticle');

    await fileAnswerAsArticle(question, answer, sourceArticles, store as any, '');

    expect(saveSpy).toHaveBeenCalledOnce();
    const savedArticle = saveSpy.mock.calls[0]![0];
    expect(savedArticle.frontmatter.type).toBe('compound');
  });

  it('returns the saved article', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);

    const result = await fileAnswerAsArticle(question, answer, sourceArticles, store as any, '');

    expect(result.frontmatter.title).toBe('Flash Attention Explained');
    expect(result.frontmatter.type).toBe('compound');
  });

  it('uses wiki:// sources in the returned article', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);

    const result = await fileAnswerAsArticle(question, answer, sourceArticles, store as any, '');

    expect(result.frontmatter.sources).toContain('wiki://flash-attention');
  });

  it('retries once when parseArticleOutput returns null on first attempt', async () => {
    const badOutput = 'This is not a valid article format';
    (generateText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(badOutput)
      .mockResolvedValueOnce(validLlmOutput);

    const result = await fileAnswerAsArticle(question, answer, sourceArticles, store as any, '');

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result.frontmatter.type).toBe('compound');
  });

  it('throws when LLM output cannot be parsed after retry', async () => {
    const badOutput = 'Not a valid article format';
    (generateText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(badOutput)
      .mockResolvedValueOnce(badOutput);

    await expect(
      fileAnswerAsArticle(question, answer, sourceArticles, store as any, ''),
    ).rejects.toThrow('Filing failed: could not parse LLM output after retry');
  });

  it('updates existing compound article when dedup finds a match', async () => {
    const existingCompound: Article = {
      slug: 'flash-attention-explained',
      frontmatter: {
        title: 'Flash Attention Explained',
        tags: [],
        categories: ['Machine Learning'],
        sources: ['wiki://old-source'],
        sourced_at: '2026-03-01T00:00:00.000Z',
        type: 'compound',
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-03-01T00:00:00.000Z',
        summary: 'Old summary',
      },
      body: '## Old content',
    };
    store.seedArticle(existingCompound);

    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);

    const result = await fileAnswerAsArticle(question, answer, sourceArticles, store as any, '');

    // Since the title matches exactly (slug lookup), it should update
    expect(result.slug).toBe('flash-attention-explained');
    expect(result.frontmatter.type).toBe('compound');
    // The new wiki source should be merged in
    expect(result.frontmatter.sources).toContain('wiki://flash-attention');
  });

  it('passes generateText options with temperature and maxOutputTokens', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);

    await fileAnswerAsArticle(question, answer, sourceArticles, store as any, '');

    const [, options] = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(options).toMatchObject({ temperature: 0.3, maxOutputTokens: 4096 });
  });
});

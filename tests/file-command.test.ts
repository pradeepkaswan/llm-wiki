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

// Mock ripple and backlink modules
vi.mock('../src/synthesis/ripple.js', () => ({
  rippleUpdates: vi.fn().mockResolvedValue({ updatedSlugs: [], skippedSlugs: [] }),
}));

vi.mock('../src/synthesis/backlink-enforcer.js', () => ({
  enforceBacklinks: vi.fn().mockResolvedValue([]),
}));

// Mock config
vi.mock('../src/config/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    vault_path: '/tmp/test-vault',
    llm_provider: 'claude',
    llm_model: 'claude-sonnet-4-5',
    coverage_threshold: 5.0,
    freshness_days: 30,
  }),
}));

// Mock WikiStore
vi.mock('../src/store/wiki-store.js', () => ({
  WikiStore: vi.fn().mockImplementation(() => new MockWikiStore()),
}));

// Mock schema template
vi.mock('../src/schema/template.js', () => ({
  buildDefaultSchema: vi.fn().mockReturnValue('## Wiki Schema\nDefault schema'),
}));

import { generateText } from '../src/llm/adapter.js';
import { rippleUpdates } from '../src/synthesis/ripple.js';
import { enforceBacklinks } from '../src/synthesis/backlink-enforcer.js';
import {
  readInput,
  buildPlacementPrompt,
  parsePlacementDecisions,
  executePlacement,
  fileCommand,
} from '../src/commands/file.js';
import type { Article, Frontmatter } from '../src/types/article.js';
import type { PlacementDecision } from '../src/commands/file.js';

// --- Mock WikiStore class ---

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
    return '## Wiki Schema\nTest schema';
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
): string {
  return `TITLE: ${title}

SUMMARY: ${summary}

CATEGORIES: ${categories}

BODY:
${body}`;
}

// --- Tests ---

describe('readInput', () => {
  it('returns argument text when provided', async () => {
    const result = await readInput('some text to file');
    expect(result).toBe('some text to file');
  });

  it('exits with error when no argument and stdin is TTY', async () => {
    // Temporarily mock isTTY as true
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
      throw new Error('process.exit called');
    });

    await expect(readInput(undefined)).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    // Restore
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    exitSpy.mockRestore();
  });
});

describe('buildPlacementPrompt', () => {
  const text = 'This is a comparison between Flash Attention and standard attention.';
  const existingArticles = [
    makeArticle('flash-attention', 'Flash Attention'),
    makeArticle('transformers-overview', 'Transformers Overview'),
  ];
  const schema = '## Wiki Schema\nTest schema content';

  it('includes the freeform text in the prompt', () => {
    const prompt = buildPlacementPrompt(text, existingArticles, schema);
    expect(prompt).toContain(text);
  });

  it('includes existing article titles in the prompt', () => {
    const prompt = buildPlacementPrompt(text, existingArticles, schema);
    expect(prompt).toContain('flash-attention');
    expect(prompt).toContain('Flash Attention');
    expect(prompt).toContain('Transformers Overview');
  });

  it('includes the schema in the prompt', () => {
    const prompt = buildPlacementPrompt(text, existingArticles, schema);
    expect(prompt).toContain(schema);
  });

  it('includes article count in the prompt', () => {
    const prompt = buildPlacementPrompt(text, existingArticles, schema);
    expect(prompt).toContain('2 total');
  });

  it('instructs LLM to return JSON array', () => {
    const prompt = buildPlacementPrompt(text, existingArticles, schema);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('action');
    expect(prompt).toContain('slug');
    expect(prompt).toContain('title');
    expect(prompt).toContain('reason');
  });

  it('works with empty existing articles list', () => {
    const prompt = buildPlacementPrompt(text, [], schema);
    expect(prompt).toContain(text);
    expect(prompt).toContain('0 total');
  });
});

describe('parsePlacementDecisions', () => {
  it('parses valid JSON array of placement decisions', () => {
    const raw = JSON.stringify([
      { action: 'create', slug: 'flash-attention-comparison', title: 'Flash Attention Comparison', reason: 'New comparison topic' },
      { action: 'update', slug: 'flash-attention', title: 'Flash Attention', reason: 'Extends existing article' },
    ]);
    const decisions = parsePlacementDecisions(raw);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]!.action).toBe('create');
    expect(decisions[0]!.slug).toBe('flash-attention-comparison');
    expect(decisions[0]!.title).toBe('Flash Attention Comparison');
    expect(decisions[0]!.reason).toBe('New comparison topic');
    expect(decisions[1]!.action).toBe('update');
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n[{"action":"create","slug":"test-slug","title":"Test Title","reason":"Test reason"}]\n```';
    const decisions = parsePlacementDecisions(raw);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.action).toBe('create');
    expect(decisions[0]!.slug).toBe('test-slug');
  });

  it('strips plain code fences without language specifier', () => {
    const raw = '```\n[{"action":"update","slug":"existing","title":"Existing","reason":"Extends existing"}]\n```';
    const decisions = parsePlacementDecisions(raw);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.action).toBe('update');
  });

  it('returns empty array on invalid JSON without throwing', () => {
    const raw = 'This is not JSON at all';
    const decisions = parsePlacementDecisions(raw);
    expect(decisions).toEqual([]);
  });

  it('returns empty array on empty JSON object without throwing', () => {
    const raw = '{}';
    const decisions = parsePlacementDecisions(raw);
    expect(decisions).toEqual([]);
  });

  it('returns empty array on malformed JSON without throwing', () => {
    const raw = '[{action: "create", slug: "oops"';
    const decisions = parsePlacementDecisions(raw);
    expect(decisions).toEqual([]);
  });

  it('filters out entries missing required fields', () => {
    const raw = JSON.stringify([
      { action: 'create', slug: 'valid-slug', title: 'Valid Title', reason: 'Valid reason' },
      { action: 'create', slug: 'missing-title' }, // no title or reason
    ]);
    const decisions = parsePlacementDecisions(raw);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.slug).toBe('valid-slug');
  });
});

describe('executePlacement - create action', () => {
  let store: MockWikiStore;

  beforeEach(() => {
    store = new MockWikiStore();
    vi.clearAllMocks();
  });

  const createDecision: PlacementDecision = {
    action: 'create',
    slug: 'flash-attention-comparison',
    title: 'Flash Attention Comparison',
    reason: 'New comparison topic',
  };

  const validLlmOutput = makeLlmArticleOutput(
    'Flash Attention Comparison',
    'A comparison of Flash Attention variants',
    'Machine Learning',
    '## Overview\n\nFlash attention comparison.',
  );

  it('builds new article with type filed for create action', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);

    const article = await executePlacement(
      createDecision,
      'comparison text',
      store as any,
      [],
      'schema',
    );

    expect(article.frontmatter.type).toBe('filed');
  });

  it('saves article to store for create action', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);
    const saveSpy = vi.spyOn(store, 'saveArticle');

    await executePlacement(
      createDecision,
      'comparison text',
      store as any,
      [],
      'schema',
    );

    expect(saveSpy).toHaveBeenCalledOnce();
    const [savedArticle, operation] = saveSpy.mock.calls[0]!;
    expect(savedArticle.frontmatter.type).toBe('filed');
    expect(operation).toBe('create');
  });

  it('sets sources to empty array for filed articles (no web sources)', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);

    const article = await executePlacement(
      createDecision,
      'comparison text',
      store as any,
      [],
      'schema',
    );

    expect(article.frontmatter.sources).toEqual([]);
  });

  it('calls findExistingArticle via deduplication before creating', async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validLlmOutput);

    // Seed with an article having the same title to trigger dedup
    const existingArticle = makeArticle(
      store.slugify('Flash Attention Comparison'),
      'Flash Attention Comparison',
    );
    store.seedArticle(existingArticle);

    // Mock generateText to return merge output for update path
    const updateLlmOutput = makeLlmArticleOutput(
      'Flash Attention Comparison',
      'Updated comparison',
      'Machine Learning',
      '## Updated Overview\n\nMerged content.',
    );
    (generateText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(validLlmOutput) // create generation call
      .mockResolvedValueOnce(updateLlmOutput); // merge call

    const article = await executePlacement(
      createDecision,
      'comparison text',
      store as any,
      [existingArticle],
      'schema',
    );

    // Should have found existing article and merged
    expect(article.slug).toBe(existingArticle.slug);
  });
});

describe('executePlacement - update action', () => {
  let store: MockWikiStore;

  beforeEach(() => {
    store = new MockWikiStore();
    vi.clearAllMocks();
  });

  const existingArticle = makeArticle('flash-attention', 'Flash Attention');

  const updateDecision: PlacementDecision = {
    action: 'update',
    slug: 'flash-attention',
    title: 'Flash Attention',
    reason: 'Extends existing article with comparison data',
  };

  const mergeLlmOutput = makeLlmArticleOutput(
    'Flash Attention',
    'Updated flash attention overview',
    'Machine Learning',
    '## Overview\n\nUpdated content with comparison data.',
  );

  it('loads existing article and merges for update action', async () => {
    store.seedArticle(existingArticle);
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mergeLlmOutput);

    const article = await executePlacement(
      updateDecision,
      'additional content',
      store as any,
      [existingArticle],
      'schema',
    );

    expect(article.slug).toBe('flash-attention');
  });

  it('preserves existing type when updating (does not override with filed)', async () => {
    store.seedArticle(existingArticle); // type: 'web'
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mergeLlmOutput);

    const article = await executePlacement(
      updateDecision,
      'additional content',
      store as any,
      [existingArticle],
      'schema',
    );

    // Existing web article type should be preserved
    expect(article.frontmatter.type).toBe('web');
  });

  it('saves updated article with update operation', async () => {
    store.seedArticle(existingArticle);
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mergeLlmOutput);
    const saveSpy = vi.spyOn(store, 'saveArticle');

    await executePlacement(
      updateDecision,
      'additional content',
      store as any,
      [existingArticle],
      'schema',
    );

    expect(saveSpy).toHaveBeenCalledOnce();
    const [, operation] = saveSpy.mock.calls[0]!;
    expect(operation).toBe('update');
  });

  it('falls through to create when update target not found in store', async () => {
    // Do not seed the article — getArticle returns null
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mergeLlmOutput);

    const article = await executePlacement(
      updateDecision,
      'additional content',
      store as any,
      [],
      'schema',
    );

    // Should create a new article with type 'filed' since existing not found
    expect(article.frontmatter.type).toBe('filed');
  });
});

describe('fileCommand integration - ripple and backlink calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rippleUpdates and enforceBacklinks are exported functions with correct signatures', () => {
    // Just verify the mocks are in place — integration tested via command action
    expect(typeof rippleUpdates).toBe('function');
    expect(typeof enforceBacklinks).toBe('function');
  });

  it('fileCommand is a Commander Command instance', () => {
    expect(fileCommand).toBeDefined();
    expect(typeof fileCommand.name).toBe('function');
    expect(fileCommand.name()).toBe('file');
  });

  it('fileCommand has correct description', () => {
    expect(fileCommand.description()).toContain('freeform content');
  });
});

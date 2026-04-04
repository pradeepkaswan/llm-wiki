import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

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
import { synthesize } from '../src/synthesis/synthesizer.js';
import type { RawSourceEnvelope, Manifest, ManifestEntry } from '../src/types/ingestion.js';
import type { Article, Frontmatter } from '../src/types/article.js';
import type { SynthesisResult } from '../src/synthesis/types.js';

// --- Mock WikiStore ---

class MockWikiStore {
  private articles = new Map<string, Article>();

  slugify(title: string): string {
    // Real slugify logic
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

  // Helper: seed an existing article for dedup tests
  seedArticle(article: Article): void {
    this.articles.set(article.slug, article);
  }
}

// --- Fixture helpers ---

function makeEnvelope(index: number, excluded = false): RawSourceEnvelope {
  return {
    url: `https://example.com/source-${index}`,
    title: `Source ${index} Title`,
    markdown: `Content about flash attention algorithms from source ${index}. `.repeat(20),
    fetched_at: '2026-04-04T00:00:00.000Z',
    query: 'How does flash attention work?',
    search_rank: index,
    content_length: 500,
    excluded,
    exclude_reason: excluded ? 'too_short' : null,
  };
}

function makeManifest(sources: RawSourceEnvelope[]): Manifest {
  return {
    query: 'How does flash attention work?',
    created_at: '2026-04-04T00:00:00.000Z',
    sources: sources.map((e, i) => ({
      file: `source-${String(i + 1).padStart(2, '0')}.json`,
      url: e.url,
      excluded: e.excluded,
      exclude_reason: e.exclude_reason,
    })),
  };
}

async function createRawDir(
  tmpDir: string,
  envelopes: RawSourceEnvelope[]
): Promise<string> {
  const rawDir = path.join(tmpDir, 'raw');
  await fs.mkdir(rawDir, { recursive: true });

  // Write each envelope
  for (let i = 0; i < envelopes.length; i++) {
    const filename = `source-${String(i + 1).padStart(2, '0')}.json`;
    await fs.writeFile(
      path.join(rawDir, filename),
      JSON.stringify(envelopes[i], null, 2),
      'utf8'
    );
  }

  // Write manifest
  const manifest = makeManifest(envelopes);
  await fs.writeFile(
    path.join(rawDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  return rawDir;
}

// --- LLM response fixtures ---

const SINGLE_ARTICLE_PLAN = `ARTICLE_COUNT: 1
ARTICLE_1_TITLE: Flash Attention
ARTICLE_1_SCOPE: Memory-efficient attention algorithm
ARTICLE_1_SOURCES: 0,1,2`;

const SINGLE_ARTICLE_GENERATE = `TITLE: Flash Attention

SUMMARY: Flash attention is a memory-efficient exact attention algorithm that reduces memory usage from O(n²) to O(n).

CATEGORIES: Machine Learning, Transformers

BODY:
## What Is Flash Attention

Flash attention [1] solves the memory bottleneck of standard attention by tiling the computation.

See also [[transformer-architecture]] for the broader context.

## How It Works

The algorithm tiles the attention computation [2]...

## Sources

1. [Flash Attention Paper](https://example.com/paper)
2. [Tri Dao Blog](https://example.com/blog)`;

const MULTI_ARTICLE_PLAN = `ARTICLE_COUNT: 2
ARTICLE_1_TITLE: Flash Attention
ARTICLE_1_SCOPE: Memory-efficient attention algorithm
ARTICLE_1_SOURCES: 0
ARTICLE_2_TITLE: Transformer Architecture
ARTICLE_2_SCOPE: Foundation of modern LLMs
ARTICLE_2_SOURCES: 1,2`;

const MULTI_ARTICLE_GENERATE_1 = `TITLE: Flash Attention

SUMMARY: Flash attention is a memory-efficient exact attention algorithm.

CATEGORIES: Machine Learning, Transformers

BODY:
## What Is Flash Attention

Flash attention [1] solves the memory bottleneck.

See also [[transformer-architecture]] for broader context.

## Sources

1. [Flash Attention Paper](https://example.com/paper)`;

const MULTI_ARTICLE_GENERATE_2 = `TITLE: Transformer Architecture

SUMMARY: Transformer architecture is the foundation of modern large language models.

CATEGORIES: Machine Learning, Deep Learning

BODY:
## Overview

The transformer architecture [1] uses self-attention mechanisms.

See also [[flash-attention]] for efficient implementations.

## Sources

1. [Attention Is All You Need](https://example.com/attention)`;

const UPDATE_ARTICLE_GENERATE = `TITLE: Flash Attention

SUMMARY: Flash attention updated with new insights about memory efficiency.

CATEGORIES: Machine Learning, Transformers

BODY:
## What Is Flash Attention

Flash attention [1] solves the memory bottleneck. Updated: also supports sparse patterns [2].

## Sources

1. [Flash Attention Paper](https://example.com/paper)
2. [New Flash Attention Research](https://example.com/new-research)`;

// --- Tests ---

describe('synthesize() — Task 1', () => {
  let tmpDir: string;
  let mockStore: MockWikiStore;
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synthesis-test-'));
    mockStore = new MockWikiStore();
    mockGenerateText.mockReset();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // Test 1: single-article synthesis produces 1 Article
  it('produces 1 Article from 3 non-excluded envelopes (SYNTH-01)', async () => {
    const envelopes = [makeEnvelope(0), makeEnvelope(1), makeEnvelope(2)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    mockGenerateText
      .mockResolvedValueOnce(SINGLE_ARTICLE_PLAN)       // plan call
      .mockResolvedValueOnce(SINGLE_ARTICLE_GENERATE);  // generate call

    const result: SynthesisResult = await synthesize(rawDir, mockStore as never);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.frontmatter.title).toBe('Flash Attention');
    expect(result.updatedSlugs).toHaveLength(0);
  });

  // Test 2: inline citations and ## Sources section (SYNTH-02)
  it('article has inline [N] citation and matching ## Sources entry (SYNTH-02)', async () => {
    const envelopes = [makeEnvelope(0), makeEnvelope(1), makeEnvelope(2)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    mockGenerateText
      .mockResolvedValueOnce(SINGLE_ARTICLE_PLAN)
      .mockResolvedValueOnce(SINGLE_ARTICLE_GENERATE);

    const result = await synthesize(rawDir, mockStore as never);
    const article = result.articles[0]!;

    // Body should contain inline citation [1]
    expect(article.body).toContain('[1]');
    // Body should contain ## Sources section
    expect(article.body).toContain('## Sources');
    // Sources section should have a link
    expect(article.body).toMatch(/1\.\s+\[Flash Attention Paper\]/);
  });

  // Test 3: frontmatter has sources (URL array), sourced_at (ISO), type: 'web' (SYNTH-07)
  it('article frontmatter has sources URL array, sourced_at ISO, type web (SYNTH-07)', async () => {
    const envelopes = [makeEnvelope(0), makeEnvelope(1), makeEnvelope(2)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    mockGenerateText
      .mockResolvedValueOnce(SINGLE_ARTICLE_PLAN)
      .mockResolvedValueOnce(SINGLE_ARTICLE_GENERATE);

    const result = await synthesize(rawDir, mockStore as never);
    const fm = result.articles[0]!.frontmatter;

    // sources must be a non-empty array of URLs
    expect(Array.isArray(fm.sources)).toBe(true);
    expect(fm.sources.length).toBeGreaterThan(0);
    expect(fm.sources[0]).toMatch(/^https?:\/\//);
    // sourced_at must be ISO string
    expect(fm.sourced_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // type must be 'web'
    expect(fm.type).toBe('web');
  });

  // Test 4: strips [[hallucinated-link]] from body (SYNTH-03)
  it('strips [[hallucinated-link]] when slug not in known set (SYNTH-03)', async () => {
    const envelopes = [makeEnvelope(0), makeEnvelope(1), makeEnvelope(2)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    mockGenerateText
      .mockResolvedValueOnce(SINGLE_ARTICLE_PLAN)
      .mockResolvedValueOnce(SINGLE_ARTICLE_GENERATE);

    const result = await synthesize(rawDir, mockStore as never);
    const article = result.articles[0]!;

    // [[transformer-architecture]] is NOT in known slugs (store is empty)
    // so it should be stripped to plain text "transformer-architecture"
    expect(article.body).not.toContain('[[transformer-architecture]]');
    expect(article.body).toContain('transformer-architecture');
  });

  // Test 5: multi-article batch produces 2 articles with cross-links (SYNTH-04)
  it('produces 2 articles for broad question with cross-links (SYNTH-04)', async () => {
    const envelopes = [makeEnvelope(0), makeEnvelope(1), makeEnvelope(2)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    mockGenerateText
      .mockResolvedValueOnce(MULTI_ARTICLE_PLAN)         // plan
      .mockResolvedValueOnce(MULTI_ARTICLE_GENERATE_1)   // article 1
      .mockResolvedValueOnce(MULTI_ARTICLE_GENERATE_2);  // article 2

    const result = await synthesize(rawDir, mockStore as never);

    expect(result.articles).toHaveLength(2);
    const titles = result.articles.map((a) => a.frontmatter.title);
    expect(titles).toContain('Flash Attention');
    expect(titles).toContain('Transformer Architecture');

    // Article 2 should have [[flash-attention]] (known slug from article 1 in batch)
    const article2 = result.articles.find((a) => a.frontmatter.title === 'Transformer Architecture')!;
    expect(article2.body).toContain('[[flash-attention]]');
  });

  // Test 6: existing article found by dedup returns updated article, not duplicate (SYNTH-05)
  it('returns updated article (not duplicate) when existing article found by dedup (SYNTH-05)', async () => {
    const envelopes = [makeEnvelope(0), makeEnvelope(1), makeEnvelope(2)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    // Seed existing article in store
    const existingArticle: Article = {
      slug: 'flash-attention',
      frontmatter: {
        title: 'Flash Attention',
        tags: [],
        categories: ['Machine Learning'],
        sources: ['https://example.com/old-paper'],
        sourced_at: '2026-01-01T00:00:00.000Z',
        type: 'web',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        summary: 'Existing summary about flash attention.',
      },
      body: '## Old content\n\nOld info [1].\n\n## Sources\n\n1. [Old Paper](https://example.com/old-paper)',
    };
    mockStore.seedArticle(existingArticle);

    mockGenerateText
      .mockResolvedValueOnce(SINGLE_ARTICLE_PLAN)     // plan
      .mockResolvedValueOnce(UPDATE_ARTICLE_GENERATE); // update generate

    const result = await synthesize(rawDir, mockStore as never);

    expect(result.articles).toHaveLength(1);
    expect(result.updatedSlugs).toContain('flash-attention');
    // Should be a different (updated) article, not a new one
    expect(result.articles[0]!.slug).toBe('flash-attention');
    // Updated article should have merged sources
    expect(result.articles[0]!.frontmatter.sources).toContain('https://example.com/old-paper');
    expect(result.articles[0]!.frontmatter.sources).toContain('https://example.com/new-research');
  });

  // Test 7: parse failure retries once with stricter prompt, succeeds on retry (D-03)
  it('retries once with stricter prompt on parse failure, succeeds on retry (D-03)', async () => {
    const envelopes = [makeEnvelope(0), makeEnvelope(1)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    mockGenerateText
      .mockResolvedValueOnce(SINGLE_ARTICLE_PLAN)     // plan
      .mockResolvedValueOnce('INVALID GARBAGE OUTPUT') // first generate — fails to parse
      .mockResolvedValueOnce(SINGLE_ARTICLE_GENERATE); // retry — succeeds

    const result = await synthesize(rawDir, mockStore as never);

    expect(result.articles).toHaveLength(1);
    // generateText should have been called 3 times (plan + fail + retry)
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
    // Retry should include stricter note
    const retryCall = mockGenerateText.mock.calls[2] as [string, unknown];
    expect(retryCall[0]).toContain('IMPORTANT: You MUST follow the exact format');
  });

  // Test 8: parse failure after retry throws descriptive error
  it('throws descriptive error when parse fails after retry (D-03)', async () => {
    const envelopes = [makeEnvelope(0)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    mockGenerateText
      .mockResolvedValueOnce(SINGLE_ARTICLE_PLAN)
      .mockResolvedValueOnce('INVALID OUTPUT 1')  // first generate fails
      .mockResolvedValueOnce('INVALID OUTPUT 2'); // retry also fails

    await expect(synthesize(rawDir, mockStore as never)).rejects.toThrow(
      /could not parse LLM output for "Flash Attention" after retry/
    );
  });

  // Test 9: WikiStore.saveArticle() called for each produced article (SYNTH-06)
  it('calls WikiStore.saveArticle() for each produced article (SYNTH-06)', async () => {
    const envelopes = [makeEnvelope(0), makeEnvelope(1)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    const saveArticleSpy = vi.spyOn(mockStore, 'saveArticle');

    mockGenerateText
      .mockResolvedValueOnce(SINGLE_ARTICLE_PLAN)
      .mockResolvedValueOnce(SINGLE_ARTICLE_GENERATE);

    await synthesize(rawDir, mockStore as never);

    expect(saveArticleSpy).toHaveBeenCalledTimes(1);
    const savedArticle = saveArticleSpy.mock.calls[0]![0];
    expect(savedArticle.frontmatter.title).toBe('Flash Attention');
  });

  // Test 10: deduplicates titles within multi-article batch (RESEARCH Pitfall 3)
  it('deduplicates titles within multi-article batch (RESEARCH Pitfall 3)', async () => {
    const envelopes = [makeEnvelope(0), makeEnvelope(1), makeEnvelope(2)];
    const rawDir = await createRawDir(tmpDir, envelopes);

    // Plan returns two articles with the SAME title (and thus same slug)
    const duplicatePlan = `ARTICLE_COUNT: 2
ARTICLE_1_TITLE: Flash Attention
ARTICLE_1_SCOPE: Memory-efficient attention
ARTICLE_1_SOURCES: 0
ARTICLE_2_TITLE: Flash Attention
ARTICLE_2_SCOPE: Same topic from different angle
ARTICLE_2_SOURCES: 1,2`;

    mockGenerateText
      .mockResolvedValueOnce(duplicatePlan)
      .mockResolvedValueOnce(SINGLE_ARTICLE_GENERATE); // only one generate call expected

    const result = await synthesize(rawDir, mockStore as never);

    // Should only produce 1 article (duplicate was deduplicated)
    expect(result.articles).toHaveLength(1);
    // generateText should be called twice: plan + 1 generate (not 2 generates)
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  // Test 11: throws when no usable envelopes
  it('throws when all envelopes are excluded', async () => {
    const envelopes = [makeEnvelope(0, true), makeEnvelope(1, true)]; // all excluded
    const rawDir = await createRawDir(tmpDir, envelopes);

    await expect(synthesize(rawDir, mockStore as never)).rejects.toThrow(
      'No usable source envelopes found'
    );
  });
});

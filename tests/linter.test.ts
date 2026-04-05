import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Article } from '../src/types/article.js';
import { DEFAULTS } from '../src/config/config.js';

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
import { runLint } from '../src/lint/linter.js';
import type { LintCategory } from '../src/lint/linter.js';

// ---- Fixture helpers ----

const RECENT_DATE = new Date(Date.now() - 5 * 86400000).toISOString(); // 5 days ago (fresh)
const STALE_DATE = new Date(Date.now() - 60 * 86400000).toISOString(); // 60 days ago (stale with 30 day threshold)

function makeArticle(
  slug: string,
  title: string,
  overrides: Partial<{
    body: string;
    sourced_at: string | null;
    summary: string;
    categories: string[];
  }> = {}
): Article {
  return {
    slug,
    frontmatter: {
      title,
      tags: [],
      categories: overrides.categories ?? ['Test'],
      sources: [],
      sourced_at: overrides.sourced_at !== undefined ? overrides.sourced_at : RECENT_DATE,
      type: 'web',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      summary: overrides.summary ?? `Summary of ${title}`,
    },
    body: overrides.body ?? `## Overview\n\nContent about ${title}.\n`,
  };
}

const TEST_CONFIG = { ...DEFAULTS, freshness_days: 30 };

// ---- Tests ----

describe('runLint() — orphan check', () => {
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
  const mockSearch = search as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockSearch.mockReturnValue([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('Test 1 (orphan): article with no inbound wikilinks produces orphan finding', async () => {
    // Article A links to B. Article B has no inbound links (no one links to C).
    const articleA = makeArticle('article-a', 'Article A', { body: '## Overview\n\nSee [[article-b]].\n' });
    const articleB = makeArticle('article-b', 'Article B', { body: '## Overview\n\nContent.\n' });
    const articleC = makeArticle('article-c', 'Article C', { body: '## Overview\n\nOrphan content.\n' });

    // Only check orphans to avoid LLM calls for contradictions
    const report = await runLint([articleA, articleB, articleC], TEST_CONFIG, { categories: ['orphan'] });

    const orphanFindings = report.findings.filter((f) => f.category === 'orphan');
    expect(orphanFindings.length).toBeGreaterThan(0);
    const orphanC = orphanFindings.find((f) => f.affected.includes('article-c'));
    expect(orphanC).toBeDefined();
    expect(orphanC?.severity).toBe('warning');
    expect(orphanC?.suggestedFix).toContain('backlink');
  });
});

describe('runLint() — stale check', () => {
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
  const mockSearch = search as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockSearch.mockReturnValue([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('Test 2 (stale): article sourced 60 days ago with freshness_days=30 produces stale finding', async () => {
    const staleArticle = makeArticle('stale-article', 'Stale Article', { sourced_at: STALE_DATE });

    const report = await runLint([staleArticle], TEST_CONFIG, { categories: ['stale'] });

    const staleFindings = report.findings.filter((f) => f.category === 'stale');
    expect(staleFindings.length).toBe(1);
    expect(staleFindings[0]!.severity).toBe('warning');
    expect(staleFindings[0]!.affected).toContain('stale-article');
    expect(staleFindings[0]!.suggestedFix).toContain('--refresh');
  });

  it('Test 3 (stale null): article with sourced_at: null is always stale', async () => {
    const nullSourcingArticle = makeArticle('null-sourced', 'Null Sourced Article', { sourced_at: null });

    const report = await runLint([nullSourcingArticle], TEST_CONFIG, { categories: ['stale'] });

    const staleFindings = report.findings.filter((f) => f.category === 'stale');
    expect(staleFindings.length).toBe(1);
    expect(staleFindings[0]!.affected).toContain('null-sourced');
  });
});

describe('runLint() — missing-concept check', () => {
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
  const mockSearch = search as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockSearch.mockReturnValue([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('Test 4 (missing-concept): wikilink to nonexistent slug produces missing-concept finding', async () => {
    const articleWithBadLink = makeArticle('article-a', 'Article A', {
      body: '## Overview\n\nSee [[nonexistent-slug]] for details.\n',
    });

    const report = await runLint([articleWithBadLink], TEST_CONFIG, { categories: ['missing-concept'] });

    const missingFindings = report.findings.filter((f) => f.category === 'missing-concept');
    expect(missingFindings.length).toBeGreaterThan(0);
    const missingConcept = missingFindings.find((f) => f.affected.includes('nonexistent-slug'));
    expect(missingConcept).toBeDefined();
    expect(missingConcept?.severity).toBe('info');
    expect(missingConcept?.suggestedFix).toContain('wiki ask');
  });
});

describe('runLint() — missing-cross-ref check', () => {
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
  const mockBuildIndex = buildIndex as ReturnType<typeof vi.fn>;
  const mockSearch = search as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockBuildIndex.mockReturnValue({});
    mockSearch.mockReturnValue([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('Test 5 (missing-cross-ref): BM25 returns high-scoring match not linked → missing-cross-ref finding', async () => {
    const articleA = makeArticle('article-a', 'Article A', { body: '## Overview\n\nContent about A.\n' });
    const articleB = makeArticle('article-b', 'Article B', { body: '## Overview\n\nContent about B.\n' });

    // BM25 returns article-b as high-scoring match for article-a (score > 5.0)
    mockSearch.mockImplementation((_index: unknown, query: string) => {
      if (query === 'Article A') {
        return [{ slug: 'article-b', title: 'Article B', summary: 'Summary of B', score: 8.0 }];
      }
      return [];
    });

    const report = await runLint([articleA, articleB], TEST_CONFIG, { categories: ['missing-cross-ref'] });

    const crossRefFindings = report.findings.filter((f) => f.category === 'missing-cross-ref');
    expect(crossRefFindings.length).toBeGreaterThan(0);
    expect(crossRefFindings[0]!.severity).toBe('info');
    expect(crossRefFindings[0]!.suggestedFix).toContain('cross-reference');
  });
});

describe('runLint() — contradiction check', () => {
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
  const mockSearch = search as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockSearch.mockReturnValue([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('Test 6 (contradiction): LLM returns conflicting pair → contradiction finding with error severity', async () => {
    const articleA = makeArticle('article-a', 'Article A', { summary: 'Claims X is true' });
    const articleB = makeArticle('article-b', 'Article B', { summary: 'Claims X is false' });

    mockGenerateText.mockResolvedValueOnce(
      JSON.stringify([{ slugA: 'article-a', slugB: 'article-b', conflict: 'Article A says X is true but Article B says X is false' }])
    );

    const report = await runLint([articleA, articleB], TEST_CONFIG, { categories: ['contradiction'] });

    const contradictionFindings = report.findings.filter((f) => f.category === 'contradiction');
    expect(contradictionFindings.length).toBe(1);
    expect(contradictionFindings[0]!.severity).toBe('error');
    expect(contradictionFindings[0]!.affected).toContain('article-a');
    expect(contradictionFindings[0]!.affected).toContain('article-b');
    expect(contradictionFindings[0]!.suggestedFix).toContain('contradiction');
  });

  it('Test 7 (contradiction empty wiki): articles.length < 2 → no LLM call, no contradiction findings', async () => {
    const singleArticle = makeArticle('only-article', 'Only Article');

    const report = await runLint([singleArticle], TEST_CONFIG, { categories: ['contradiction'] });

    expect(mockGenerateText).not.toHaveBeenCalled();
    const contradictionFindings = report.findings.filter((f) => f.category === 'contradiction');
    expect(contradictionFindings.length).toBe(0);
  });
});

describe('runLint() — LintReport structure', () => {
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
  const mockSearch = search as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockSearch.mockReturnValue([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('Test 8 (LintReport): counts per category summed correctly, healthScore = % articles with zero findings', async () => {
    // Article A: orphan (no one links to it), fresh
    const articleA = makeArticle('article-a', 'Article A', { body: '## Overview\n\nContent.\n' });
    // Article B: links to A (so A is not an orphan), fresh
    const articleB = makeArticle('article-b', 'Article B', { body: '## Overview\n\nSee [[article-a]].\n' });

    // Only check orphans to keep it simple
    const report = await runLint([articleA, articleB], TEST_CONFIG, { categories: ['orphan'] });

    expect(report.articleCount).toBe(2);
    expect(typeof report.healthScore).toBe('number');
    expect(report.healthScore).toBeGreaterThanOrEqual(0);
    expect(report.healthScore).toBeLessThanOrEqual(100);
    // counts should be an object with numeric values for each category
    for (const cat of ['orphan', 'stale', 'missing-concept', 'missing-cross-ref', 'contradiction'] as LintCategory[]) {
      expect(typeof report.counts[cat]).toBe('number');
    }
    // Sum of counts should equal findings length
    const total = Object.values(report.counts).reduce((acc, n) => acc + n, 0);
    expect(total).toBe(report.findings.length);
  });
});

describe('runLint() — category filter', () => {
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
  const mockSearch = search as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockSearch.mockReturnValue([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('Test 9 (category filter): runLint with categories=[stale] only runs stale check', async () => {
    // Articles that would produce orphan findings but we filter to stale only
    const staleArticle = makeArticle('stale', 'Stale Article', { sourced_at: STALE_DATE });
    const freshArticle = makeArticle('fresh', 'Fresh Article', { sourced_at: RECENT_DATE });

    const report = await runLint([staleArticle, freshArticle], TEST_CONFIG, { categories: ['stale'] });

    // Only stale findings present, no orphan findings
    expect(report.findings.every((f) => f.category === 'stale')).toBe(true);
    // LLM not called (contradiction skipped)
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});

describe('runLint() — LLM parse failure', () => {
  const mockGenerateText = generateText as ReturnType<typeof vi.fn>;
  const mockSearch = search as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGenerateText.mockReset();
    mockSearch.mockReturnValue([]);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('Test 10 (LLM parse failure): unparseable LLM response → empty contradictions, no throw', async () => {
    const articleA = makeArticle('article-a', 'Article A');
    const articleB = makeArticle('article-b', 'Article B');

    mockGenerateText.mockResolvedValueOnce('INVALID JSON }{{{');

    // Should not throw
    const report = await runLint([articleA, articleB], TEST_CONFIG, { categories: ['contradiction'] });

    const contradictionFindings = report.findings.filter((f) => f.category === 'contradiction');
    expect(contradictionFindings.length).toBe(0);
  });

  it('strips code fences from LLM response before parsing', async () => {
    const articleA = makeArticle('article-a', 'Article A', { summary: 'Claims X' });
    const articleB = makeArticle('article-b', 'Article B', { summary: 'Contradicts X' });

    mockGenerateText.mockResolvedValueOnce(
      '```json\n[{"slugA":"article-a","slugB":"article-b","conflict":"X vs not X"}]\n```'
    );

    const report = await runLint([articleA, articleB], TEST_CONFIG, { categories: ['contradiction'] });

    const contradictionFindings = report.findings.filter((f) => f.category === 'contradiction');
    expect(contradictionFindings.length).toBe(1);
  });
});

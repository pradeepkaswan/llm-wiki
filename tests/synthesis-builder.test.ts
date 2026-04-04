import { describe, it, expect } from 'vitest';
import { buildNewArticle, buildUpdatedArticle } from '../src/synthesis/article-builder.js';
import { stripHallucinatedWikilinks } from '../src/synthesis/wikilink-sanitizer.js';
import type { ParsedArticle } from '../src/synthesis/types.js';
import type { Article } from '../src/types/article.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const parsedArticle: ParsedArticle = {
  title: 'Flash Attention',
  summary: 'Memory-efficient exact attention algorithm',
  categories: ['Machine Learning', 'Transformers'],
  body: '## What Is Flash Attention\n\nFlash attention [1] is a memory-efficient algorithm.\n\n## Sources\n\n1. [Paper](https://example.com/paper)',
  sourceRefs: [{ index: 1, title: 'Paper', url: 'https://example.com/paper' }],
};

const existingArticle: Article = {
  slug: 'flash-attention',
  frontmatter: {
    title: 'Flash Attention',
    tags: ['ml'],
    categories: ['Machine Learning'],
    sources: ['https://example.com/old-source'],
    sourced_at: '2026-01-01T00:00:00.000Z',
    type: 'web',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    summary: 'Old summary',
  },
  body: 'Old body',
};

// ─── buildNewArticle ─────────────────────────────────────────────────────────

describe('buildNewArticle', () => {
  it('produces Article with correct slug derived from title', () => {
    const article = buildNewArticle(parsedArticle, new Set<string>());
    expect(article.slug).toBe('flash-attention');
  });

  it('produces Article with correct title', () => {
    const article = buildNewArticle(parsedArticle, new Set<string>());
    expect(article.frontmatter.title).toBe('Flash Attention');
  });

  it('produces Article with correct summary from ParsedArticle', () => {
    const article = buildNewArticle(parsedArticle, new Set<string>());
    expect(article.frontmatter.summary).toBe('Memory-efficient exact attention algorithm');
  });

  it('produces Article with correct categories from ParsedArticle', () => {
    const article = buildNewArticle(parsedArticle, new Set<string>());
    expect(article.frontmatter.categories).toEqual(['Machine Learning', 'Transformers']);
  });

  it('produces Article with sources as URL array from SourceRef[]', () => {
    const article = buildNewArticle(parsedArticle, new Set<string>());
    expect(article.frontmatter.sources).toEqual(['https://example.com/paper']);
  });

  it('produces Article with type: "web"', () => {
    const article = buildNewArticle(parsedArticle, new Set<string>());
    expect(article.frontmatter.type).toBe('web');
  });

  it('sets created_at and updated_at to current ISO timestamp', () => {
    const before = new Date().toISOString();
    const article = buildNewArticle(parsedArticle, new Set<string>());
    const after = new Date().toISOString();

    expect(article.frontmatter.created_at >= before).toBe(true);
    expect(article.frontmatter.created_at <= after).toBe(true);
    expect(article.frontmatter.updated_at).toBe(article.frontmatter.created_at);
  });

  it('sets sourced_at to current ISO timestamp', () => {
    const before = new Date().toISOString();
    const article = buildNewArticle(parsedArticle, new Set<string>());
    const after = new Date().toISOString();

    expect(article.frontmatter.sourced_at).not.toBeNull();
    expect(article.frontmatter.sourced_at! >= before).toBe(true);
    expect(article.frontmatter.sourced_at! <= after).toBe(true);
  });

  it('only includes source URLs that were actually cited (from SourceRef[])', () => {
    const multiSourceParsed: ParsedArticle = {
      ...parsedArticle,
      sourceRefs: [
        { index: 1, title: 'Paper One', url: 'https://example.com/one' },
        { index: 2, title: 'Paper Two', url: 'https://example.com/two' },
      ],
    };
    const article = buildNewArticle(multiSourceParsed, new Set<string>());
    expect(article.frontmatter.sources).toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ]);
  });

  it('uses Uncategorized fallback when LLM provides no categories', () => {
    const noCategories: ParsedArticle = { ...parsedArticle, categories: [] };
    const article = buildNewArticle(noCategories, new Set<string>());
    expect(article.frontmatter.categories).toEqual(['Uncategorized']);
  });

  it('applies wikilink sanitization to body', () => {
    const parsedWithWikilinks: ParsedArticle = {
      ...parsedArticle,
      body: '[[transformer-architecture]] is related. See also [[fake-article]].',
    };
    const knownSlugs = new Set(['transformer-architecture']);
    const article = buildNewArticle(parsedWithWikilinks, knownSlugs);
    expect(article.body).toContain('[[transformer-architecture]]');
    expect(article.body).not.toContain('[[fake-article]]');
    expect(article.body).toContain('fake-article'); // stripped to plain text
  });
});

// ─── buildUpdatedArticle ─────────────────────────────────────────────────────

describe('buildUpdatedArticle', () => {
  it('preserves the existing article slug', () => {
    const updated = buildUpdatedArticle(existingArticle, parsedArticle, new Set<string>());
    expect(updated.slug).toBe('flash-attention');
  });

  it('merges old + new source URLs with no duplicates', () => {
    const updated = buildUpdatedArticle(existingArticle, parsedArticle, new Set<string>());
    expect(updated.frontmatter.sources).toContain('https://example.com/old-source');
    expect(updated.frontmatter.sources).toContain('https://example.com/paper');
    expect(updated.frontmatter.sources).toHaveLength(2); // no duplicates
  });

  it('deduplicates when old and new have overlapping URLs', () => {
    const parsedWithOldUrl: ParsedArticle = {
      ...parsedArticle,
      sourceRefs: [{ index: 1, title: 'Old Source', url: 'https://example.com/old-source' }],
    };
    const updated = buildUpdatedArticle(existingArticle, parsedWithOldUrl, new Set<string>());
    // Should deduplicate — old-source appears only once
    const count = updated.frontmatter.sources.filter(
      (u) => u === 'https://example.com/old-source'
    ).length;
    expect(count).toBe(1);
  });

  it('preserves original created_at', () => {
    const updated = buildUpdatedArticle(existingArticle, parsedArticle, new Set<string>());
    expect(updated.frontmatter.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('updates updated_at to current timestamp', () => {
    const before = new Date().toISOString();
    const updated = buildUpdatedArticle(existingArticle, parsedArticle, new Set<string>());
    const after = new Date().toISOString();

    expect(updated.frontmatter.updated_at > '2026-01-01T00:00:00.000Z').toBe(true);
    expect(updated.frontmatter.updated_at >= before).toBe(true);
    expect(updated.frontmatter.updated_at <= after).toBe(true);
  });

  it('updates sourced_at to current timestamp', () => {
    const before = new Date().toISOString();
    const updated = buildUpdatedArticle(existingArticle, parsedArticle, new Set<string>());
    const after = new Date().toISOString();

    expect(updated.frontmatter.sourced_at).not.toBeNull();
    expect(updated.frontmatter.sourced_at! > '2026-01-01T00:00:00.000Z').toBe(true);
    expect(updated.frontmatter.sourced_at! >= before).toBe(true);
    expect(updated.frontmatter.sourced_at! <= after).toBe(true);
  });

  it('sets frontmatter.sources to union of old and new', () => {
    const updated = buildUpdatedArticle(existingArticle, parsedArticle, new Set<string>());
    const sources = updated.frontmatter.sources;
    expect(sources).toContain('https://example.com/old-source');
    expect(sources).toContain('https://example.com/paper');
  });

  it('updates summary from new ParsedArticle', () => {
    const updated = buildUpdatedArticle(existingArticle, parsedArticle, new Set<string>());
    expect(updated.frontmatter.summary).toBe('Memory-efficient exact attention algorithm');
  });

  it('updates categories from new ParsedArticle', () => {
    const updated = buildUpdatedArticle(existingArticle, parsedArticle, new Set<string>());
    expect(updated.frontmatter.categories).toEqual(['Machine Learning', 'Transformers']);
  });

  it('preserves existing categories when new ParsedArticle has none', () => {
    const noCategories: ParsedArticle = { ...parsedArticle, categories: [] };
    const updated = buildUpdatedArticle(existingArticle, noCategories, new Set<string>());
    expect(updated.frontmatter.categories).toEqual(['Machine Learning']); // from existing
  });

  it('applies wikilink sanitization to updated body', () => {
    const parsedWithLinks: ParsedArticle = {
      ...parsedArticle,
      body: '[[transformer-architecture]] is related. See also [[hallucinated-link]].',
    };
    const knownSlugs = new Set(['transformer-architecture']);
    const updated = buildUpdatedArticle(existingArticle, parsedWithLinks, knownSlugs);
    expect(updated.body).toContain('[[transformer-architecture]]');
    expect(updated.body).not.toContain('[[hallucinated-link]]');
  });
});

// ─── stripHallucinatedWikilinks ──────────────────────────────────────────────

describe('stripHallucinatedWikilinks', () => {
  it('preserves valid wikilinks in known slugs set', () => {
    const knownSlugs = new Set(['flash-attention', 'transformer-architecture']);
    const body = '[[flash-attention]] and [[transformer-architecture]] are related.';
    const result = stripHallucinatedWikilinks(body, knownSlugs);
    expect(result).toBe('[[flash-attention]] and [[transformer-architecture]] are related.');
  });

  it('strips hallucinated [[bad-link]] to plain text', () => {
    const knownSlugs = new Set(['flash-attention']);
    const body = 'See [[flash-attention]] and [[hallucinated-article]] for details.';
    const result = stripHallucinatedWikilinks(body, knownSlugs);
    expect(result).toBe('See [[flash-attention]] and hallucinated-article for details.');
  });

  it('strips [[slug|display text]] — checks slug part, uses display text as fallback', () => {
    const knownSlugs = new Set<string>(); // nothing valid
    const body = 'See [[flash-attention|Flash Attention Paper]] for details.';
    const result = stripHallucinatedWikilinks(body, knownSlugs);
    // Slug not in knownSlugs → strip wikilink, use display text "Flash Attention Paper"
    expect(result).toBe('See Flash Attention Paper for details.');
  });

  it('preserves [[slug|display text]] when slug is in known slugs set', () => {
    const knownSlugs = new Set(['flash-attention']);
    const body = 'See [[flash-attention|Flash Attention Paper]] for details.';
    const result = stripHallucinatedWikilinks(body, knownSlugs);
    // Slug valid → preserve full wikilink with display text
    expect(result).toBe('See [[flash-attention|Flash Attention Paper]] for details.');
  });

  it('leaves body unchanged when all wikilinks are valid', () => {
    const knownSlugs = new Set(['article-a', 'article-b']);
    const body = '[[article-a]] references [[article-b]].';
    const result = stripHallucinatedWikilinks(body, knownSlugs);
    expect(result).toBe(body);
  });

  it('handles body with no wikilinks (passthrough)', () => {
    const knownSlugs = new Set(['flash-attention']);
    const body = 'This is a body with no wikilinks at all.';
    const result = stripHallucinatedWikilinks(body, knownSlugs);
    expect(result).toBe(body);
  });

  it('strips slug to plain text when no display text provided', () => {
    const knownSlugs = new Set<string>();
    const body = 'See [[unknown-article]].';
    const result = stripHallucinatedWikilinks(body, knownSlugs);
    expect(result).toBe('See unknown-article.');
  });

  it('handles multiple invalid wikilinks in one pass', () => {
    const knownSlugs = new Set(['valid-article']);
    const body = '[[valid-article]] with [[bad-one]] and [[bad-two|Bad Two]] mixed.';
    const result = stripHallucinatedWikilinks(body, knownSlugs);
    expect(result).toBe('[[valid-article]] with bad-one and Bad Two mixed.');
  });
});

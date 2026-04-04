import { describe, it, expect } from 'vitest';
import {
  parsePlanOutput,
  parseArticleOutput,
  parseTiebreakDecision,
} from '../src/synthesis/output-parser.js';
import {
  buildPlanPrompt,
  buildGeneratePrompt,
  buildUpdatePrompt,
  buildTiebreakPrompt,
} from '../src/synthesis/prompt-builder.js';
import type { SynthesisInput, ArticlePlan } from '../src/synthesis/types.js';
import type { Article } from '../src/types/article.js';
import type { RawSourceEnvelope } from '../src/types/ingestion.js';

// ---- Test fixtures ----

const makeEnvelope = (
  overrides: Partial<RawSourceEnvelope> = {}
): RawSourceEnvelope => ({
  url: 'https://example.com/article',
  title: 'Example Article',
  markdown: 'This is the content of the article. '.repeat(100),
  fetched_at: '2026-04-04T00:00:00Z',
  query: 'test query',
  search_rank: 1,
  content_length: 3600,
  excluded: false,
  exclude_reason: null,
  ...overrides,
});

const makeArticle = (overrides: Partial<Article> = {}): Article => ({
  slug: 'flash-attention',
  frontmatter: {
    title: 'Flash Attention',
    tags: [],
    categories: ['Machine Learning'],
    sources: ['https://arxiv.org/abs/2205.14135'],
    sourced_at: '2026-04-04T00:00:00Z',
    type: 'web',
    created_at: '2026-04-04T00:00:00Z',
    updated_at: '2026-04-04T00:00:00Z',
    summary: 'Flash attention is a memory-efficient exact attention algorithm.',
  },
  body: '## Overview\nFlash attention...',
  ...overrides,
});

// ---- parsePlanOutput ----

describe('parsePlanOutput', () => {
  it('parses single-article plan (ARTICLE_COUNT: 1)', () => {
    const raw = `ARTICLE_COUNT: 1
ARTICLE_1_TITLE: Flash Attention
ARTICLE_1_SCOPE: Core mechanism and memory efficiency
ARTICLE_1_SOURCES: 0,1,2`;

    const result = parsePlanOutput(raw, 3);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Flash Attention');
    expect(result[0].scope).toBe('Core mechanism and memory efficiency');
    expect(result[0].sourceIndices).toEqual([0, 1, 2]);
  });

  it('parses multi-article plan (ARTICLE_COUNT: 2) with correct titles, scopes, and source indices', () => {
    const raw = `ARTICLE_COUNT: 2
ARTICLE_1_TITLE: Transformer Architecture Overview
ARTICLE_1_SCOPE: Core mechanism, attention layers, encoder-decoder structure
ARTICLE_1_SOURCES: 0,2,3
ARTICLE_2_TITLE: Attention Mechanisms in Depth
ARTICLE_2_SCOPE: Scaled dot-product attention, multi-head attention, computational complexity
ARTICLE_2_SOURCES: 1,4`;

    const result = parsePlanOutput(raw, 5);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Transformer Architecture Overview');
    expect(result[0].scope).toBe(
      'Core mechanism, attention layers, encoder-decoder structure'
    );
    expect(result[0].sourceIndices).toEqual([0, 2, 3]);
    expect(result[1].title).toBe('Attention Mechanisms in Depth');
    expect(result[1].scope).toBe(
      'Scaled dot-product attention, multi-head attention, computational complexity'
    );
    expect(result[1].sourceIndices).toEqual([1, 4]);
  });

  it('returns fallback single-article plan when LLM output is malformed', () => {
    const raw = `I cannot determine the article structure from these sources.
Please provide more context about what you want to know.`;

    const result = parsePlanOutput(raw, 3);

    expect(result).toHaveLength(1);
    expect(result[0].sourceIndices).toEqual([0, 1, 2]);
  });

  it('strips markdown code fences before parsing', () => {
    const raw = `\`\`\`
ARTICLE_COUNT: 1
ARTICLE_1_TITLE: Test Article
ARTICLE_1_SCOPE: Test scope
ARTICLE_1_SOURCES: 0
\`\`\``;

    const result = parsePlanOutput(raw, 1);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Article');
  });

  it('filters out-of-range source indices', () => {
    const raw = `ARTICLE_COUNT: 1
ARTICLE_1_TITLE: Test Article
ARTICLE_1_SCOPE: Some scope
ARTICLE_1_SOURCES: 0,1,99`;

    const result = parsePlanOutput(raw, 2);

    expect(result[0].sourceIndices).toEqual([0, 1]);
  });

  it('handles empty ARTICLE_COUNT gracefully with fallback', () => {
    const raw = `ARTICLE_COUNT:
ARTICLE_1_TITLE: Something`;

    const result = parsePlanOutput(raw, 2);

    expect(result).toHaveLength(1);
    expect(result[0].sourceIndices).toEqual([0, 1]);
  });
});

// ---- parseArticleOutput ----

describe('parseArticleOutput', () => {
  const wellFormedOutput = `TITLE: Flash Attention

SUMMARY: Flash attention is a memory-efficient exact attention algorithm that uses tiling.

CATEGORIES: Machine Learning, Algorithms

BODY:
## What Is Flash Attention

Flash attention [1] solves the memory bottleneck in standard attention by computing attention in tiles.

## How It Works

It uses HBM-SRAM tiling [2] to reduce memory reads/writes from O(N²) to O(N).

## Sources

1. [Flash Attention Paper](https://arxiv.org/abs/2205.14135)
2. [Tri Dao's Blog](https://tridao.me/blog/)`;

  it('extracts title, summary, categories, body, and sourceRefs from well-formed output', () => {
    const result = parseArticleOutput(wellFormedOutput);

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Flash Attention');
    expect(result!.summary).toBe(
      'Flash attention is a memory-efficient exact attention algorithm that uses tiling.'
    );
    expect(result!.categories).toEqual(['Machine Learning', 'Algorithms']);
    expect(result!.body).toContain('## What Is Flash Attention');
    expect(result!.body).toContain('[1]');
    expect(result!.body).toContain('## Sources');
    expect(result!.sourceRefs).toHaveLength(2);
    expect(result!.sourceRefs[0]).toEqual({
      index: 1,
      title: 'Flash Attention Paper',
      url: 'https://arxiv.org/abs/2205.14135',
    });
    expect(result!.sourceRefs[1]).toEqual({
      index: 2,
      title: "Tri Dao's Blog",
      url: 'https://tridao.me/blog/',
    });
  });

  it('handles markdown code fences wrapping the output (strips them)', () => {
    const fenced = `\`\`\`markdown
${wellFormedOutput}
\`\`\``;

    const result = parseArticleOutput(fenced);

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Flash Attention');
    expect(result!.body).toContain('## What Is Flash Attention');
  });

  it('handles code fences without language specifier', () => {
    const fenced = `\`\`\`
${wellFormedOutput}
\`\`\``;

    const result = parseArticleOutput(fenced);

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Flash Attention');
  });

  it('defaults categories to Uncategorized when CATEGORIES line is missing', () => {
    const noCategories = `TITLE: Test Article

SUMMARY: A test summary.

BODY:
## Section

Content here.

## Sources

1. [Source](https://example.com)`;

    const result = parseArticleOutput(noCategories);

    expect(result).not.toBeNull();
    expect(result!.categories).toEqual(['Uncategorized']);
  });

  it('returns null on completely unparseable output (no TITLE or BODY)', () => {
    const garbage = `I don't understand this question. Can you please provide more context?
This is just some random text that has no structure.
Blah blah blah.`;

    const result = parseArticleOutput(garbage);

    expect(result).toBeNull();
  });

  it('returns null when TITLE is present but BODY is missing', () => {
    const missingBody = `TITLE: Test Article

SUMMARY: A summary.

CATEGORIES: Test`;

    const result = parseArticleOutput(missingBody);

    expect(result).toBeNull();
  });

  it('extracts empty sourceRefs when no ## Sources section exists in body', () => {
    const noSources = `TITLE: Test Article

SUMMARY: Summary here.

CATEGORIES: Test

BODY:
## Overview

Some content without sources.`;

    const result = parseArticleOutput(noSources);

    expect(result).not.toBeNull();
    expect(result!.sourceRefs).toEqual([]);
  });

  it('trims whitespace from extracted fields', () => {
    const whitespace = `TITLE:   Spaced Title

SUMMARY:   Spaced summary.

CATEGORIES:  Cat A ,  Cat B

BODY:
## Content

Some content.`;

    const result = parseArticleOutput(whitespace);

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Spaced Title');
    expect(result!.summary).toBe('Spaced summary.');
    expect(result!.categories).toEqual(['Cat A', 'Cat B']);
  });
});

// ---- parseTiebreakDecision ----

describe('parseTiebreakDecision', () => {
  it('returns "update" for "UPDATE"', () => {
    expect(parseTiebreakDecision('UPDATE')).toBe('update');
  });

  it('returns "update" for lowercase "update"', () => {
    expect(parseTiebreakDecision('update')).toBe('update');
  });

  it('returns "update" for mixed case "Update"', () => {
    expect(parseTiebreakDecision('Update')).toBe('update');
  });

  it('returns "new" for "NEW"', () => {
    expect(parseTiebreakDecision('NEW')).toBe('new');
  });

  it('returns "new" for ambiguous or unexpected input', () => {
    expect(parseTiebreakDecision('I am not sure')).toBe('new');
    expect(parseTiebreakDecision('')).toBe('new');
    expect(parseTiebreakDecision('MAYBE')).toBe('new');
  });

  it('returns "update" when UPDATE appears in longer text', () => {
    expect(parseTiebreakDecision('I recommend UPDATE for this article.')).toBe(
      'update'
    );
  });
});

// ---- buildPlanPrompt ----

describe('buildPlanPrompt', () => {
  it('includes the original question', () => {
    const input: SynthesisInput = {
      question: 'How does flash attention work?',
      envelopes: [makeEnvelope()],
      existingArticles: [],
    };

    const prompt = buildPlanPrompt(input);

    expect(prompt).toContain('How does flash attention work?');
  });

  it('includes source titles and URLs', () => {
    const input: SynthesisInput = {
      question: 'test question',
      envelopes: [
        makeEnvelope({ title: 'Test Article', url: 'https://test.com' }),
      ],
      existingArticles: [],
    };

    const prompt = buildPlanPrompt(input);

    expect(prompt).toContain('Test Article');
    expect(prompt).toContain('https://test.com');
  });

  it('truncates source content to 3000 chars per source', () => {
    const longContent = 'x'.repeat(10000);
    const input: SynthesisInput = {
      question: 'test',
      envelopes: [makeEnvelope({ markdown: longContent })],
      existingArticles: [],
    };

    const prompt = buildPlanPrompt(input);

    // The prompt should contain 3000 chars of content but NOT 10000
    expect(prompt).toContain('x'.repeat(100));
    // Check that the full 10000-char string is not present
    expect(prompt).not.toContain('x'.repeat(5000));
  });

  it('includes existing article titles', () => {
    const input: SynthesisInput = {
      question: 'test',
      envelopes: [makeEnvelope()],
      existingArticles: [makeArticle({ slug: 'flash-attention' })],
    };

    const prompt = buildPlanPrompt(input);

    expect(prompt).toContain('Flash Attention');
  });

  it('includes format instructions with ARTICLE_COUNT', () => {
    const input: SynthesisInput = {
      question: 'test',
      envelopes: [makeEnvelope()],
      existingArticles: [],
    };

    const prompt = buildPlanPrompt(input);

    expect(prompt).toContain('ARTICLE_COUNT');
    expect(prompt).toContain('ARTICLE_1_TITLE');
  });
});

// ---- buildGeneratePrompt ----

describe('buildGeneratePrompt', () => {
  it('includes the question and plan title/scope', () => {
    const plan: ArticlePlan = {
      title: 'Flash Attention',
      scope: 'Memory-efficient attention mechanism',
      sourceIndices: [0],
    };
    const sources = [makeEnvelope()];

    const prompt = buildGeneratePrompt(
      'How does flash attention work?',
      plan,
      sources,
      []
    );

    expect(prompt).toContain('How does flash attention work?');
    expect(prompt).toContain('Flash Attention');
    expect(prompt).toContain('Memory-efficient attention mechanism');
  });

  it('includes known article slugs for wikilinks', () => {
    const plan: ArticlePlan = {
      title: 'Test',
      scope: 'Test scope',
      sourceIndices: [0],
    };
    const sources = [makeEnvelope()];

    const prompt = buildGeneratePrompt('test question', plan, sources, [
      'transformer-architecture',
      'attention-mechanism',
    ]);

    expect(prompt).toContain('transformer-architecture');
    expect(prompt).toContain('attention-mechanism');
  });

  it('includes source markdown content truncated to 3000 chars', () => {
    const longContent = 'y'.repeat(10000);
    const plan: ArticlePlan = {
      title: 'Test',
      scope: 'Test scope',
      sourceIndices: [0],
    };
    const sources = [makeEnvelope({ markdown: longContent })];

    const prompt = buildGeneratePrompt('test', plan, sources, []);

    expect(prompt).toContain('y'.repeat(100));
    expect(prompt).not.toContain('y'.repeat(5000));
  });

  it('includes TITLE, SUMMARY, CATEGORIES, BODY format instructions', () => {
    const plan: ArticlePlan = {
      title: 'Test',
      scope: 'scope',
      sourceIndices: [0],
    };
    const sources = [makeEnvelope()];

    const prompt = buildGeneratePrompt('question', plan, sources, []);

    expect(prompt).toContain('TITLE:');
    expect(prompt).toContain('SUMMARY:');
    expect(prompt).toContain('CATEGORIES:');
    expect(prompt).toContain('BODY:');
  });

  it('warns not to wrap in markdown code fences', () => {
    const plan: ArticlePlan = {
      title: 'Test',
      scope: 'scope',
      sourceIndices: [0],
    };
    const sources = [makeEnvelope()];

    const prompt = buildGeneratePrompt('question', plan, sources, []);

    // Should contain warning about code fences
    expect(prompt.toLowerCase()).toMatch(/do not|don't|never|without/);
    expect(prompt).toContain('```');
  });
});

// ---- buildUpdatePrompt ----

describe('buildUpdatePrompt', () => {
  it('includes existing article body', () => {
    const article = makeArticle({ body: '## Overview\nExisting content here.' });
    const newSources = [makeEnvelope()];

    const prompt = buildUpdatePrompt(article, newSources, 'test question', []);

    expect(prompt).toContain('## Overview\nExisting content here.');
  });

  it('includes new source material', () => {
    const article = makeArticle();
    const newSources = [
      makeEnvelope({ title: 'New Source', url: 'https://newsource.com' }),
    ];

    const prompt = buildUpdatePrompt(article, newSources, 'test question', []);

    expect(prompt).toContain('New Source');
    expect(prompt).toContain('https://newsource.com');
  });

  it('includes the question', () => {
    const article = makeArticle();
    const prompt = buildUpdatePrompt(
      article,
      [makeEnvelope()],
      'What is new about flash attention?',
      []
    );

    expect(prompt).toContain('What is new about flash attention?');
  });
});

// ---- buildTiebreakPrompt ----

describe('buildTiebreakPrompt', () => {
  it('includes planned title', () => {
    const prompt = buildTiebreakPrompt(
      'Flash Attention v2',
      'Flash attention is an efficient attention algorithm.'
    );

    expect(prompt).toContain('Flash Attention v2');
  });

  it('includes existing article summary', () => {
    const prompt = buildTiebreakPrompt(
      'Flash Attention v2',
      'Flash attention is an efficient attention algorithm.'
    );

    expect(prompt).toContain(
      'Flash attention is an efficient attention algorithm.'
    );
  });

  it('instructs to respond with UPDATE or NEW', () => {
    const prompt = buildTiebreakPrompt('Title', 'Summary.');

    expect(prompt).toContain('UPDATE');
    expect(prompt).toContain('NEW');
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildPlanPrompt,
  buildGeneratePrompt,
  buildUpdatePrompt,
} from '../src/synthesis/prompt-builder.js';
import { buildFilingPrompt } from '../src/retrieval/article-filer.js';
import type { SynthesisInput, ArticlePlan } from '../src/synthesis/types.js';
import type { Article, Frontmatter } from '../src/types/article.js';
import type { RawSourceEnvelope } from '../src/types/ingestion.js';

// --- Fixture helpers ---

function makeEnvelope(index: number): RawSourceEnvelope {
  return {
    url: `https://example.com/source-${index}`,
    title: `Source ${index}`,
    markdown: `Content from source ${index}.`,
    fetched_at: '2026-04-04T00:00:00.000Z',
    query: 'test question',
    search_rank: index,
    content_length: 100,
    excluded: false,
    exclude_reason: null,
  };
}

function makeArticle(slug: string, title: string): Article {
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
  return { slug, frontmatter: fm, body: '## Overview\n\nContent here.' };
}

const TEST_SCHEMA = '# Wiki Schema\n\n## Category Taxonomy\n\n- **Machine Learning**: AI topics.';

describe('buildPlanPrompt with schema', () => {
  it('includes WIKI SCHEMA section in output', () => {
    const input: SynthesisInput = {
      question: 'How does flash attention work?',
      envelopes: [makeEnvelope(0), makeEnvelope(1)],
      existingArticles: [],
    };

    const output = buildPlanPrompt(input, TEST_SCHEMA);

    expect(output).toContain('WIKI SCHEMA');
    expect(output).toContain(TEST_SCHEMA);
  });
});

describe('buildGeneratePrompt with schema', () => {
  it('includes WIKI SCHEMA section before WIKILINKS', () => {
    const plan: ArticlePlan = {
      title: 'Flash Attention',
      scope: 'Memory-efficient attention algorithm',
      sourceIndices: [0],
    };

    const output = buildGeneratePrompt(
      'How does flash attention work?',
      plan,
      [makeEnvelope(0)],
      ['transformer-architecture'],
      TEST_SCHEMA,
    );

    expect(output).toContain('WIKI SCHEMA');
    expect(output).toContain(TEST_SCHEMA);

    // WIKI SCHEMA should appear before WIKILINKS
    const schemaPos = output.indexOf('WIKI SCHEMA');
    const wikilinksPos = output.indexOf('WIKILINKS');
    expect(schemaPos).toBeLessThan(wikilinksPos);
  });
});

describe('buildUpdatePrompt with schema', () => {
  it('includes WIKI SCHEMA section in output', () => {
    const existing = makeArticle('flash-attention', 'Flash Attention');

    const output = buildUpdatePrompt(
      existing,
      [makeEnvelope(0)],
      'How does flash attention work?',
      ['transformer-architecture'],
      TEST_SCHEMA,
    );

    expect(output).toContain('WIKI SCHEMA');
    expect(output).toContain(TEST_SCHEMA);
  });
});

describe('buildFilingPrompt with schema', () => {
  it('includes WIKI SCHEMA section in output', () => {
    const output = buildFilingPrompt(
      'How does flash attention work?',
      'Flash attention works by tiling computation.',
      [makeArticle('flash-attention', 'Flash Attention')],
      TEST_SCHEMA,
    );

    expect(output).toContain('WIKI SCHEMA');
    expect(output).toContain(TEST_SCHEMA);
  });
});

import { describe, it, expect } from 'vitest';
import { buildIndex, search } from '../src/search/search-index.js';
import type { Article, Frontmatter } from '../src/types/article.js';

function makeArticle(slug: string, title: string, summary: string, body: string, tags: string[] = []): Article {
  const frontmatter: Frontmatter = {
    title,
    tags,
    categories: ['Test'],
    sources: [],
    sourced_at: null,
    type: 'web',
    created_at: '2026-04-04T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
    summary,
  };
  return { slug, frontmatter, body };
}

describe('buildIndex', () => {
  it('returns a MiniSearch instance for empty array', () => {
    const index = buildIndex([]);
    expect(index).toBeDefined();
    const results = search(index, 'anything');
    expect(results).toEqual([]);
  });

  it('indexes articles by title, summary, and body', () => {
    const articles = [
      makeArticle('flash-attention', 'Flash Attention', 'Efficient attention mechanism', 'Flash Attention reduces memory usage', ['attention', 'optimization']),
      makeArticle('transformers', 'Transformer Architecture', 'Neural network architecture', 'Self-attention and feedforward layers'),
    ];
    const index = buildIndex(articles);
    const results = search(index, 'attention');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].slug).toBe('flash-attention'); // title boost makes it rank first
  });

  it('returns empty array for no matches', () => {
    const articles = [makeArticle('foo', 'Foo', 'About foo', 'Foo content')];
    const index = buildIndex(articles);
    expect(search(index, 'xyzzy_nomatch_12345')).toEqual([]);
  });

  it('returns results with slug, title, summary, score fields', () => {
    const articles = [makeArticle('test', 'Test Article', 'Test summary', 'Test body content')];
    const index = buildIndex(articles);
    const results = search(index, 'test');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('slug');
    expect(results[0]).toHaveProperty('title');
    expect(results[0]).toHaveProperty('summary');
    expect(results[0]).toHaveProperty('score');
  });
});

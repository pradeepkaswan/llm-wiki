import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Article } from '../src/types/article.js';
import { enforceBacklinks } from '../src/synthesis/backlink-enforcer.js';

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

function makeArticle(slug: string, title: string, body: string): Article {
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
      summary: `Summary of ${title}`,
    },
    body,
  };
}

// ---- Tests ----

describe('enforceBacklinks()', () => {
  let store: MockWikiStore;

  beforeEach(() => {
    store = new MockWikiStore();
  });

  it('extracts [[wikilinks]] from article body — [[slug]] format', async () => {
    const article = makeArticle(
      'flash-attention',
      'Flash Attention',
      '## Overview\n\nSee [[transformer-architecture]] for context.\n'
    );
    const target = makeArticle('transformer-architecture', 'Transformer Architecture', '## Overview\n\nBase architecture.\n');
    store.seedArticle(target);

    const updated = await enforceBacklinks(article, store);
    expect(updated).toContain('transformer-architecture');
  });

  it('extracts [[slug|display text]] wikilinks correctly', async () => {
    const article = makeArticle(
      'flash-attention',
      'Flash Attention',
      '## Overview\n\nSee [[transformer-architecture|Transformer]] for context.\n'
    );
    const target = makeArticle('transformer-architecture', 'Transformer Architecture', '## Overview\n\nBase architecture.\n');
    store.seedArticle(target);

    const updated = await enforceBacklinks(article, store);
    expect(updated).toContain('transformer-architecture');
  });

  it('reads each target article via store.getArticle() and adds reciprocal backlink', async () => {
    const article = makeArticle(
      'flash-attention',
      'Flash Attention',
      '## Overview\n\nSee [[transformer-architecture]] for context.\n'
    );
    const target = makeArticle('transformer-architecture', 'Transformer Architecture', '## Overview\n\nBase architecture.\n');
    store.seedArticle(target);

    const getArticleSpy = vi.spyOn(store, 'getArticle');
    await enforceBacklinks(article, store);

    expect(getArticleSpy).toHaveBeenCalledWith('transformer-architecture');
  });

  it('saves updated target articles via store.saveArticle with operation update', async () => {
    const article = makeArticle(
      'flash-attention',
      'Flash Attention',
      '## Overview\n\nSee [[transformer-architecture]] for context.\n'
    );
    const target = makeArticle('transformer-architecture', 'Transformer Architecture', '## Overview\n\nBase architecture.\n');
    store.seedArticle(target);

    const saveArticleSpy = vi.spyOn(store, 'saveArticle');
    await enforceBacklinks(article, store);

    expect(saveArticleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'transformer-architecture' }),
      'update'
    );
  });

  it('skips targets that already have the backlink (idempotency via upsertSeeAlsoEntry)', async () => {
    const article = makeArticle(
      'flash-attention',
      'Flash Attention',
      '## Overview\n\nSee [[transformer-architecture]] for context.\n'
    );
    // Target already has the backlink in See Also
    const target = makeArticle(
      'transformer-architecture',
      'Transformer Architecture',
      '## Overview\n\nBase architecture.\n\n## See Also\n\n- [[flash-attention]] - Related: Flash Attention\n'
    );
    store.seedArticle(target);

    const saveArticleSpy = vi.spyOn(store, 'saveArticle');
    const updated = await enforceBacklinks(article, store);

    // Save should NOT be called since backlink already exists
    expect(saveArticleSpy).not.toHaveBeenCalled();
    expect(updated).toEqual([]);
  });

  it('skips wikilinks whose target article does not exist (getArticle returns null)', async () => {
    const article = makeArticle(
      'flash-attention',
      'Flash Attention',
      '## Overview\n\nSee [[nonexistent-article]] for context.\n'
    );
    // Do NOT seed nonexistent-article in store

    const saveArticleSpy = vi.spyOn(store, 'saveArticle');
    const updated = await enforceBacklinks(article, store);

    expect(saveArticleSpy).not.toHaveBeenCalled();
    expect(updated).toEqual([]);
  });

  it('does NOT add a self-referential backlink (article linking to itself)', async () => {
    const article = makeArticle(
      'flash-attention',
      'Flash Attention',
      '## Overview\n\nSee [[flash-attention]] for more.\n'
    );
    store.seedArticle(article);

    const saveArticleSpy = vi.spyOn(store, 'saveArticle');
    const updated = await enforceBacklinks(article, store);

    expect(saveArticleSpy).not.toHaveBeenCalled();
    expect(updated).toEqual([]);
  });

  it('returns array of slugs that were actually updated', async () => {
    const article = makeArticle(
      'flash-attention',
      'Flash Attention',
      '## Overview\n\nSee [[transformer-architecture]] and [[attention-mechanism]].\n'
    );
    store.seedArticle(makeArticle('transformer-architecture', 'Transformer Architecture', '## Overview\n\nContent.\n'));
    store.seedArticle(makeArticle('attention-mechanism', 'Attention Mechanism', '## Overview\n\nContent.\n'));

    const updated = await enforceBacklinks(article, store);
    expect(updated).toHaveLength(2);
    expect(updated).toContain('transformer-architecture');
    expect(updated).toContain('attention-mechanism');
  });

  it('processes targets sequentially (not parallel) to avoid index rebuild races', async () => {
    const article = makeArticle(
      'flash-attention',
      'Flash Attention',
      '## Overview\n\nSee [[alpha]] and [[beta]] and [[gamma]].\n'
    );
    store.seedArticle(makeArticle('alpha', 'Alpha', '## Overview\n\nAlpha content.\n'));
    store.seedArticle(makeArticle('beta', 'Beta', '## Overview\n\nBeta content.\n'));
    store.seedArticle(makeArticle('gamma', 'Gamma', '## Overview\n\nGamma content.\n'));

    const callOrder: string[] = [];
    const originalGetArticle = store.getArticle.bind(store);
    vi.spyOn(store, 'getArticle').mockImplementation(async (slug: string) => {
      callOrder.push(slug);
      return originalGetArticle(slug);
    });

    await enforceBacklinks(article, store);

    // All three targets must be processed
    expect(callOrder).toContain('alpha');
    expect(callOrder).toContain('beta');
    expect(callOrder).toContain('gamma');
    // Sequential means they appear in a deterministic order (not scrambled by Promise.all)
    // Verify the calls happen one at a time by checking no two are interleaved
    // (Since we're async/await sequential, the indices will be 0, 1, 2 in order)
    expect(callOrder.indexOf('alpha')).toBeLessThan(callOrder.indexOf('beta'));
    expect(callOrder.indexOf('beta')).toBeLessThan(callOrder.indexOf('gamma'));
  });
});

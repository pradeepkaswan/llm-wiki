import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import matter from 'gray-matter';
import { WikiStore } from '../src/store/wiki-store.js';
import type { Article, Frontmatter } from '../src/types/article.js';

// Use a temp directory so tests never touch the real Obsidian vault
const TEST_VAULT = path.join(os.tmpdir(), `llm-wiki-test-${Date.now()}`);

function makeArticle(overrides: Partial<Article> = {}): Article {
  const frontmatter: Frontmatter = {
    title: 'Test Article',
    tags: ['testing'],
    categories: ['Test'],
    sources: [],
    sourced_at: null,
    type: 'web',
    created_at: '2026-04-04T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
    summary: 'A test article',
    ...overrides.frontmatter,
  };
  return {
    slug: 'test-article',
    frontmatter,
    body: '\nThis is the article body.\n',
    ...overrides,
  };
}

describe('WikiStore', () => {
  let store: WikiStore;

  beforeEach(async () => {
    store = new WikiStore(TEST_VAULT);
    await store.ensureDirectories();
  });

  afterEach(async () => {
    await fs.rm(TEST_VAULT, { recursive: true, force: true });
  });

  describe('slugify', () => {
    it('converts title to lowercase hyphenated slug', () => {
      expect(store.slugify('Flash Attention')).toBe('flash-attention');
      expect(store.slugify('Flash Attention v2')).toBe('flash-attention-v2');
      expect(store.slugify('GPT-4: Overview')).toBe('gpt-4-overview');
    });
  });

  describe('saveArticle', () => {
    it('writes a .md file with valid frontmatter', async () => {
      const article = makeArticle();
      const filePath = await store.saveArticle(article);
      expect(filePath).toContain('test-article.md');
      const raw = await fs.readFile(filePath, 'utf8');
      const { data } = matter(raw);
      expect(data.title).toBe('Test Article');
      expect(data.type).toBe('web');
    });

    it('throws if required frontmatter field is missing', async () => {
      const article = makeArticle({ frontmatter: { title: '' } as Frontmatter });
      // title is empty string, not undefined, so test a truly missing field:
      const badArticle: Article = {
        slug: 'bad',
        body: 'body',
        frontmatter: { tags: [], categories: [], sources: [], sourced_at: null,
          type: 'web', created_at: '', updated_at: '', summary: '' } as unknown as Frontmatter,
      };
      await expect(store.saveArticle(badArticle)).rejects.toThrow('Missing required frontmatter field: title');
    });

    it('throws if type is invalid', async () => {
      const article = makeArticle();
      (article.frontmatter as unknown as Record<string, string>).type = 'invalid';
      await expect(store.saveArticle(article)).rejects.toThrow('Invalid frontmatter type');
    });

    it('rebuilds index.md after save', async () => {
      await store.saveArticle(makeArticle());
      const indexPath = path.join(TEST_VAULT, 'articles', 'index.md');
      const raw = await fs.readFile(indexPath, 'utf8');
      expect(raw).toContain('[[test-article]]');
      expect(raw).toContain('article_count: 1');
    });
  });

  describe('getArticle', () => {
    it('returns article when it exists', async () => {
      await store.saveArticle(makeArticle());
      const result = await store.getArticle('test-article');
      expect(result).not.toBeNull();
      expect(result?.frontmatter.title).toBe('Test Article');
    });

    it('returns null for nonexistent slug', async () => {
      const result = await store.getArticle('does-not-exist');
      expect(result).toBeNull();
    });
  });

  describe('listArticles', () => {
    it('returns empty array when articles/ is empty', async () => {
      const list = await store.listArticles();
      expect(list).toEqual([]);
    });

    it('returns articles and excludes index.md', async () => {
      await store.saveArticle(makeArticle({ slug: 'article-one', frontmatter: { title: 'Article One', summary: 'First' } as Frontmatter }));
      await store.saveArticle(makeArticle({ slug: 'article-two', frontmatter: { title: 'Article Two', summary: 'Second' } as Frontmatter }));
      const list = await store.listArticles();
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.slug !== 'index')).toBe(true);
    });
  });

  describe('rebuildIndex', () => {
    it('index.md frontmatter has article_count and updated_at', async () => {
      await store.saveArticle(makeArticle());
      const indexPath = path.join(store.articlesDir, 'index.md');
      const raw = await fs.readFile(indexPath, 'utf8');
      const { data } = matter(raw);
      expect(data.article_count).toBe(1);
      expect(typeof data.updated_at).toBe('string');
    });
  });
});

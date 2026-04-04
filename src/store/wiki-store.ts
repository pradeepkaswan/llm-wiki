import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import writeFileAtomic from 'write-file-atomic';
import slugifyLib from 'slugify';
import type { Article, Frontmatter } from '../types/article.js';

// Re-export types for convenience of callers that only import from wiki-store
export type { Frontmatter, Article } from '../types/article.js';

const REQUIRED_FM_FIELDS: (keyof Frontmatter)[] = [
  'title', 'tags', 'categories', 'type', 'created_at', 'updated_at', 'summary',
];

export class WikiStore {
  constructor(private readonly vaultPath: string) {}

  get articlesDir(): string {
    return path.join(this.vaultPath, 'articles');
  }

  slugify(title: string): string {
    return slugifyLib(title, { lower: true, strict: true });
  }

  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.articlesDir, { recursive: true });
  }

  private validateFrontmatter(fm: Frontmatter): void {
    for (const field of REQUIRED_FM_FIELDS) {
      if (fm[field] === undefined || fm[field] === null) {
        throw new Error(`Missing required frontmatter field: ${field}`);
      }
    }
    if (fm.type !== 'web' && fm.type !== 'compound') {
      throw new Error(`Invalid frontmatter type: "${fm.type}". Must be "web" or "compound".`);
    }
  }

  async saveArticle(article: Article): Promise<string> {
    await this.ensureDirectories();

    // 1. Validate before touching disk (per D-08 — hard error, not silent)
    this.validateFrontmatter(article.frontmatter);

    // 2. Stringify via gray-matter
    const content = matter.stringify(article.body, article.frontmatter as Record<string, unknown>);

    // 3. Round-trip YAML validation — yaml.load() throws YAMLException on invalid YAML
    //    This catches corruption gray-matter's stringify might introduce
    const roundTripped = matter(content);
    yaml.load(roundTripped.matter); // throws on invalid YAML

    // 4. Atomic write — temp file + rename, no partial writes on crash
    const filePath = path.join(this.articlesDir, `${article.slug}.md`);
    await writeFileAtomic(filePath, content, 'utf8');

    // 5. Rebuild index after every save (per D-09)
    await this.rebuildIndex();

    return filePath;
  }

  async getArticle(slug: string): Promise<Article | null> {
    const filePath = path.join(this.articlesDir, `${slug}.md`);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const { data, content } = matter(raw);
      return { slug, frontmatter: data as Frontmatter, body: content };
    } catch {
      return null;
    }
  }

  async listArticles(): Promise<Article[]> {
    await this.ensureDirectories();
    let files: string[];
    try {
      files = await fs.readdir(this.articlesDir);
    } catch {
      return [];
    }
    const mdFiles = files.filter((f) => f.endsWith('.md') && f !== 'index.md');
    const articles = await Promise.all(
      mdFiles.map(async (f) => {
        const slug = f.replace('.md', '');
        return this.getArticle(slug);
      })
    );
    return articles.filter((a): a is Article => a !== null);
  }

  async rebuildIndex(): Promise<void> {
    const articles = await this.listArticles();

    // Group by first category (per D-09: categorized TOC)
    const byCategory = new Map<string, Article[]>();
    for (const article of articles) {
      const cats = article.frontmatter.categories.length > 0
        ? article.frontmatter.categories
        : ['Uncategorized'];
      for (const cat of cats) {
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(article);
      }
    }

    // Build index body — [[wikilink]] entries with summary (per D-09)
    let body = '\n';
    for (const [cat, catArticles] of [...byCategory.entries()].sort()) {
      body += `## ${cat}\n\n`;
      for (const a of catArticles.sort((x, y) => x.frontmatter.title.localeCompare(y.frontmatter.title))) {
        body += `- [[${a.slug}]] — ${a.frontmatter.summary}\n`;
      }
      body += '\n';
    }

    // Index frontmatter — article count + last-updated per D-10
    const indexFrontmatter = {
      title: 'Wiki Index',
      article_count: articles.length,
      updated_at: new Date().toISOString(),
    };

    const indexContent = matter.stringify(body, indexFrontmatter);
    const indexPath = path.join(this.articlesDir, 'index.md');
    await writeFileAtomic(indexPath, indexContent, 'utf8');
  }
}

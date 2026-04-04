import MiniSearch from 'minisearch';
import type { Article } from '../types/article.js';

interface SearchDoc {
  id: string;      // slug
  title: string;
  summary: string;
  tags: string;    // space-joined for BM25 tokenization
  body: string;
}

export interface SearchResult {
  slug: string;
  title: string;
  summary: string;
  score: number;
}

export function buildIndex(articles: Article[]): MiniSearch<SearchDoc> {
  const miniSearch = new MiniSearch<SearchDoc>({
    fields: ['title', 'summary', 'tags', 'body'],
    storeFields: ['title', 'summary'],
    searchOptions: {
      boost: { title: 3, summary: 2 },
      prefix: true,
      fuzzy: 0.2,
    },
  });

  const docs: SearchDoc[] = articles.map((a) => ({
    id: a.slug,
    title: a.frontmatter.title,
    summary: a.frontmatter.summary,
    tags: a.frontmatter.tags.join(' '),
    body: a.body,
  }));

  miniSearch.addAll(docs);
  return miniSearch;
}

export function search(index: MiniSearch<SearchDoc>, query: string): SearchResult[] {
  return index.search(query).map((r) => ({
    slug: r.id,
    title: r.title as string,
    summary: r.summary as string,
    score: r.score,
  }));
}

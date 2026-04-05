import { buildIndex, search } from '../search/search-index.js';
import { semanticRecall } from '../hydra/client.js';
import type { WikiStore } from '../store/wiki-store.js';
import type { Article } from '../types/article.js';

export interface CoverageResult {
  covered: boolean;
  articles: Article[];
  source: 'bm25' | 'hydra' | 'both';
}

/**
 * Assess whether the wiki can answer a question.
 *
 * Uses a two-tier strategy:
 * 1. BM25 (local, fast) — keyword match
 * 2. HydraDB semantic recall (if available) — catches conceptual matches BM25 misses
 *
 * Returns covered: true when either tier finds strong matches.
 */
export async function assessCoverage(
  question: string,
  store: WikiStore,
  threshold: number
): Promise<CoverageResult> {
  const articles = await store.listArticles();

  // Guard: empty wiki — nothing to search
  if (articles.length === 0) {
    return { covered: false, articles: [], source: 'bm25' };
  }

  // Tier 1: BM25 (always runs — local, fast)
  const index = buildIndex(articles);
  const bm25Results = search(index, question);
  const topBm25 = bm25Results[0];
  const bm25Covered = topBm25 && topBm25.score >= threshold;

  // Tier 2: HydraDB semantic recall (if API key configured)
  const hydraResults = await semanticRecall(question, 5);
  const hydraHasResults = hydraResults.length > 0;

  // Determine coverage source
  let source: 'bm25' | 'hydra' | 'both' = 'bm25';
  if (bm25Covered && hydraHasResults) source = 'both';
  else if (!bm25Covered && hydraHasResults) source = 'hydra';

  // Covered if either tier has results
  const covered = bm25Covered || hydraHasResults;

  if (!covered) {
    return { covered: false, articles: [], source: 'bm25' };
  }

  // Merge results: BM25 slugs first, then try to match HydraDB results to articles
  const slugSet = new Set<string>();
  const contextArticles: Article[] = [];

  // Add BM25 matches
  for (const r of bm25Results.slice(0, 5)) {
    if (!slugSet.has(r.slug)) {
      slugSet.add(r.slug);
      const article = await store.getArticle(r.slug);
      if (article) contextArticles.push(article);
    }
  }

  // Add HydraDB matches — match by title substring against article list
  for (const hr of hydraResults) {
    const titleMatch = articles.find(
      (a) => !slugSet.has(a.slug) && hr.text.includes(a.frontmatter.title)
    );
    if (titleMatch) {
      slugSet.add(titleMatch.slug);
      contextArticles.push(titleMatch);
    }
  }

  return { covered: true, articles: contextArticles.slice(0, 5), source };
}

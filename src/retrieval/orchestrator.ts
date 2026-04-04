import { buildIndex, search } from '../search/search-index.js';
import type { WikiStore } from '../store/wiki-store.js';
import type { Article } from '../types/article.js';

export interface CoverageResult {
  covered: boolean;
  articles: Article[];
}

/**
 * Assess whether the wiki can answer a question via BM25 search.
 *
 * Returns { covered: true, articles } when the top search result score meets or
 * exceeds the configured threshold.  Returns { covered: false, articles: [] } when
 * the wiki is empty, has no results, or the top score is below the threshold.
 *
 * At most 5 context articles are returned (the top-ranked matches).
 */
export async function assessCoverage(
  question: string,
  store: WikiStore,
  threshold: number
): Promise<CoverageResult> {
  const articles = await store.listArticles();

  // Guard: empty wiki — nothing to search
  if (articles.length === 0) {
    return { covered: false, articles: [] };
  }

  const index = buildIndex(articles);
  const results = search(index, question);

  // No results or top score below threshold — not covered
  const topResult = results[0];
  if (!topResult || topResult.score < threshold) {
    return { covered: false, articles: [] };
  }

  // Collect top 5 matching articles (load full content)
  const contextSlugs = results.slice(0, 5).map((r) => r.slug);
  const contextArticles = (
    await Promise.all(contextSlugs.map((slug) => store.getArticle(slug)))
  ).filter((a): a is Article => a !== null);

  return { covered: true, articles: contextArticles };
}

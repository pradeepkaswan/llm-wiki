import type { Article } from '../types/article.js';
import type { WikiStore } from '../store/wiki-store.js';
import { buildIndex, search } from '../search/search-index.js';
import { generateText } from '../llm/adapter.js';
import { buildTiebreakPrompt } from './prompt-builder.js';
import { parseTiebreakDecision } from './output-parser.js';

/**
 * BM25 score threshold for triggering the LLM tiebreak.
 *
 * BM25 scores for near-duplicates of short title queries typically cluster
 * around 5-15 when matching; unrelated articles score below 3.
 * Corpus-size-dependent; tuned for personal wikis under 1,000 articles.
 */
export const BM25_DEDUP_THRESHOLD = 3.0;

/**
 * Three-tier deduplication: determine whether a planned article already
 * exists in the wiki (and should be updated) or is genuinely new.
 *
 * Tier 1 — Exact slug match: WikiStore.slugify(title) looked up directly.
 *           Returns immediately if found — no LLM cost.
 *
 * Tier 2 — BM25 near-match: builds a transient MiniSearch index from the
 *           caller-supplied article list and queries with the planned title.
 *           If top score < BM25_DEDUP_THRESHOLD, returns null (no LLM call).
 *
 * Tier 3 — LLM tiebreak: asks the LLM with temperature=0 whether the
 *           matched article covers the same topic. Returns the matched article
 *           on 'update', null on 'new'.
 *
 * @param plannedTitle     - Title the synthesis pipeline plans to write
 * @param store            - WikiStore instance (injected for testability)
 * @param existingArticles - Pre-fetched article list (avoids redundant listArticles() calls)
 * @returns The existing Article to update, or null to create a new one
 */
export async function findExistingArticle(
  plannedTitle: string,
  store: WikiStore,
  existingArticles: Article[],
): Promise<Article | null> {
  // Tier 1: exact slug match (per D-12 — use WikiStore.slugify for consistency)
  const slug = store.slugify(plannedTitle);
  const exact = await store.getArticle(slug);
  if (exact) return exact;

  // Tier 2: BM25 near-match
  if (existingArticles.length === 0) return null;
  const index = buildIndex(existingArticles);
  const results = search(index, plannedTitle);
  const topResult = results[0];
  if (!topResult || topResult.score < BM25_DEDUP_THRESHOLD) return null;

  // Tier 3: LLM tiebreak (per D-11)
  const candidate = await store.getArticle(topResult.slug);
  if (!candidate) return null;

  process.stderr.write(
    `  [DEDUP] BM25 match: "${topResult.slug}" (score ${topResult.score.toFixed(1)}) — asking LLM...\n`
  );

  const prompt = buildTiebreakPrompt(plannedTitle, candidate.frontmatter.summary);
  const response = await generateText(prompt, { temperature: 0 });
  const decision = parseTiebreakDecision(response);

  process.stderr.write(`  [DEDUP] LLM decision: ${decision}\n`);
  return decision === 'update' ? candidate : null;
}

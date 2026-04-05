/**
 * Ripple update engine — propagates cross-references to related wiki articles
 * after new primary articles are created.
 *
 * Algorithm (per D-01 through D-06):
 * 1. Load all existing articles from WikiStore
 * 2. Build a BM25 (MiniSearch) index over existing articles
 * 3. For each primary article, query the index with title + summary
 * 4. Collect top 10 results per primary, excluding all primary slugs (D-03)
 * 5. Filter results below BM25_DEDUP_THRESHOLD (3.0)
 * 6. Deduplicate target slugs across primaries
 * 7. If no targets, return empty result
 * 8. Make a SINGLE batched LLM call (D-04) with all targets — returns JSON array
 * 9. Parse response (strip code fences, JSON.parse) — on failure return empty result (T-08-01)
 * 10. For each result, load target, upsert See Also entry, save via WikiStore
 */

import type { Article } from '../types/article.js';
import type { WikiStore } from '../store/wiki-store.js';
import { buildIndex, search } from '../search/search-index.js';
import { generateText } from '../llm/adapter.js';
import { upsertSeeAlsoEntry } from './see-also.js';

/** BM25 score threshold — same value as BM25_DEDUP_THRESHOLD in deduplicator.ts */
const BM25_RIPPLE_THRESHOLD = 3.0;

/** Maximum BM25 results to collect per primary article (D-03 cap) */
const TOP_K = 10;

export interface RippleTarget {
  slug: string;
  seeAlsoText: string;
}

export interface RippleResult {
  updatedSlugs: string[];
  skippedSlugs: string[];
}

/**
 * Propagate cross-references from primaryArticles to related wiki articles.
 *
 * @param primaryArticles - Newly created/updated articles (the "source" of the ripple)
 * @param store           - WikiStore instance (injected for testability)
 * @param schema          - Wiki schema string (passed to LLM for context)
 * @returns RippleResult with lists of updated and skipped slugs
 */
export async function rippleUpdates(
  primaryArticles: Article[],
  store: WikiStore,
  schema: string,
): Promise<RippleResult> {
  // 1. Load all existing articles
  const existingArticles = await store.listArticles();
  if (existingArticles.length === 0) {
    return { updatedSlugs: [], skippedSlugs: [] };
  }

  // Collect primary slugs for exclusion
  const primarySlugs = new Set(primaryArticles.map((a) => a.slug));

  // 2. Build BM25 index
  const index = buildIndex(existingArticles);

  // 3-5. Query BM25 for each primary, exclude primaries, filter by threshold
  const targetSlugsOrdered: string[] = [];
  const seenTargetSlugs = new Set<string>();

  for (const primary of primaryArticles) {
    const query = `${primary.frontmatter.title} ${primary.frontmatter.summary}`;
    const results = search(index, query);

    let count = 0;
    for (const result of results) {
      if (count >= TOP_K) break;
      if (primarySlugs.has(result.slug)) continue;      // exclude primaries (D-03)
      if (result.score < BM25_RIPPLE_THRESHOLD) continue; // below threshold
      if (seenTargetSlugs.has(result.slug)) continue;   // deduplicate across primaries

      seenTargetSlugs.add(result.slug);
      targetSlugsOrdered.push(result.slug);
      count++;
    }
  }

  // 7. No targets — nothing to update
  if (targetSlugsOrdered.length === 0) {
    return { updatedSlugs: [], skippedSlugs: [] };
  }

  // Load target articles for LLM prompt
  const targetArticles: Article[] = [];
  for (const slug of targetSlugsOrdered) {
    const article = await store.getArticle(slug);
    if (article) targetArticles.push(article);
  }

  if (targetArticles.length === 0) {
    return { updatedSlugs: [], skippedSlugs: [] };
  }

  // 8. Single batched LLM call (D-04)
  const primarySummaries = primaryArticles
    .map((a) => `- "${a.frontmatter.title}" (${a.slug}): ${a.frontmatter.summary}`)
    .join('\n');
  const targetSummaries = targetArticles
    .map((a) => `- "${a.frontmatter.title}" (${a.slug}): ${a.frontmatter.summary}`)
    .join('\n');

  const prompt = `You are updating a personal wiki. New articles were just added:

${primarySummaries}

The following existing articles may be related and should receive a "See Also" cross-reference:

${targetSummaries}

Wiki schema for context:
${schema}

For each target article that is genuinely related to one of the new articles, return a JSON array of objects with this shape:
{ "slug": "<target-slug>", "seeAlsoText": "[[<primary-slug>]] — <one-line description of the relationship>" }

Only include targets that have a meaningful topical relationship. If a target is not related, omit it.
Return ONLY the JSON array, no other text.`;

  const rawResponse = await generateText(prompt, { temperature: 0.2, maxOutputTokens: 2048 });

  // 9. Parse LLM output — strip markdown code fences, then JSON.parse (T-08-01)
  const cleaned = rawResponse
    .replace(/^```json?\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();

  let rippleTargets: RippleTarget[];
  try {
    rippleTargets = JSON.parse(cleaned) as RippleTarget[];
    if (!Array.isArray(rippleTargets)) {
      process.stderr.write('[ripple] LLM response was not a JSON array — skipping ripple updates\n');
      return { updatedSlugs: [], skippedSlugs: [] };
    }
  } catch {
    process.stderr.write('[ripple] Failed to parse LLM JSON response — skipping ripple updates\n');
    return { updatedSlugs: [], skippedSlugs: [] };
  }

  // 10. Apply updates sequentially (avoid parallel writes / index rebuild races)
  const updatedSlugs: string[] = [];
  const skippedSlugs: string[] = [];

  for (const target of rippleTargets) {
    const article = await store.getArticle(target.slug);
    if (!article) {
      skippedSlugs.push(target.slug);
      continue;
    }
    const updatedBody = upsertSeeAlsoEntry(article.body, target.seeAlsoText);
    const primarySlug = primaryArticles[0]?.slug ?? 'unknown';
    await store.saveArticle(
      { ...article, body: updatedBody },
      'update',
    );
    // Log the ripple source (D-05 — description context for the log entry)
    await store.appendLog('ripple', `ripple from ${primarySlug} → ${target.slug}`);
    updatedSlugs.push(target.slug);
  }

  return { updatedSlugs, skippedSlugs };
}

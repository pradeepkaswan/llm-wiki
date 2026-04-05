/**
 * Lint engine — scans wiki for structural and semantic health issues.
 *
 * Per D-01 through D-10: Implements 5 check categories:
 *   - orphan: articles with no inbound wikilinks
 *   - stale: articles older than freshness_days
 *   - missing-concept: wikilinks to nonexistent slugs
 *   - missing-cross-ref: related articles not linked (BM25-based)
 *   - contradiction: conflicting claims across articles (LLM-based)
 *
 * Pure function: takes articles + config, returns LintReport. No WikiStore access.
 */

import type { Article } from '../types/article.js';
import type { Config } from '../config/config.js';
import { isArticleStale } from '../commands/ask.js';
import { buildIndex, search } from '../search/search-index.js';
import { generateText } from '../llm/adapter.js';

// ---- Types ----

export type LintCategory =
  | 'orphan'
  | 'stale'
  | 'missing-concept'
  | 'missing-cross-ref'
  | 'contradiction';

export interface LintFinding {
  category: LintCategory;
  severity: 'error' | 'warning' | 'info';
  affected: string[]; // article slugs or concept slugs
  suggestedFix: string;
}

export interface LintReport {
  findings: LintFinding[];
  counts: Record<LintCategory, number>;
  healthScore: number; // 0-100 percentage of articles with no findings
  articleCount: number;
}

export interface LintOptions {
  categories?: LintCategory[];
}

// ---- Constants ----

/**
 * Minimum BM25 score to flag a missing cross-reference.
 * Higher than ripple threshold (3.0) to reduce false positives.
 */
const CROSS_REF_THRESHOLD = 5.0;

/**
 * Batch size for LLM contradiction detection to avoid context overflow.
 * Per T-09-03: Guard against large wikis.
 */
const CONTRADICTION_BATCH_SIZE = 25;

/**
 * Per T-09-03: Skip LLM call if wiki has fewer than 2 articles.
 */
const CONTRADICTION_MIN_ARTICLES = 2;

// ---- Private helpers ----

/**
 * Extract wikilink targets from markdown text.
 * Creates a FRESH regex instance each call — stateful /g flag safety.
 */
function extractWikilinks(text: string): string[] {
  const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const re = new RegExp(WIKILINK_RE.source, 'g');
  const targets: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const slug = match[1]!.trim();
    if (slug) targets.push(slug);
  }
  return targets;
}

/**
 * Convert a slug to a display title.
 * "nonexistent-slug" → "Nonexistent Slug"
 * Per RESEARCH Pitfall 4.
 */
function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---- Check functions ----

/**
 * D-03: Find articles with no inbound wikilinks from any other article.
 */
function checkOrphans(articles: Article[]): LintFinding[] {
  // Build reverse-link map: slug → Set<slugs that link to it>
  const inbound = new Map<string, Set<string>>();

  // Initialize all known slugs with empty sets
  for (const article of articles) {
    if (!inbound.has(article.slug)) {
      inbound.set(article.slug, new Set<string>());
    }
  }

  // Populate inbound links
  for (const article of articles) {
    const targets = extractWikilinks(article.body);
    for (const target of targets) {
      if (inbound.has(target)) {
        inbound.get(target)!.add(article.slug);
      }
    }
  }

  // Articles with empty inbound sets are orphans
  const findings: LintFinding[] = [];
  for (const [slug, refs] of inbound.entries()) {
    if (refs.size === 0) {
      findings.push({
        category: 'orphan',
        severity: 'warning',
        affected: [slug],
        suggestedFix: `Add backlink from a related article to [[${slug}]]`,
      });
    }
  }

  return findings;
}

/**
 * D-04: Find articles older than freshness_days.
 */
function checkStale(articles: Article[], config: Config): LintFinding[] {
  const freshnessDays = config.freshness_days ?? 30;
  const findings: LintFinding[] = [];

  for (const article of articles) {
    if (isArticleStale(article, freshnessDays)) {
      findings.push({
        category: 'stale',
        severity: 'warning',
        affected: [article.slug],
        suggestedFix: `Re-fetch by running: wiki ask "${article.frontmatter.title}" --refresh`,
      });
    }
  }

  return findings;
}

/**
 * D-05: Find wikilinks that point to slugs not in the wiki.
 */
function checkMissingConcepts(articles: Article[]): LintFinding[] {
  const knownSlugs = new Set(articles.map((a) => a.slug));
  const alreadyFlagged = new Set<string>();
  const findings: LintFinding[] = [];

  for (const article of articles) {
    const targets = extractWikilinks(article.body);
    for (const target of targets) {
      if (!knownSlugs.has(target) && !alreadyFlagged.has(target)) {
        alreadyFlagged.add(target);
        const displayTitle = slugToTitle(target);
        findings.push({
          category: 'missing-concept',
          severity: 'info',
          affected: [target],
          suggestedFix: `Create article for [[${target}]] by running: wiki ask "${displayTitle}"`,
        });
      }
    }
  }

  return findings;
}

/**
 * D-06: Find article pairs that should be cross-referenced but aren't.
 * Uses BM25 search to find related articles above threshold.
 */
function checkMissingCrossRefs(articles: Article[]): LintFinding[] {
  // Guard: need at least 2 articles for cross-referencing
  if (articles.length < 2) return [];

  const index = buildIndex(articles);
  const findings: LintFinding[] = [];
  // Track flagged pairs to avoid A→B and B→A duplicates
  const flaggedPairs = new Set<string>();

  for (const article of articles) {
    // Build set of slugs already linked in this article
    const alreadyLinked = new Set(extractWikilinks(article.body));

    // Search for related articles by title
    const results = search(index, article.frontmatter.title);

    for (const result of results) {
      // Skip self
      if (result.slug === article.slug) continue;
      // Skip low-scoring matches
      if (result.score < CROSS_REF_THRESHOLD) continue;
      // Skip already linked
      if (alreadyLinked.has(result.slug)) continue;

      // Deduplicate: if B→A already flagged, skip A→B
      const pairKey = [article.slug, result.slug].sort().join('|');
      if (flaggedPairs.has(pairKey)) continue;
      flaggedPairs.add(pairKey);

      findings.push({
        category: 'missing-cross-ref',
        severity: 'info',
        affected: [article.slug, result.slug],
        suggestedFix: `Add cross-reference: [[${article.slug}]] ↔ [[${result.slug}]]`,
      });
    }
  }

  return findings;
}

/**
 * D-07: Find contradictory claims across articles using a single LLM call.
 * Per T-09-03: Chunks in batches of 25 if > 50 articles.
 * Per T-09-04: Parse response in try/catch — return empty on failure.
 */
async function checkContradictions(articles: Article[]): Promise<LintFinding[]> {
  // Guard: need at least 2 articles for contradiction detection
  if (articles.length < CONTRADICTION_MIN_ARTICLES) return [];

  // Build summary list for the prompt
  const buildSummaryList = (batch: Article[]): string =>
    batch.map((a) => `- "${a.frontmatter.title}" (${a.slug}): ${a.frontmatter.summary}`).join('\n');

  const buildPrompt = (summaryList: string): string =>
    `You are a wiki health checker. Review these wiki article summaries and identify any DIRECT contradictions — where two articles make opposing factual claims about the same topic.

ARTICLES:
${summaryList}

Return ONLY a JSON array. Each contradiction entry: {"slugA": "slug-1", "slugB": "slug-2", "conflict": "description of the contradiction"}

If there are no contradictions, return an empty array: []

IMPORTANT: Return only the raw JSON array, no markdown, no explanation.`;

  // Batch processing for large wikis (T-09-03)
  const allContradictions: Array<{ slugA: string; slugB: string; conflict: string }> = [];

  const processBatch = async (batch: Article[]): Promise<void> => {
    const prompt = buildPrompt(buildSummaryList(batch));

    let raw: string;
    try {
      raw = await generateText(prompt, { temperature: 0.1, maxOutputTokens: 1024 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[lint] Warning: LLM call failed for contradiction check — ${msg}\n`);
      return;
    }

    // Strip markdown code fences (T-09-04)
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '');
    cleaned = cleaned.replace(/\n?```\s*$/, '');
    cleaned = cleaned.trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      process.stderr.write(`[lint] Warning: could not parse LLM contradiction response as JSON\n`);
      return;
    }

    if (!Array.isArray(parsed)) {
      process.stderr.write(`[lint] Warning: LLM contradiction response was not a JSON array\n`);
      return;
    }

    for (const entry of parsed) {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).slugA === 'string' &&
        typeof (entry as Record<string, unknown>).slugB === 'string' &&
        typeof (entry as Record<string, unknown>).conflict === 'string'
      ) {
        allContradictions.push(entry as { slugA: string; slugB: string; conflict: string });
      }
    }
  };

  // If > 50 articles, process in batches of CONTRADICTION_BATCH_SIZE
  if (articles.length > 50) {
    for (let i = 0; i < articles.length; i += CONTRADICTION_BATCH_SIZE) {
      const batch = articles.slice(i, i + CONTRADICTION_BATCH_SIZE);
      await processBatch(batch);
    }
  } else {
    await processBatch(articles);
  }

  // Map to LintFindings
  return allContradictions.map((c) => ({
    category: 'contradiction' as LintCategory,
    severity: 'error' as const,
    affected: [c.slugA, c.slugB],
    suggestedFix: `Review contradiction: ${c.conflict}`,
  }));
}

// ---- Main export ----

/**
 * D-01: Run all (or filtered) lint checks against the wiki.
 *
 * @param articles - All wiki articles to check
 * @param config   - Wiki config (used for freshness_days)
 * @param options  - Optional filter: only run specific categories
 * @returns LintReport with findings, counts per category, healthScore, articleCount
 */
export async function runLint(
  articles: Article[],
  config: Config,
  options?: LintOptions
): Promise<LintReport> {
  const enabledCategories = options?.categories;
  const shouldRun = (cat: LintCategory): boolean =>
    !enabledCategories || enabledCategories.includes(cat);

  const findings: LintFinding[] = [];

  if (shouldRun('orphan')) {
    findings.push(...checkOrphans(articles));
  }

  if (shouldRun('stale')) {
    findings.push(...checkStale(articles, config));
  }

  if (shouldRun('missing-concept')) {
    findings.push(...checkMissingConcepts(articles));
  }

  if (shouldRun('missing-cross-ref')) {
    findings.push(...checkMissingCrossRefs(articles));
  }

  if (shouldRun('contradiction')) {
    findings.push(...(await checkContradictions(articles)));
  }

  // Build counts per category
  const counts: Record<LintCategory, number> = {
    orphan: 0,
    stale: 0,
    'missing-concept': 0,
    'missing-cross-ref': 0,
    contradiction: 0,
  };

  for (const finding of findings) {
    counts[finding.category]++;
  }

  // Build healthScore: % of articles that appear in NO finding's affected array
  const affectedSlugs = new Set<string>();
  for (const finding of findings) {
    // Only count article slugs (not concept slugs from missing-concept)
    const articleSlugs = new Set(articles.map((a) => a.slug));
    for (const slug of finding.affected) {
      if (articleSlugs.has(slug)) {
        affectedSlugs.add(slug);
      }
    }
  }

  const healthyCount = articles.length - affectedSlugs.size;
  const healthScore =
    articles.length === 0
      ? 100
      : Math.round((healthyCount / articles.length) * 1000) / 10;

  return {
    findings,
    counts,
    healthScore,
    articleCount: articles.length,
  };
}

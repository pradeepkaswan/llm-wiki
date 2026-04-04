import type { ArticlePlan, ParsedArticle, SourceRef } from './types.js';

/**
 * Strip leading and trailing markdown code fences from LLM output.
 * Handles ``` ``` and ```language ``` patterns.
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  // Match opening fence (``` optionally followed by language name)
  const openFence = /^```[a-zA-Z]*\n?/;
  const closeFence = /\n?```\s*$/;

  let result = trimmed;
  if (openFence.test(result)) {
    result = result.replace(openFence, '');
  }
  if (closeFence.test(result)) {
    result = result.replace(closeFence, '');
  }
  return result.trim();
}

/**
 * Parse the planning step output into an array of ArticlePlan objects.
 *
 * Expected format:
 *   ARTICLE_COUNT: N
 *   ARTICLE_1_TITLE: ...
 *   ARTICLE_1_SCOPE: ...
 *   ARTICLE_1_SOURCES: 0,2,3
 *   ARTICLE_2_TITLE: ...
 *   ...
 *
 * Fallback: if parsing fails, returns a single plan with all source indices.
 */
export function parsePlanOutput(raw: string, sourceCount: number): ArticlePlan[] {
  const text = stripCodeFences(raw);
  const lines = text.split('\n');

  // Parse ARTICLE_COUNT
  let articleCount: number | null = null;
  for (const line of lines) {
    const match = line.match(/^ARTICLE_COUNT:\s*(\d+)/);
    if (match) {
      const n = parseInt(match[1]!, 10);
      if (!isNaN(n) && n > 0) {
        articleCount = n;
      }
      break;
    }
  }

  if (articleCount === null) {
    // Fallback: return single plan with all source indices
    return [makeFallbackPlan(text, sourceCount)];
  }

  const plans: ArticlePlan[] = [];

  for (let i = 1; i <= articleCount; i++) {
    let title = '';
    let scope = '';
    let sourceIndices: number[] = [];

    for (const line of lines) {
      const titleMatch = line.match(new RegExp(`^ARTICLE_${i}_TITLE:\\s*(.+)`));
      if (titleMatch) title = titleMatch[1]!.trim();

      const scopeMatch = line.match(new RegExp(`^ARTICLE_${i}_SCOPE:\\s*(.+)`));
      if (scopeMatch) scope = scopeMatch[1]!.trim();

      const sourcesMatch = line.match(
        new RegExp(`^ARTICLE_${i}_SOURCES:\\s*(.+)`)
      );
      if (sourcesMatch) {
        sourceIndices = parseSourceIndices(sourcesMatch[1]!, sourceCount);
      }
    }

    if (title) {
      // If no sources specified, default to all source indices
      if (sourceIndices.length === 0) {
        sourceIndices = Array.from({ length: sourceCount }, (_, i) => i);
      }
      plans.push({ title, scope, sourceIndices });
    }
  }

  // If we parsed 0 articles despite having ARTICLE_COUNT, fallback
  if (plans.length === 0) {
    return [makeFallbackPlan(text, sourceCount)];
  }

  return plans;
}

/** Parse comma-separated source indices, filtering out-of-range values */
function parseSourceIndices(raw: string, sourceCount: number): number[] {
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 0 && n < sourceCount);
}

/** Create a fallback ArticlePlan with all source indices */
function makeFallbackPlan(raw: string, sourceCount: number): ArticlePlan {
  // Use first non-empty line as title guess, or a generic name
  const firstLine = raw
    .split('\n')
    .find((l) => l.trim().length > 0)
    ?.trim();
  const title =
    firstLine && firstLine.length < 100 ? firstLine : 'Wiki Article';

  return {
    title,
    scope: 'General overview from available sources',
    sourceIndices: Array.from({ length: sourceCount }, (_, i) => i),
  };
}

/**
 * Parse the article generation output into a ParsedArticle object.
 *
 * Expected format:
 *   TITLE: ...
 *   SUMMARY: ...
 *   CATEGORIES: cat1, cat2
 *   BODY:
 *   ## Section...
 *   ## Sources
 *   1. [Title](url)
 *
 * Returns null if TITLE or BODY markers are not found.
 */
export function parseArticleOutput(raw: string): ParsedArticle | null {
  const text = stripCodeFences(raw);
  const lines = text.split('\n');

  let title: string | null = null;
  let summary = '';
  let categories: string[] = [];
  let bodyStartIndex: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (title === null) {
      const titleMatch = line.match(/^TITLE:\s*(.+)/);
      if (titleMatch) {
        title = titleMatch[1]!.trim();
        continue;
      }
    }

    if (!summary) {
      const summaryMatch = line.match(/^SUMMARY:\s*(.+)/);
      if (summaryMatch) {
        summary = summaryMatch[1]!.trim();
        continue;
      }
    }

    if (categories.length === 0) {
      const catMatch = line.match(/^CATEGORIES:\s*(.+)/);
      if (catMatch) {
        categories = catMatch[1]!
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        continue;
      }
    }

    if (bodyStartIndex === null && line.match(/^BODY:\s*$/)) {
      bodyStartIndex = i + 1;
      break;
    }
  }

  // TITLE and BODY are required
  if (title === null || bodyStartIndex === null) {
    return null;
  }

  const body = lines.slice(bodyStartIndex).join('\n').trim();

  // Default categories if not found
  if (categories.length === 0) {
    categories = ['Uncategorized'];
  }

  // Parse ## Sources section from body
  const sourceRefs = parseSourceRefs(body);

  return {
    title,
    summary,
    categories,
    body,
    sourceRefs,
  };
}

/**
 * Parse numbered source entries from a ## Sources section in the body.
 *
 * Matches lines like:
 *   1. [Title](url)
 *   2. [Another Title](https://example.com)
 */
function parseSourceRefs(body: string): SourceRef[] {
  const refs: SourceRef[] = [];
  const lines = body.split('\n');
  let inSources = false;

  for (const line of lines) {
    if (line.match(/^##\s+Sources/i)) {
      inSources = true;
      continue;
    }
    if (inSources && line.match(/^##\s+/)) {
      // Another heading — sources section ended
      break;
    }
    if (inSources) {
      // Match: N. [Title](url)
      const match = line.match(/^(\d+)\.\s+\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        refs.push({
          index: parseInt(match[1]!, 10),
          title: match[2]!.trim(),
          url: match[3]!.trim(),
        });
      }
    }
  }

  return refs;
}

/**
 * Parse the tiebreak decision from an LLM response.
 *
 * Returns 'update' if the response contains UPDATE (case-insensitive).
 * Returns 'new' otherwise — safe default to avoid accidental overwrites.
 */
export function parseTiebreakDecision(raw: string): 'update' | 'new' {
  const upper = raw.trim().toUpperCase();
  if (upper.includes('UPDATE')) return 'update';
  return 'new';
}

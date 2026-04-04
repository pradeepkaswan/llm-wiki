import slugifyLib from 'slugify';
import type { Article, Frontmatter } from '../types/article.js';
import type { ParsedArticle } from './types.js';
import { stripHallucinatedWikilinks } from './wikilink-sanitizer.js';

/**
 * Build a new Article from LLM-parsed output.
 *
 * Per D-05: sources derived from SourceRef URLs (not raw LLM output fields).
 * Per D-15: type is always 'web' for synthesis-created articles.
 * Per D-07: wikilinks sanitized before returning — hallucinated links removed.
 *
 * @param parsed      - Structured article from the LLM output parser
 * @param knownSlugs  - Set of slugs in the wiki — used for wikilink validation
 * @returns A complete Article ready for WikiStore.saveArticle()
 */
export function buildNewArticle(
  parsed: ParsedArticle,
  knownSlugs: Set<string>,
): Article {
  const now = new Date().toISOString();
  const sourceUrls = parsed.sourceRefs.map((r) => r.url);
  const sanitizedBody = stripHallucinatedWikilinks(parsed.body, knownSlugs);

  const frontmatter: Frontmatter = {
    title: parsed.title,
    tags: [],
    categories: parsed.categories.length > 0 ? parsed.categories : ['Uncategorized'],
    sources: sourceUrls,
    sourced_at: now,
    type: 'web',
    created_at: now,
    updated_at: now,
    summary: parsed.summary,
  };

  return {
    slug: slugifyLib(parsed.title, { lower: true, strict: true }),
    frontmatter,
    body: sanitizedBody,
  };
}

/**
 * Build an updated Article by merging new LLM output with an existing article.
 *
 * Per D-14: sources = union of old + new URLs — no duplicates.
 * Per D-13: body comes from the LLM (which received the existing body + new sources).
 * created_at is preserved from the existing article; updated_at and sourced_at are refreshed.
 *
 * @param existingArticle - The article currently in the wiki
 * @param parsed          - Updated article structure from the LLM output parser
 * @param knownSlugs      - Set of slugs in the wiki — used for wikilink validation
 * @returns A merged Article ready for WikiStore.saveArticle()
 */
export function buildUpdatedArticle(
  existingArticle: Article,
  parsed: ParsedArticle,
  knownSlugs: Set<string>,
): Article {
  const now = new Date().toISOString();
  const newSourceUrls = parsed.sourceRefs.map((r) => r.url);
  const mergedSources = [
    ...new Set([
      ...existingArticle.frontmatter.sources,
      ...newSourceUrls,
    ]),
  ];
  const sanitizedBody = stripHallucinatedWikilinks(parsed.body, knownSlugs);

  return {
    slug: existingArticle.slug,
    frontmatter: {
      ...existingArticle.frontmatter,
      categories:
        parsed.categories.length > 0
          ? parsed.categories
          : existingArticle.frontmatter.categories,
      sources: mergedSources,
      sourced_at: now,
      updated_at: now,
      summary: parsed.summary,
      // created_at preserved from existing article via spread above
    },
    body: sanitizedBody,
  };
}

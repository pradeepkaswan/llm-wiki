/**
 * Bidirectional backlink enforcer — ensures that when article A links to
 * article B via [[wikilink]], article B gets a reciprocal entry in its
 * "## See Also" section pointing back to article A.
 *
 * Per D-14: All reads through store.getArticle(), all writes through
 * store.saveArticle(article, 'update'). Never writes to disk directly.
 *
 * Per D-15: Idempotent — upsertSeeAlsoEntry() handles duplicate detection.
 *
 * Per D-16: Complementary to wikilink-sanitizer (which strips invalid forward
 * links); this adds missing backward links. These are separate concerns.
 *
 * Per RESEARCH Pitfall 4: NOT recursive. Only called from command-level
 * pipeline (ask.ts, file.ts), never from inside WikiStore or ripple loops.
 */

import type { Article } from '../types/article.js';
import type { WikiStore } from '../store/wiki-store.js';
import { upsertSeeAlsoEntry } from './see-also.js';

/**
 * Regex for extracting wikilinks from article body.
 * Handles both [[slug]] and [[slug|display text]] formats.
 * Capture group 1 = slug portion (no pipe, no path separators — T-08-02 mitigation).
 */
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/**
 * Add reciprocal backlinks in "## See Also" for all wikilinks found in the
 * given article's body.
 *
 * @param article - The source article whose wikilinks will be backlinked
 * @param store   - WikiStore instance (injected for testability)
 * @returns Array of target slugs that were actually updated
 */
export async function enforceBacklinks(
  article: Article,
  store: WikiStore,
): Promise<string[]> {
  // 1. Extract all [[wikilinks]] from article body
  const slugSet = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(WIKILINK_RE.source, 'g');
  while ((match = re.exec(article.body)) !== null) {
    const slug = match[1]!.trim();
    if (slug) slugSet.add(slug);
  }

  // 2. Remove the article's own slug (prevent self-referential backlink)
  slugSet.delete(article.slug);

  // 3. Process targets sequentially (avoid index rebuild races — RESEARCH Pitfall 4 / D-16)
  const updatedSlugs: string[] = [];

  for (const targetSlug of slugSet) {
    // a. Load target article — skip if it doesn't exist
    const targetArticle = await store.getArticle(targetSlug);
    if (!targetArticle) continue;

    // b. Build the backlink entry text
    const backlinkEntry = `[[${article.slug}]] - Related: ${article.frontmatter.title}`;

    // c. Upsert See Also entry in target body
    const updatedBody = upsertSeeAlsoEntry(targetArticle.body, backlinkEntry);

    // d. If body unchanged, the backlink already existed — skip save (idempotency)
    if (updatedBody === targetArticle.body) continue;

    // e. Save updated target article through WikiStore
    const updatedTarget: Article = {
      ...targetArticle,
      body: updatedBody,
    };
    await store.saveArticle(updatedTarget, 'update');
    updatedSlugs.push(targetSlug);
  }

  return updatedSlugs;
}

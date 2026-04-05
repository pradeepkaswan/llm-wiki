/**
 * Shared utility for inserting or updating the "## See Also" section in an
 * article body. Used by both ripple.ts and backlink-enforcer.ts.
 *
 * Canonical article structure:
 *   ...body content...
 *   ## See Also
 *   - [[slug]] — description
 *   ## Sources
 *   1. [Source](url)
 *
 * Rules:
 * - If no "## See Also" section exists: insert before "## Sources" when it
 *   exists, otherwise append at end of body.
 * - If "## See Also" section exists: add the entry into the existing list
 *   (before the next "##" heading or end of file).
 * - Idempotent: if the exact [[slug]] from the entry already appears in the
 *   See Also section, return body unchanged.
 */

/** Regex to extract the slug portion from a [[slug]] or [[slug|display]] entry */
const WIKILINK_SLUG_RE = /\[\[([^\]|]+)/;

/**
 * Insert or update a "## See Also" entry in an article body.
 *
 * @param body  - The article markdown body (no frontmatter block)
 * @param entry - A full list item string, e.g. "[[flash-attention]] — description"
 * @returns Updated body string
 */
export function upsertSeeAlsoEntry(body: string, entry: string): string {
  // Extract [[slug]] from the entry for idempotency checking
  const slugMatch = entry.match(WIKILINK_SLUG_RE);
  const entrySlug = slugMatch ? slugMatch[1]!.trim() : null;

  const SEE_ALSO_HEADING = '## See Also';
  const seeAlsoIdx = body.indexOf(SEE_ALSO_HEADING);

  if (seeAlsoIdx !== -1) {
    // "## See Also" section already exists
    // Check idempotency: if [[slug]] already present in the See Also block, return unchanged
    if (entrySlug) {
      // Find the extent of the See Also section (up to next ## heading or EOF)
      const afterHeading = seeAlsoIdx + SEE_ALSO_HEADING.length;
      const nextHeadingMatch = body.slice(afterHeading).match(/\n##\s/);
      const sectionEnd = nextHeadingMatch
        ? afterHeading + nextHeadingMatch.index!
        : body.length;
      const seeAlsoBlock = body.slice(seeAlsoIdx, sectionEnd);
      if (seeAlsoBlock.includes(`[[${entrySlug}]]`)) {
        return body; // Already present — idempotent
      }
    }

    // Insert the new entry into the See Also block
    // Find the end of the See Also section (before the next ## heading)
    const afterHeading = seeAlsoIdx + SEE_ALSO_HEADING.length;
    const nextHeadingMatch = body.slice(afterHeading).match(/\n(##\s)/);
    if (nextHeadingMatch) {
      const insertPos = afterHeading + nextHeadingMatch.index!;
      return body.slice(0, insertPos) + `\n- ${entry}` + body.slice(insertPos);
    } else {
      // See Also is the last section — append to end
      const trimmed = body.trimEnd();
      return `${trimmed}\n- ${entry}\n`;
    }
  } else {
    // No "## See Also" section — create one
    const newSection = `\n## See Also\n\n- ${entry}\n`;
    const sourcesIdx = body.indexOf('\n## Sources');
    if (sourcesIdx !== -1) {
      // Insert before ## Sources
      return body.slice(0, sourcesIdx) + newSection + body.slice(sourcesIdx);
    } else {
      // No ## Sources — append at end
      const trimmed = body.trimEnd();
      return `${trimmed}\n${newSection}`;
    }
  }
}

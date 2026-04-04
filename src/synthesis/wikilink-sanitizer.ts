const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Strip wikilinks not matching a known article slug.
 * Handles both [[slug]] and [[slug|display text]] formats.
 * Per D-07: zero hallucinated links — hard constraint.
 *
 * Valid wikilinks are preserved as-is.
 * Invalid wikilinks are replaced with plain text:
 *   - [[slug]] → "slug"
 *   - [[slug|display text]] → "display text"
 */
export function stripHallucinatedWikilinks(body: string, knownSlugs: Set<string>): string {
  return body.replace(WIKILINK_RE, (match, inner: string) => {
    const parts = inner.split('|');
    const slug = parts[0]!.trim();
    if (knownSlugs.has(slug)) return match;
    // Strip the wikilink — use display text if present, otherwise slug
    return parts[1]?.trim() ?? slug;
  });
}

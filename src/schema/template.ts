/**
 * Schema template module for LLM Wiki.
 *
 * Provides the default wiki schema content and utilities for reading/updating
 * the Category Taxonomy section as articles are created.
 */

/**
 * Build the default wiki schema markdown content.
 *
 * The schema is read by the LLM before every synthesis operation to ensure
 * consistent article structure, frontmatter conventions, and wikilink style.
 *
 * @param categories - Initial list of category names to populate the taxonomy
 */
export function buildDefaultSchema(categories: string[]): string {
  const categoryEntries = categories
    .map((cat) => `- **${cat}**: Auto-discovered from wiki articles.`)
    .join('\n');

  return `# Wiki Schema

> This file defines conventions for this wiki. The LLM reads it before every
> synthesis operation and follows these conventions exactly.
> When writing articles, follow these conventions for consistent structure,
> linking, and metadata.

## Page Types

- **web**: Synthesized from web sources. Has \`sources\` URLs and \`sourced_at\` date.
- **compound**: Synthesized from existing wiki articles. Has \`wiki://\` prefixed sources.

## Frontmatter Conventions

Required fields (all page types):
- \`title\`: Concise, title-case. Maps to [[wikilink]] slug via slugify.
- \`tags\`: Array of lowercase keyword strings.
- \`categories\`: Array of broad topic areas (e.g. "Machine Learning", not "Flash Attention V2").
- \`type\`: "web" or "compound".
- \`created_at\`: ISO 8601 date string.
- \`updated_at\`: ISO 8601 date string.
- \`summary\`: Single sentence. Appears in index.md TOC.

Optional fields:
- \`sources\`: Array of URLs (web type) or wiki:// slugs (compound type).
- \`sourced_at\`: ISO 8601 date string when sources were fetched.

## Category Taxonomy

<!-- New categories are appended here automatically when articles are created -->
${categoryEntries}

## Wikilink Style

- Link only to articles that exist in the wiki (slugs from the article index).
- Slug format: lowercase, hyphens, no special characters (e.g. \`[[flash-attention]]\`).
- Link on first meaningful mention of a concept, not every occurrence.
- Never fabricate wikilinks to articles that do not exist.
`;
}

/**
 * Extract the set of category names from the Category Taxonomy section of a schema.
 *
 * Extraction is case-preserving but membership checks are case-insensitive
 * (per Research Pitfall 3 — prevent duplicates differing only in case).
 *
 * @param schemaContent - Full schema markdown string
 * @returns Set of category names found in the taxonomy section
 */
export function extractSchemaCategories(schemaContent: string): Set<string> {
  const taxonomyMatch = schemaContent.match(
    /## Category Taxonomy\n([\s\S]*?)(?=\n## |\n*$)/
  );
  if (!taxonomyMatch) return new Set();

  const section = taxonomyMatch[1];
  const categories = new Set<string>();

  // Match lines of the form: - **CategoryName** or - **CategoryName**: description
  const lineRegex = /^- \*\*([^*]+)\*\*/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(section)) !== null) {
    categories.add(match[1].trim());
  }

  return categories;
}

/**
 * Append new categories to the Category Taxonomy section of an existing schema.
 *
 * Does not add categories already present (case-insensitive comparison to prevent
 * duplicates per Research Pitfall 3).
 *
 * @param schemaContent - Existing schema markdown string
 * @param newCategories - Category names to add
 * @returns Updated schema markdown string
 */
export function appendCategoriesToSchema(
  schemaContent: string,
  newCategories: string[]
): string {
  const existing = extractSchemaCategories(schemaContent);
  const existingLower = new Set([...existing].map((c) => c.toLowerCase()));

  const toAdd = newCategories.filter(
    (cat) => !existingLower.has(cat.toLowerCase())
  );

  if (toAdd.length === 0) return schemaContent;

  const newEntries = toAdd
    .map((cat) => `- **${cat}**: Auto-discovered from wiki articles.`)
    .join('\n');

  // Find the Category Taxonomy section first, then locate the next ## heading after it.
  // This prevents matching earlier ## headings (like ## Page Types) by mistake.
  const taxonomyPos = schemaContent.indexOf('## Category Taxonomy');
  if (taxonomyPos === -1) {
    // No taxonomy section — append at end
    return schemaContent.trimEnd() + '\n' + newEntries + '\n';
  }

  // Search for the next ## section heading after the taxonomy section
  const afterTaxonomy = schemaContent.indexOf('\n## ', taxonomyPos + 1);
  if (afterTaxonomy === -1) {
    // No subsequent section — append at end of file
    return schemaContent.trimEnd() + '\n' + newEntries + '\n';
  }

  const before = schemaContent.slice(0, afterTaxonomy);
  const after = schemaContent.slice(afterTaxonomy);

  return before.trimEnd() + '\n' + newEntries + '\n' + after;
}

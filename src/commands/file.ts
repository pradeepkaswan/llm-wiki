import { Command } from 'commander';
import { loadConfig } from '../config/config.js';
import { WikiStore } from '../store/wiki-store.js';
import { generateText } from '../llm/adapter.js';
import { parseArticleOutput } from '../synthesis/output-parser.js';
import { findExistingArticle } from '../synthesis/deduplicator.js';
import { rippleUpdates } from '../synthesis/ripple.js';
import { enforceBacklinks } from '../synthesis/backlink-enforcer.js';
import { buildDefaultSchema } from '../schema/template.js';
import slugifyLib from 'slugify';
import type { Article, Frontmatter } from '../types/article.js';

// -------------------------------------------------------------------------
// Input reading
// -------------------------------------------------------------------------

/**
 * Read freeform text input from argument or stdin pipe.
 *
 * Per T-08-09: If stdin is a TTY (interactive terminal) and no text argument
 * is provided, exit immediately with an error — do not attempt to read from
 * TTY stdin without argument.
 *
 * @param textArg - Text passed as CLI argument, or undefined if not provided
 * @returns The trimmed text to file
 */
export async function readInput(textArg: string | undefined): Promise<string> {
  if (textArg !== undefined && textArg.length > 0) {
    return textArg;
  }

  // T-08-09: TTY guard — no piped input available
  if (process.stdin.isTTY) {
    process.stderr.write(
      'Error: No text provided. Pass text as an argument or pipe via stdin.\n' +
        '  wiki file "some content"\n' +
        '  echo "some content" | wiki file\n',
    );
    process.exit(1);
  }

  // Read from stdin pipe
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8').trim());
    });
  });
}

// -------------------------------------------------------------------------
// LLM placement planning
// -------------------------------------------------------------------------

/**
 * Build a prompt that asks the LLM to decide where freeform content
 * belongs in the wiki — create new articles, update existing, or split.
 *
 * Per D-08: Returns JSON output with {action, slug, title, reason} entries.
 *
 * @param text             - Freeform content to file
 * @param existingArticles - Current wiki articles for context
 * @param schema           - Wiki schema string for convention guidance
 * @returns Prompt string requesting JSON placement decisions
 */
export function buildPlacementPrompt(
  text: string,
  existingArticles: Article[],
  schema: string,
): string {
  const articleList = existingArticles
    .map((a, i) => `${i}. [${a.slug}] ${a.frontmatter.title}: ${a.frontmatter.summary}`)
    .join('\n');

  return `You are a wiki filing assistant. Given freeform content and a list of existing wiki articles, decide where this content should be filed.

CONTENT TO FILE:
${text}

EXISTING ARTICLES (${existingArticles.length} total):
${articleList}

WIKI SCHEMA:
${schema}

INSTRUCTIONS:
- Decide if the content should create a new article, update an existing article, or be split across multiple articles.
- For 'update': use the existing article's slug.
- For 'create': propose a slug (lowercase, hyphen-separated).
- Return ONLY valid JSON array. Each entry: {"action":"create"|"update","slug":"<slug>","title":"<title>","reason":"<why this placement>"}
- If the content covers multiple distinct topics, split into multiple entries.
- Prefer updating existing articles when the content clearly extends their scope.

REQUIRED OUTPUT FORMAT:
[{"action":"create","slug":"example-slug","title":"Example Title","reason":"New topic not covered by existing articles"}]`;
}

// -------------------------------------------------------------------------
// Placement decision parsing
// -------------------------------------------------------------------------

export interface PlacementDecision {
  action: 'create' | 'update';
  slug: string;
  title: string;
  reason: string;
}

/**
 * Parse LLM output into an array of PlacementDecision objects.
 *
 * Per T-08-08: Strip markdown code fences, wrap JSON.parse in try/catch.
 * On any failure, return empty array and log warning — never throw.
 *
 * @param raw - Raw LLM response string
 * @returns Array of valid PlacementDecision entries
 */
export function parsePlacementDecisions(raw: string): PlacementDecision[] {
  // Strip markdown code fences (```json, ```js, or plain ```)
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '');
  cleaned = cleaned.replace(/\n?```\s*$/, '');
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    process.stderr.write('[file] Warning: could not parse LLM placement response as JSON\n');
    return [];
  }

  if (!Array.isArray(parsed)) {
    process.stderr.write('[file] Warning: LLM placement response was not a JSON array\n');
    return [];
  }

  // Validate each entry has required fields
  const decisions: PlacementDecision[] = [];
  for (const entry of parsed) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).action === 'string' &&
      typeof (entry as Record<string, unknown>).slug === 'string' &&
      typeof (entry as Record<string, unknown>).title === 'string' &&
      typeof (entry as Record<string, unknown>).reason === 'string' &&
      ((entry as Record<string, unknown>).action === 'create' ||
        (entry as Record<string, unknown>).action === 'update')
    ) {
      decisions.push(entry as PlacementDecision);
    }
  }

  return decisions;
}

// -------------------------------------------------------------------------
// Placement execution
// -------------------------------------------------------------------------

/** System prompt used for all filing LLM calls */
const FILING_SYSTEM_PROMPT =
  'You are a wiki editor. Convert content into well-structured wiki articles. ' +
  'Use clear section headers. Follow the wiki schema conventions.';

/**
 * Execute a single placement decision — create or update an article.
 *
 * For 'update': loads existing article, merges text via LLM, saves with existing type.
 * For 'create': runs dedup, builds new article with type 'filed', saves.
 *
 * Per T-08-10: Slug safety delegated to WikiStore.saveArticle() which uses slugify.
 *
 * @param decision         - Placement decision from LLM
 * @param text             - Original freeform content to incorporate
 * @param store            - WikiStore instance
 * @param existingArticles - Current wiki articles (for dedup)
 * @param schema           - Wiki schema string
 * @returns The saved Article
 */
export async function executePlacement(
  decision: PlacementDecision,
  text: string,
  store: WikiStore,
  existingArticles: Article[],
  schema: string,
): Promise<Article> {
  if (decision.action === 'update') {
    // Try to load the existing article
    const existing = await store.getArticle(decision.slug);

    if (existing) {
      return _mergeAndSave(existing, text, store, schema);
    }
    // Fall through to 'create' if not found
  }

  // 'create' path (also used as fallback when update target not found)
  // D-08: Run deduplication to avoid creating duplicates
  const deduped = await findExistingArticle(decision.title, store, existingArticles);

  if (deduped) {
    // Found existing article — merge instead of creating
    return _mergeAndSave(deduped, text, store, schema);
  }

  // Truly new article — generate from scratch
  return _createAndSave(decision, text, store, schema);
}

/**
 * Merge freeform text into an existing article body via LLM, preserving type.
 */
async function _mergeAndSave(
  existing: Article,
  text: string,
  store: WikiStore,
  schema: string,
): Promise<Article> {
  const mergePrompt = `You are a wiki editor updating an existing wiki article.

EXISTING ARTICLE TITLE: ${existing.frontmatter.title}

EXISTING ARTICLE BODY:
${existing.body}

NEW CONTENT TO MERGE:
${text}

WIKI SCHEMA:
${schema}

OUTPUT INSTRUCTIONS:
- Merge the new content into the existing article body.
- Preserve the existing structure and style.
- Add new information in the appropriate sections.
- Do NOT add explanations or preambles.
- Do NOT wrap the output in markdown code fences.

REQUIRED OUTPUT FORMAT:
TITLE: ${existing.frontmatter.title}

SUMMARY: [updated one-sentence summary]

CATEGORIES: [comma-separated categories]

BODY:
[updated markdown body with merged content]`;

  let parsed = parseArticleOutput(await generateText(mergePrompt, {
    system: FILING_SYSTEM_PROMPT,
    temperature: 0.3,
    maxOutputTokens: 4096,
  }));

  if (parsed === null) {
    // Retry once with stronger format instruction
    const retryRaw = await generateText(
      mergePrompt +
        '\n\nIMPORTANT: You MUST follow the exact format. Start with TITLE: on the first line.',
      { system: FILING_SYSTEM_PROMPT, temperature: 0.3, maxOutputTokens: 4096 },
    );
    parsed = parseArticleOutput(retryRaw);
  }

  if (parsed === null) {
    throw new Error(`Filing failed: could not parse LLM output for update of "${existing.slug}"`);
  }

  const now = new Date().toISOString();
  const updatedArticle: Article = {
    slug: existing.slug,
    frontmatter: {
      ...existing.frontmatter,
      categories:
        parsed.categories.length > 0 ? parsed.categories : existing.frontmatter.categories,
      summary: parsed.summary,
      updated_at: now,
      // Preserve existing type — filing updates don't change type
    },
    body: parsed.body,
  };

  await store.saveArticle(updatedArticle, 'update');
  return updatedArticle;
}

/**
 * Create a brand-new filed article from freeform text.
 * Per D-09: type is always 'filed' for newly created articles via file command.
 */
async function _createAndSave(
  decision: PlacementDecision,
  text: string,
  store: WikiStore,
  schema: string,
): Promise<Article> {
  const createPrompt = `You are a wiki editor creating a new wiki article from freeform content.

ARTICLE TITLE: ${decision.title}

CONTENT:
${text}

WIKI SCHEMA:
${schema}

OUTPUT INSTRUCTIONS:
- Write a well-structured wiki article covering the content above.
- Use appropriate ## section headers.
- Include a summary sentence.
- Assign appropriate categories.
- Do NOT add explanations or preambles.
- Do NOT wrap the output in markdown code fences.

REQUIRED OUTPUT FORMAT:
TITLE: ${decision.title}

SUMMARY: [one-sentence summary]

CATEGORIES: [comma-separated categories]

BODY:
[full markdown article body]`;

  let parsed = parseArticleOutput(await generateText(createPrompt, {
    system: FILING_SYSTEM_PROMPT,
    temperature: 0.3,
    maxOutputTokens: 4096,
  }));

  if (parsed === null) {
    const retryRaw = await generateText(
      createPrompt +
        '\n\nIMPORTANT: You MUST follow the exact format. Start with TITLE: on the first line.',
      { system: FILING_SYSTEM_PROMPT, temperature: 0.3, maxOutputTokens: 4096 },
    );
    parsed = parseArticleOutput(retryRaw);
  }

  if (parsed === null) {
    throw new Error(`Filing failed: could not parse LLM output for "${decision.title}"`);
  }

  const now = new Date().toISOString();

  // D-09: New articles from file command always have type 'filed'
  const frontmatter: Frontmatter = {
    title: parsed.title,
    tags: [],
    categories: parsed.categories.length > 0 ? parsed.categories : ['Uncategorized'],
    sources: [],         // No web sources for filed content
    sourced_at: now,
    type: 'filed',
    created_at: now,
    updated_at: now,
    summary: parsed.summary,
  };

  const newArticle: Article = {
    slug: slugifyLib(parsed.title, { lower: true, strict: true }),
    frontmatter,
    body: parsed.body,
  };

  await store.saveArticle(newArticle, 'create');
  return newArticle;
}

// -------------------------------------------------------------------------
// Commander command
// -------------------------------------------------------------------------

export const fileCommand = new Command('file')
  .description('File freeform content into the wiki — LLM decides placement')
  .argument('[text]', 'text to file (or pipe via stdin)')
  .action(async (textArg: string | undefined) => {
    try {
      const text = await readInput(textArg);
      const config = await loadConfig();
      const store = new WikiStore(config.vault_path);

      // Schema bootstrap — same pattern as ask command
      let schema = await store.readSchema();
      if (schema === null) {
        process.stderr.write('Bootstrapping wiki schema...\n');
        const articles = await store.listArticles();
        const categories = [
          ...new Set(articles.flatMap((a) => a.frontmatter.categories)),
        ].sort();
        schema = buildDefaultSchema(categories);
        await store.updateSchema(schema);
      }

      const existingArticles = await store.listArticles();

      // Step 1: LLM placement planning (D-08)
      process.stderr.write('Planning article placement...\n');
      const placementPrompt = buildPlacementPrompt(text, existingArticles, schema);
      const placementRaw = await generateText(placementPrompt, {
        system: 'You are a wiki filing assistant. Decide where content belongs.',
        temperature: 0.2,
        maxOutputTokens: 1024,
      });
      const decisions = parsePlacementDecisions(placementRaw);

      if (decisions.length === 0) {
        process.stderr.write('Could not determine where to file this content.\n');
        process.exit(1);
      }

      process.stderr.write(`Filing into ${decisions.length} article(s)...\n`);

      // Step 2: Execute each placement sequentially (per RESEARCH anti-pattern on parallel writes)
      const filedArticles: Article[] = [];
      for (const decision of decisions) {
        try {
          process.stderr.write(
            `  [${decision.action.toUpperCase()}] ${decision.title} (${decision.reason})\n`,
          );
          const article = await executePlacement(decision, text, store, existingArticles, schema);
          filedArticles.push(article);
          process.stdout.write(`${article.frontmatter.title}\n`);
          process.stderr.write(
            `  [SAVED] articles/${article.slug}.md (type: ${article.frontmatter.type})\n`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`  [SKIP] ${decision.title}: ${msg}\n`);
          continue; // Graceful per-item failure
        }
      }

      if (filedArticles.length === 0) {
        process.stderr.write('No articles were filed successfully.\n');
        process.exit(1);
      }

      // Step 3: Ripple updates on all filed articles (D-10)
      process.stderr.write('Rippling cross-references to related articles...\n');
      try {
        const rippleResult = await rippleUpdates(filedArticles, store, schema);
        if (rippleResult.updatedSlugs.length > 0) {
          process.stderr.write(
            `[RIPPLE] Updated ${rippleResult.updatedSlugs.length} related article(s)\n`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[RIPPLE] Warning: ripple failed — ${msg}\n`);
      }

      // Step 4: Backlink enforcement on filed articles (GRAPH-02)
      process.stderr.write('Enforcing bidirectional backlinks...\n');
      for (const article of filedArticles) {
        try {
          const backlinkUpdates = await enforceBacklinks(article, store);
          if (backlinkUpdates.length > 0) {
            process.stderr.write(
              `[BACKLINK] ${article.slug}: added backlinks to ${backlinkUpdates.length} article(s)\n`,
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`[BACKLINK] Warning: ${article.slug} — ${msg}\n`);
        }
      }

      process.stderr.write(`Done: ${filedArticles.length} article(s) filed\n`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  });

import slugifyLib from 'slugify';
import type { Article, Frontmatter } from '../types/article.js';
import type { ParsedArticle } from '../synthesis/types.js';
import type { WikiStore } from '../store/wiki-store.js';
import { generateText } from '../llm/adapter.js';
import { parseArticleOutput } from '../synthesis/output-parser.js';
import { findExistingArticle } from '../synthesis/deduplicator.js';

/**
 * System prompt for the filing LLM call.
 * Instructs the model to act as a wiki editor converting Q&A content.
 */
const FILING_SYSTEM_PROMPT =
  'You are a wiki editor. Convert Q&A content into well-structured wiki articles. ' +
  'Preserve all factual information from the answer. Use clear section headers.';

/**
 * Build a prompt that instructs the LLM to convert a Q&A answer into the
 * article format expected by parseArticleOutput().
 *
 * CRITICAL: Pre-populates the ## Sources section with wiki:// format so that
 * parseSourceRefs() captures them correctly and frontmatter.sources becomes
 * wiki:// prefixed slugs rather than raw URLs.
 *
 * @param question       - The original user question
 * @param answer         - The Q&A answer text to convert
 * @param sourceArticles - Wiki articles that were used to produce the answer
 * @returns Prompt string in parseArticleOutput-compatible format
 */
export function buildFilingPrompt(
  question: string,
  answer: string,
  sourceArticles: Article[],
): string {
  const sourceList = sourceArticles
    .map((a, i) => `[${i + 1}] ${a.frontmatter.title}\nSummary: ${a.frontmatter.summary}`)
    .join('\n\n');

  const sourceRefs = sourceArticles
    .map((a, i) => `${i + 1}. [${a.frontmatter.title}](wiki://${a.slug})`)
    .join('\n');

  return `Convert the following Q&A answer into a structured wiki article.

ORIGINAL QUESTION: ${question}

ANSWER:
${answer}

SOURCE WIKI ARTICLES (${sourceArticles.length} total):
${sourceList}

OUTPUT INSTRUCTIONS:
- Output ONLY the article in the EXACT format below.
- Do NOT add explanations or preambles.
- Do NOT wrap the output in markdown code fences.

REQUIRED OUTPUT FORMAT:
TITLE: [concise article title based on the question]

SUMMARY: [one sentence summary for the wiki index]

CATEGORIES: [comma-separated categories]

BODY:
[full markdown article body with ## section headers]

## Sources

${sourceRefs}`;
}

/**
 * Build a new compound Article from LLM-parsed output and source wiki articles.
 *
 * CRITICAL: Do NOT use buildNewArticle() from article-builder.ts — it hardcodes
 * type: 'web'. Compound articles always have type: 'compound'.
 *
 * Sources are set to wiki:// prefixed slugs (not raw URLs), since these articles
 * were derived from other wiki articles, not web pages.
 *
 * @param parsed         - Structured article output from parseArticleOutput()
 * @param sourceArticles - Wiki articles used as source material
 * @returns A complete Article with type: 'compound' ready for WikiStore.saveArticle()
 */
export function buildCompoundArticle(
  parsed: ParsedArticle,
  sourceArticles: Article[],
): Article {
  const now = new Date().toISOString();
  const wikiSources = sourceArticles.map((a) => `wiki://${a.slug}`);

  const frontmatter: Frontmatter = {
    title: parsed.title,
    tags: [],
    categories: parsed.categories.length > 0 ? parsed.categories : ['Uncategorized'],
    sources: wikiSources,
    sourced_at: now,
    type: 'compound',
    created_at: now,
    updated_at: now,
    summary: parsed.summary,
  };

  return {
    slug: slugifyLib(parsed.title, { lower: true, strict: true }),
    frontmatter,
    body: parsed.body,
  };
}

/**
 * Build an updated compound Article by merging new parsed content with an existing
 * compound article.
 *
 * Sources are merged as a union to avoid duplicates. The existing slug and
 * created_at are preserved to maintain article identity.
 *
 * @param existing       - The existing compound article to update
 * @param parsed         - New parsed article content from the LLM
 * @param sourceArticles - New wiki articles used as source material
 * @returns A merged Article with type: 'compound' ready for WikiStore.saveArticle()
 */
export function buildUpdatedCompoundArticle(
  existing: Article,
  parsed: ParsedArticle,
  sourceArticles: Article[],
): Article {
  const now = new Date().toISOString();
  const newWikiSources = sourceArticles.map((a) => `wiki://${a.slug}`);
  const mergedSources = [...new Set([...existing.frontmatter.sources, ...newWikiSources])];

  return {
    slug: existing.slug,
    frontmatter: {
      ...existing.frontmatter,
      categories:
        parsed.categories.length > 0 ? parsed.categories : existing.frontmatter.categories,
      sources: mergedSources,
      sourced_at: now,
      updated_at: now,
      summary: parsed.summary,
      // created_at preserved from existing via spread above
    },
    body: parsed.body,
  };
}

/**
 * Main orchestration: convert a Q&A answer into a compound wiki article and
 * save it to the store, with deduplication against existing articles.
 *
 * Pipeline:
 * 1. Build filing prompt with wiki:// source references
 * 2. Call LLM to convert Q&A to article format
 * 3. Parse LLM output via parseArticleOutput() (retry once on failure)
 * 4. Deduplicate: check if an article on the same topic already exists
 * 5. Build compound article (new or updated)
 * 6. Save via store.saveArticle()
 * 7. Return the saved article
 *
 * @param question       - The original user question
 * @param answer         - The Q&A answer text to convert
 * @param sourceArticles - Wiki articles that were used to answer the question
 * @param store          - WikiStore instance for persistence
 * @returns The saved compound Article
 * @throws Error if LLM output cannot be parsed after retry
 */
export async function fileAnswerAsArticle(
  question: string,
  answer: string,
  sourceArticles: Article[],
  store: WikiStore,
): Promise<Article> {
  // Step 1: Build filing prompt
  const prompt = buildFilingPrompt(question, answer, sourceArticles);

  // Step 2: Call LLM
  const raw = await generateText(prompt, {
    system: FILING_SYSTEM_PROMPT,
    temperature: 0.3,
    maxOutputTokens: 4096,
  });

  // Step 3: Parse output, retry once on failure
  let parsed = parseArticleOutput(raw);

  if (parsed === null) {
    const retryPrompt =
      prompt +
      '\n\nIMPORTANT: You MUST follow the exact format. Start with TITLE: on the first line, then SUMMARY:, then CATEGORIES:, then BODY:';
    const retryRaw = await generateText(retryPrompt, {
      system: FILING_SYSTEM_PROMPT,
      temperature: 0.3,
      maxOutputTokens: 4096,
    });
    parsed = parseArticleOutput(retryRaw);
  }

  if (parsed === null) {
    throw new Error('Filing failed: could not parse LLM output after retry');
  }

  // Step 4: Deduplication — check for existing article on same topic
  const existingArticles = await store.listArticles();
  const existing = await findExistingArticle(parsed.title, store, existingArticles);

  // Step 5: Build article (update existing or create new)
  const article = existing
    ? buildUpdatedCompoundArticle(existing, parsed, sourceArticles)
    : buildCompoundArticle(parsed, sourceArticles);

  // Step 6: Save to store
  await store.saveArticle(article);

  // Step 7: Return saved article
  return article;
}

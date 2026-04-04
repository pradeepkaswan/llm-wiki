import type { ArticlePlan, SynthesisInput } from './types.js';
import type { Article } from '../types/article.js';
import type { RawSourceEnvelope } from '../types/ingestion.js';

/** Maximum characters of source markdown to include per source in any prompt */
const SOURCE_CONTENT_MAX_CHARS = 3000;

/** Truncate source markdown for safe inclusion in LLM prompts */
function truncateSource(markdown: string): string {
  if (markdown.length <= SOURCE_CONTENT_MAX_CHARS) return markdown;
  return markdown.slice(0, SOURCE_CONTENT_MAX_CHARS) + '... [truncated]';
}

/**
 * Build the planning prompt.
 * The LLM reads the question and all sources, then outputs an ARTICLE_COUNT plan.
 */
export function buildPlanPrompt(input: SynthesisInput, schema: string): string {
  const { question, envelopes, existingArticles } = input;

  const sourceList = envelopes
    .map(
      (env, i) =>
        `Source ${i}:
Title: ${env.title}
URL: ${env.url}
Content:
${truncateSource(env.markdown)}`
    )
    .join('\n\n---\n\n');

  const existingTitles =
    existingArticles.length > 0
      ? existingArticles
          .map((a) => `- ${a.frontmatter.title} (slug: ${a.slug})`)
          .join('\n')
      : '(none)';

  return `You are a wiki planning assistant. Your task is to analyze web sources and plan one or more wiki articles that best answer the user's question.

QUESTION: ${question}

EXISTING WIKI ARTICLES (for context — do not duplicate):
${existingTitles}

SOURCES (${envelopes.length} total):

${sourceList}

---

WIKI SCHEMA (follow these conventions exactly):
${schema}

INSTRUCTIONS:
1. Decide if the question warrants ONE article (focused topic) or MULTIPLE articles (broad topic with distinct subtopics).
2. For each planned article, assign the most relevant sources by index.
3. Output ONLY the plan in the EXACT format below. Do NOT add explanations or prose before or after. Do NOT wrap in markdown code fences (\`\`\`).

REQUIRED OUTPUT FORMAT:
ARTICLE_COUNT: N
ARTICLE_1_TITLE: [concise wiki article title]
ARTICLE_1_SCOPE: [one sentence describing what this article covers]
ARTICLE_1_SOURCES: [comma-separated source indices, e.g. 0,2,3]
ARTICLE_2_TITLE: [title if N >= 2]
ARTICLE_2_SCOPE: [scope if N >= 2]
ARTICLE_2_SOURCES: [indices if N >= 2]
[... repeat for all N articles]`;
}

/**
 * Build the article generation prompt.
 * The LLM reads the plan + relevant sources, then outputs a structured article.
 */
export function buildGeneratePrompt(
  question: string,
  plan: ArticlePlan,
  sources: RawSourceEnvelope[],
  knownSlugs: string[],
  schema: string
): string {
  const sourceContent = sources
    .map(
      (env, i) =>
        `[${i + 1}] ${env.title}
URL: ${env.url}
${truncateSource(env.markdown)}`
    )
    .join('\n\n---\n\n');

  const slugList =
    knownSlugs.length > 0
      ? knownSlugs.map((s) => `- [[${s}]]`).join('\n')
      : '(no existing articles — do not add any [[wikilinks]])';

  return `You are a technical wiki author. Write a high-quality, well-structured wiki article based on the sources below.

ORIGINAL QUESTION: ${question}

ARTICLE TITLE: ${plan.title}
ARTICLE SCOPE: ${plan.scope}

SOURCES (${sources.length} total):

${sourceContent}

---

WIKI SCHEMA (follow these conventions exactly):
${schema}

WIKILINKS — ONLY link to articles in this list (use exact slug):
${slugList}

CITATION INSTRUCTIONS:
- Add inline citations as [1], [2], etc. in the body wherever you draw on a specific source.
- Include a ## Sources section at the end listing each source used: N. [Title](url)

OUTPUT INSTRUCTIONS:
- Output ONLY the article in the EXACT format below.
- Do NOT add explanations, preambles, or commentary.
- Do NOT wrap the output in markdown code fences (\`\`\`).
- Do NOT use [[wikilinks]] unless the slug appears in the list above.

REQUIRED OUTPUT FORMAT:
TITLE: [article title]

SUMMARY: [one sentence summary for the wiki index]

CATEGORIES: [comma-separated categories, e.g. Machine Learning, Algorithms]

BODY:
[full markdown article body with ## section headers, inline [N] citations, and ## Sources at end]`;
}

/**
 * Build the article update prompt.
 * The LLM merges new sources into the existing article body.
 */
export function buildUpdatePrompt(
  existingArticle: Article,
  newSources: RawSourceEnvelope[],
  question: string,
  knownSlugs: string[],
  schema: string
): string {
  const sourceContent = newSources
    .map(
      (env, i) =>
        `[${i + 1}] ${env.title}
URL: ${env.url}
${truncateSource(env.markdown)}`
    )
    .join('\n\n---\n\n');

  const slugList =
    knownSlugs.length > 0
      ? knownSlugs.map((s) => `- [[${s}]]`).join('\n')
      : '(no existing articles — do not add any [[wikilinks]])';

  return `You are a technical wiki author. Update the existing wiki article below by incorporating new information from the provided sources.

ORIGINAL QUESTION: ${question}

EXISTING ARTICLE (title: ${existingArticle.frontmatter.title}):
${existingArticle.body}

NEW SOURCES (${newSources.length} total):

${sourceContent}

---

WIKI SCHEMA (follow these conventions exactly):
${schema}

WIKILINKS — ONLY link to articles in this list (use exact slug):
${slugList}

UPDATE INSTRUCTIONS:
- Preserve the existing article structure (section headers, existing citations).
- Add new information from the new sources where relevant.
- Add new inline citations [N] for new claims from new sources.
- Append new sources to the ## Sources section with updated numbering.
- Do NOT duplicate existing information.

OUTPUT INSTRUCTIONS:
- Output ONLY the updated article in the EXACT format below.
- Do NOT add explanations or preambles.
- Do NOT wrap the output in markdown code fences (\`\`\`).

REQUIRED OUTPUT FORMAT:
TITLE: [article title]

SUMMARY: [updated one sentence summary]

CATEGORIES: [comma-separated categories]

BODY:
[full updated markdown article body with ## section headers, inline citations, and ## Sources at end]`;
}

/**
 * Build the tiebreak prompt.
 * The LLM decides whether a new article should UPDATE an existing one or be NEW.
 */
export function buildTiebreakPrompt(
  plannedTitle: string,
  existingSummary: string
): string {
  return `You are a wiki deduplication assistant. Decide whether a planned article should UPDATE an existing article or be created as a NEW separate article.

PLANNED NEW ARTICLE TITLE: ${plannedTitle}

EXISTING ARTICLE SUMMARY: ${existingSummary}

DECISION CRITERIA:
- Respond UPDATE if the planned article covers the same topic as the existing article and new information should be merged in.
- Respond NEW if the planned article covers a distinct enough topic to warrant a separate article.

RESPOND with exactly one word: UPDATE or NEW

Do NOT add any explanation.`;
}

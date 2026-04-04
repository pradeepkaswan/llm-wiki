import type { Article } from '../types/article.js';

/**
 * Maximum characters per article body included in the wiki answer prompt.
 * Mirrors SOURCE_CONTENT_MAX_CHARS in synthesis to prevent token overflow.
 */
export const WIKI_CONTEXT_MAX_CHARS = 3000;

/**
 * Format an article body, truncating at WIKI_CONTEXT_MAX_CHARS if needed.
 */
function truncateBody(body: string): string {
  if (body.length <= WIKI_CONTEXT_MAX_CHARS) {
    return body;
  }
  return body.slice(0, WIKI_CONTEXT_MAX_CHARS) + '... [truncated]';
}

/**
 * Build the prompt sent to the LLM for answering a question from wiki articles.
 */
export function buildWikiAnswerPrompt(question: string, articles: Article[]): string {
  const formattedArticles = articles
    .map((a) => {
      const truncated = truncateBody(a.body);
      return [
        `Article: ${a.frontmatter.title}`,
        `Summary: ${a.frontmatter.summary}`,
        `Content:`,
        truncated,
      ].join('\n');
    })
    .join('\n\n---\n\n');

  return [
    'Answer the following question using ONLY the wiki articles provided below.',
    'Cite article titles inline as [Article Title] when referencing information from a specific article.',
    'Do not invent information not present in the provided articles.',
    '',
    `QUESTION: ${question}`,
    '',
    `WIKI ARTICLES (${articles.length} total):`,
    '',
    formattedArticles,
    '',
    'Answer:',
  ].join('\n');
}

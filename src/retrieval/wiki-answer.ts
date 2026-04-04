import { generateText } from '../llm/adapter.js';
import { buildWikiAnswerPrompt } from './prompt-builder.js';
import type { Article } from '../types/article.js';

const WIKI_ANSWER_SYSTEM =
  "You are a wiki assistant. Answer the user's question using ONLY the wiki articles provided. " +
  'Cite article titles inline as [Article Title]. Do not invent information not in the articles.';

/**
 * Generate a wiki-sourced answer to a question using the provided articles as context.
 */
export async function generateWikiAnswer(question: string, articles: Article[]): Promise<string> {
  const prompt = buildWikiAnswerPrompt(question, articles);
  return generateText(prompt, {
    system: WIKI_ANSWER_SYSTEM,
    temperature: 0.2,
    maxOutputTokens: 2048,
  });
}

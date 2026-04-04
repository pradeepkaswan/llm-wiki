import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export interface ExtractResult {
  title: string;
  markdown: string;
}

export function extractFromHtml(html: string, url: string): ExtractResult | null {
  // Pass url so Readability resolves relative links correctly (Pitfall 1)
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return null;
  const markdown = turndown.turndown(article.content ?? '');
  return { title: article.title ?? '', markdown };
}

import type { Article } from '../types/article.js';
import type { RawSourceEnvelope } from '../types/ingestion.js';

/** Input to the synthesis pipeline */
export interface SynthesisInput {
  question: string;
  envelopes: RawSourceEnvelope[];   // only non-excluded envelopes
  existingArticles: Article[];       // all articles currently in wiki
}

/** Output from the planning step — one entry per planned article */
export interface ArticlePlan {
  title: string;
  scope: string;          // brief description of what this article covers
  sourceIndices: number[]; // indices into SynthesisInput.envelopes
}

/** A single source reference from the ## Sources section */
export interface SourceRef {
  index: number;  // the [N] number
  title: string;
  url: string;
}

/** Parsed output from a single article generation LLM call */
export interface ParsedArticle {
  title: string;
  summary: string;
  categories: string[];
  body: string;           // markdown body WITH inline [N] citations
  sourceRefs: SourceRef[]; // the ## Sources entries
}

/** Final result of the synthesis pipeline */
export interface SynthesisResult {
  articles: Article[];     // saved articles
  updatedSlugs: string[];  // slugs that were updates (not new)
}

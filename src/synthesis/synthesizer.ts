import * as fs from 'fs/promises';
import * as path from 'path';
import type { Article } from '../types/article.js';
import type { RawSourceEnvelope, Manifest } from '../types/ingestion.js';
import type { WikiStore } from '../store/wiki-store.js';
import type { SynthesisResult } from './types.js';
import { generateText } from '../llm/adapter.js';
import {
  buildPlanPrompt,
  buildGeneratePrompt,
  buildUpdatePrompt,
} from './prompt-builder.js';
import { parsePlanOutput, parseArticleOutput } from './output-parser.js';
import { findExistingArticle } from './deduplicator.js';
import { buildNewArticle, buildUpdatedArticle } from './article-builder.js';

const SYSTEM_PROMPT =
  'You are a technical wiki author. Write clear, accurate, well-structured articles with proper citations.';
const PLAN_TEMPERATURE = 0.2;
const GENERATE_TEMPERATURE = 0.3;
const MAX_OUTPUT_TOKENS = 4096;

/**
 * Synthesis pipeline orchestrator.
 *
 * Reads raw source envelopes from a manifest directory, plans articles via LLM,
 * generates/updates articles with citations and wikilinks, deduplicates against
 * the existing wiki, and saves results via WikiStore.
 *
 * @param rawDir - Path to a directory containing manifest.json and source-NN.json files
 * @param store  - WikiStore instance for reads/writes (injected for testability)
 * @returns SynthesisResult with saved articles and slugs of updated (vs new) articles
 */
export async function synthesize(
  rawDir: string,
  store: WikiStore,
): Promise<SynthesisResult> {
  // Step 1: Load source envelopes from manifest
  const manifestPath = path.join(rawDir, 'manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest: Manifest = JSON.parse(manifestRaw) as Manifest;

  // Load only non-excluded envelopes
  const envelopes: RawSourceEnvelope[] = [];
  for (const entry of manifest.sources) {
    if (entry.excluded) continue;
    const sourceRaw = await fs.readFile(path.join(rawDir, entry.file), 'utf8');
    const envelope: RawSourceEnvelope = JSON.parse(sourceRaw) as RawSourceEnvelope;
    envelopes.push(envelope);
  }

  if (envelopes.length === 0) {
    throw new Error('No usable source envelopes found');
  }

  const question = manifest.query ?? 'Unknown question';

  // Step 2: Load existing articles for backlink constraint and dedup
  const existingArticles = await store.listArticles();
  const existingSlugs = new Set(existingArticles.map((a) => a.slug));

  // Step 3: Plan articles
  const planInput = { question, envelopes, existingArticles };
  const planRaw = await generateText(buildPlanPrompt(planInput), {
    system: SYSTEM_PROMPT,
    temperature: PLAN_TEMPERATURE,
    maxOutputTokens: 1024,
  });
  const plans = parsePlanOutput(planRaw, envelopes.length);

  // Deduplicate planned titles within the batch (RESEARCH Pitfall 3)
  // If two plans produce the same slug, keep only the first one
  const seenPlanSlugs = new Set<string>();
  const dedupedPlans = plans.filter((plan) => {
    const planSlug = store.slugify(plan.title);
    if (seenPlanSlugs.has(planSlug)) return false;
    seenPlanSlugs.add(planSlug);
    return true;
  });

  // Step 4: Generate each article
  const savedArticles: Article[] = [];
  const updatedSlugs: string[] = [];

  // Known slugs for wikilink validation — grows as batch progresses (per D-10)
  const knownSlugsSet = new Set<string>(existingSlugs);

  for (const plan of dedupedPlans) {
    // 4a: Dedup check — does this article already exist?
    const existing = await findExistingArticle(plan.title, store, existingArticles);

    // 4b: Select relevant sources
    let relevantSources = plan.sourceIndices
      .map((i) => envelopes[i])
      .filter((e): e is RawSourceEnvelope => e !== undefined);
    if (relevantSources.length === 0) {
      // Fallback: use all envelopes
      relevantSources = envelopes;
    }

    // 4c: Build known slugs list for prompt (existing + already-generated in batch)
    const knownSlugsList = Array.from(knownSlugsSet);

    // 4d: Build prompt
    const prompt = existing
      ? buildUpdatePrompt(existing, relevantSources, question, knownSlugsList)
      : buildGeneratePrompt(question, plan, relevantSources, knownSlugsList);

    // 4e: Generate and parse (with retry per D-03)
    let parsed = parseArticleOutput(
      await generateText(prompt, {
        system: SYSTEM_PROMPT,
        temperature: GENERATE_TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      })
    );

    if (parsed === null) {
      // Retry once with stricter prompt note (per D-03)
      const stricterPrompt =
        prompt +
        '\n\nIMPORTANT: You MUST follow the exact format. Start with TITLE: on the first line, then SUMMARY:, then CATEGORIES:, then BODY:';
      parsed = parseArticleOutput(
        await generateText(stricterPrompt, {
          system: SYSTEM_PROMPT,
          temperature: GENERATE_TEMPERATURE,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        })
      );
    }

    if (parsed === null) {
      throw new Error(
        `Synthesis failed: could not parse LLM output for "${plan.title}" after retry`
      );
    }

    // 4f: Build Article object
    const article = existing
      ? buildUpdatedArticle(existing, parsed, knownSlugsSet)
      : buildNewArticle(parsed, knownSlugsSet);

    // 4g: Save article to disk
    await store.saveArticle(article);
    process.stderr.write(`[SAVED] articles/${article.slug}.md\n`);

    // 4h: Track results and grow known slugs for next iteration
    savedArticles.push(article);
    if (existing) {
      updatedSlugs.push(article.slug);
    }
    knownSlugsSet.add(article.slug);
  }

  // Step 5: Return SynthesisResult
  return {
    articles: savedArticles,
    updatedSlugs,
  };
}

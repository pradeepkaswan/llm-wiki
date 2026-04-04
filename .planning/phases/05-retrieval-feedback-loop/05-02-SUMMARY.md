---
phase: 05-retrieval-feedback-loop
plan: 02
subsystem: retrieval
tags: [compound-articles, feedback-loop, deduplication, wiki-sources, tdd]
dependency_graph:
  requires:
    - 04-03 (synthesizer orchestrator — reuses parseArticleOutput, findExistingArticle, WikiStore)
    - 04-01 (output-parser.ts with parseArticleOutput)
    - 04-02 (deduplicator.ts with findExistingArticle)
    - 01-01 (wiki-store.ts with saveArticle)
  provides:
    - fileAnswerAsArticle() — Q&A-to-article conversion + compound article save
    - buildCompoundArticle() — new compound article builder with wiki:// sources
    - buildUpdatedCompoundArticle() — merge into existing compound article
    - buildFilingPrompt() — LLM prompt for Q&A-to-article conversion
  affects:
    - 05-01 (retrieval orchestrator — will call fileAnswerAsArticle after Q&A)
    - 05-03 (integration — compound articles appear in wiki and index)
tech_stack:
  added: []
  patterns:
    - TDD red-green (failing tests committed before implementation)
    - wiki:// source prefix for compound article provenance tracking
    - parseArticleOutput() + retry pattern (same as synthesizer.ts)
    - buildUpdatedCompoundArticle() mirrors buildUpdatedArticle() but preserves compound type
key_files:
  created:
    - src/retrieval/article-filer.ts
    - tests/retrieval-filer.test.ts
  modified: []
decisions:
  - buildCompoundArticle does not use buildNewArticle from article-builder.ts — buildNewArticle hardcodes type:'web', compound articles require type:'compound'
  - wiki:// source prefix scheme identifies compound article provenance at a glance; distinguishes from 'web' type sources (https:// URLs)
  - No wikilink sanitization on compound article body — body is LLM-generated from Q&A answer that does not contain hallucinated wiki-style links; sanitization would be over-engineering
  - buildUpdatedCompoundArticle preserves existing.frontmatter.categories when parsed.categories is empty — same defensive pattern as buildUpdatedArticle
metrics:
  duration_seconds: 155
  completed_date: "2026-04-04"
  tasks_completed: 1
  files_created: 2
  files_modified: 0
  tests_added: 35
---

# Phase 05 Plan 02: Compound Article Filer Summary

**One-liner:** Q&A-to-compound-article pipeline with wiki:// source provenance, LLM conversion, parse-retry, and three-tier deduplication reusing Phase 4 infrastructure.

## What Was Built

`src/retrieval/article-filer.ts` — the compound article filing pipeline that closes the knowledge compounding feedback loop. When the wiki answers a question from existing articles, this module converts the Q&A answer into a new `type: compound` wiki article and saves it back to the store.

### Exports

- **`buildFilingPrompt(question, answer, sourceArticles)`** — Builds an LLM prompt that includes the question, answer text, source article titles/summaries, and a pre-populated `## Sources` section with numbered `wiki://slug` links. The pre-populated sources ensure `parseSourceRefs()` captures them correctly in `parseArticleOutput()`.

- **`buildCompoundArticle(parsed, sourceArticles)`** — Creates a new Article with `type: 'compound'` and `sources` as `['wiki://slug-1', 'wiki://slug-2', ...]`. Does NOT reuse `buildNewArticle()` from article-builder.ts (which hardcodes `type: 'web'`).

- **`buildUpdatedCompoundArticle(existing, parsed, sourceArticles)`** — Merges new parsed content into an existing compound article. Preserves the original slug and `created_at`. Merges `sources` as a union (no duplicates). Updates `updated_at`, `summary`, and `body`.

- **`fileAnswerAsArticle(question, answer, sourceArticles, store)`** — Main orchestration function:
  1. Builds filing prompt
  2. Calls `generateText()` with `temperature: 0.3`, `maxOutputTokens: 4096`
  3. Parses via `parseArticleOutput()` — retries once with stricter prompt suffix if null
  4. Throws `Error('Filing failed: could not parse LLM output after retry')` if still null
  5. Runs three-tier dedup via `findExistingArticle()`
  6. Builds new or updated compound article
  7. Saves via `store.saveArticle()`

### Tests

`tests/retrieval-filer.test.ts` — 35 tests across 4 describe blocks:
- `buildFilingPrompt` — question/answer inclusion, wiki:// prefix, numbered link format, ## Sources section
- `buildCompoundArticle` — type: compound, wiki:// sources, slug generation, category fallback, all frontmatter fields
- `buildUpdatedCompoundArticle` — slug preservation, created_at preservation, source union dedup, category fallback
- `fileAnswerAsArticle` — LLM call, type: compound result, saveArticle called, retry behavior, parse failure error, dedup update path, generateText options

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `fileAnswerAsArticle()` is fully wired — calls real `generateText()`, `parseArticleOutput()`, `findExistingArticle()`, and `store.saveArticle()`. No placeholder data or hardcoded empty values.

## Self-Check: PASSED

- [x] `src/retrieval/article-filer.ts` exists and exports all 4 functions
- [x] `tests/retrieval-filer.test.ts` exists with 35 tests
- [x] Commit `3778a8b` (RED — failing tests) verified in git log
- [x] Commit `d9f39ab` (GREEN — implementation) verified in git log
- [x] `grep 'type.*compound' src/retrieval/article-filer.ts` — found
- [x] `grep 'wiki://' src/retrieval/article-filer.ts` — found
- [x] `grep 'findExistingArticle' src/retrieval/article-filer.ts` — found
- [x] `grep 'parseArticleOutput' src/retrieval/article-filer.ts` — found
- [x] `grep 'store.saveArticle' src/retrieval/article-filer.ts` — found
- [x] `npx vitest run tests/retrieval-filer.test.ts` — 35/35 passed
- [x] `npx vitest run` — 246/246 passed (no regressions)

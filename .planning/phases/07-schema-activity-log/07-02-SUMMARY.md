---
phase: 07-schema-activity-log
plan: "02"
subsystem: synthesis-prompt-schema
tags: [schema, prompts, co-evolution, bootstrap, synthesis, retrieval]
dependency_graph:
  requires: [07-01]
  provides: [schema-in-prompts, schema-co-evolution, schema-bootstrap]
  affects:
    - src/synthesis/prompt-builder.ts
    - src/synthesis/synthesizer.ts
    - src/retrieval/article-filer.ts
    - src/commands/ask.ts
    - tests/synthesis.test.ts
    - tests/retrieval-filer.test.ts
    - tests/prompt-builder.test.ts
    - tests/cli.test.ts
    - tests/debug-cli.test.ts
tech_stack:
  added: []
  patterns: [schema-injection, co-evolution, bootstrap-on-first-run, read-once-pass-through]
key_files:
  created:
    - tests/prompt-builder.test.ts
  modified:
    - src/synthesis/prompt-builder.ts
    - src/synthesis/synthesizer.ts
    - src/retrieval/article-filer.ts
    - src/commands/ask.ts
    - tests/synthesis.test.ts
    - tests/retrieval-filer.test.ts
    - tests/cli.test.ts
    - tests/debug-cli.test.ts
decisions:
  - Schema injected into user prompt (not system prompt) per D-04 — consistent WIKI SCHEMA heading across all 4 prompt functions
  - Synthesizer reads schema once before article loop (not once per article) — prompt consistency across batch per Research anti-pattern
  - Co-evolution updates schema on disk but does not mutate in-memory schema variable mid-batch — intentional per Research
  - fileAnswerAsArticle receives schema from caller (ask.ts) rather than reading internally — per D-05 callers read once and pass through
  - saveArticle now receives 'create' or 'update' operation based on dedup result — per LOG-02
  - Schema bootstrap runs early in ask action before coverage check — schema available for any synthesis path
metrics:
  duration_minutes: 22
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_changed: 9
---

# Phase 7 Plan 2: Schema Prompt Wiring and Co-evolution — Summary

**One-liner:** Wired schema into all four LLM prompt functions (plan, generate, update, file), added schema read+co-evolution to the synthesizer, and added schema bootstrap to the ask command on first wiki run.

## What Was Built

### Task 1: Schema parameter in all prompt-builders + synthesizer co-evolution

Four prompt-builder functions updated with `schema: string` parameter:

- **buildPlanPrompt(input, schema)** — injects `WIKI SCHEMA (follow these conventions exactly):` section before INSTRUCTIONS
- **buildGeneratePrompt(question, plan, sources, knownSlugs, schema)** — injects WIKI SCHEMA before WIKILINKS section
- **buildUpdatePrompt(existingArticle, newSources, question, knownSlugs, schema)** — injects WIKI SCHEMA before WIKILINKS section
- **buildFilingPrompt(question, answer, sourceArticles, schema)** — injects WIKI SCHEMA before OUTPUT INSTRUCTIONS

Synthesizer (`src/synthesis/synthesizer.ts`) updated:

- Reads schema once before the article loop: `const schema = await store.readSchema() ?? ''`
- Passes schema to all three prompt-builder calls (buildPlanPrompt, buildGeneratePrompt, buildUpdatePrompt)
- After each `saveArticle`, runs co-evolution hook: extracts current categories from schema, filters new ones from article frontmatter (case-insensitive dedup), calls `store.updateSchema()` if new categories found
- `saveArticle` now receives `'create'` or `'update'` operation based on dedup result

Article-filer (`src/retrieval/article-filer.ts`) updated:

- `fileAnswerAsArticle` accepts `schema: string` as last parameter and passes it to `buildFilingPrompt`

MockWikiStore in `tests/synthesis.test.ts` and `tests/retrieval-filer.test.ts`:

- `saveArticle` updated to accept optional `_operation?: 'create' | 'update'`
- Three new stub methods: `readSchema()`, `updateSchema()`, `appendLog()`
- All `fileAnswerAsArticle` calls updated with empty `''` schema argument

New `tests/prompt-builder.test.ts` with 4 tests verifying WIKI SCHEMA injection in each prompt function.

### Task 2: Schema bootstrap in ask command + remaining test stubs

`src/commands/ask.ts` updated:

- Imports `buildDefaultSchema` from `../schema/template.js`
- After creating `WikiStore`, reads schema: `let schema = await store.readSchema()`
- If null (first run): writes bootstrap message to stderr, lists existing articles, extracts unique sorted categories, calls `buildDefaultSchema(categories)`, saves via `store.updateSchema(schema)`
- Passes `schema` to `fileAnswerAsArticle` in the wiki-first path

All `MockWikiStore` classes in `tests/cli.test.ts` and `tests/debug-cli.test.ts` updated with:
- `async readSchema() { return null; }`
- `async listArticles() { return []; }`
- `async updateSchema(_content: string) {}`

## Test Coverage

- 4 new tests in `tests/prompt-builder.test.ts` — all pass
- 287 total tests in full suite — zero regressions (previous: 284, +3 net new)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed MockWikiStore in debug-cli.test.ts missing readSchema/listArticles**
- **Found during:** Task 2 full suite run
- **Issue:** `tests/debug-cli.test.ts` had a `MockWikiStore { constructor() {} }` with no `readSchema` or `listArticles` methods. The ask command now calls both before doing any other work, causing `TypeError: store.readSchema is not a function` which triggered `process.exit(1)`.
- **Fix:** Added `readSchema`, `listArticles`, and `updateSchema` stubs to the MockWikiStore in debug-cli.test.ts — same pattern as cli.test.ts.
- **Files modified:** `tests/debug-cli.test.ts`
- **Commit:** 6c1f5a2

## Known Stubs

None — all functionality is fully wired. Schema is read from real disk via WikiStore in production paths. Test mocks return `null` which causes the bootstrap path to trigger (expected behavior in tests that mock WikiStore).

## Threat Flags

No new threat surface introduced beyond what was documented in the plan's threat model (T-07-05 through T-07-08). Schema content flows from local disk to LLM prompt only — no new network endpoints or auth paths.

## Self-Check: PASSED

Files verified:
- FOUND: src/synthesis/prompt-builder.ts
- FOUND: src/synthesis/synthesizer.ts
- FOUND: src/retrieval/article-filer.ts
- FOUND: src/commands/ask.ts
- FOUND: tests/synthesis.test.ts
- FOUND: tests/retrieval-filer.test.ts
- FOUND: tests/prompt-builder.test.ts
- FOUND: tests/cli.test.ts
- FOUND: tests/debug-cli.test.ts

Commits verified:
- 220d01b: feat(07-02): wire schema into all LLM prompts and add co-evolution hook
- 6c1f5a2: feat(07-02): add schema bootstrap to ask command and update test mocks

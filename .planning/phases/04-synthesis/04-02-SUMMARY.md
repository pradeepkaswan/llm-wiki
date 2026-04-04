---
phase: 04-synthesis
plan: "02"
subsystem: synthesis
tags: [deduplication, bm25, wikilinks, article-building, typescript, minisearch]

# Dependency graph
requires:
  - phase: 04-synthesis
    plan: "01"
    provides: "ParsedArticle, SourceRef, buildTiebreakPrompt, parseTiebreakDecision, generateText"
  - phase: 03-ingestion
    provides: "WikiStore, search-index (buildIndex, search)"
provides:
  - "Three-tier deduplication: exact slug match, BM25 near-match, LLM tiebreak"
  - "findExistingArticle() — returns existing Article to update or null to create new"
  - "BM25_DEDUP_THRESHOLD = 3.0 — exported constant for corpus-calibrated scoring"
  - "buildNewArticle() — assembles Article with provenance frontmatter (type: web, sources, sourced_at)"
  - "buildUpdatedArticle() — merges source URLs (union Set), preserves created_at, refreshes updated_at/sourced_at"
  - "stripHallucinatedWikilinks() — post-processing wikilink validation, strips unknown slugs"
affects: [04-03-synthesizer, 05-orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deduplicator accepts existingArticles[] from caller — avoids redundant listArticles() calls"
    - "WikiStore injected as argument in findExistingArticle() — enables unit testing without filesystem"
    - "BM25 index built transiently per dedup call (in-memory, not persisted)"
    - "Source URL union via new Set([...old, ...new]) — deduplication without sorting"
    - "Wikilink sanitization applied inside builder — guaranteed, callers cannot skip"
    - "Categories fallback to Uncategorized when LLM provides none — prevents index omission"
    - "Tags set to [] in buildNewArticle — tag generation deferred to future phase"

key-files:
  created:
    - src/synthesis/deduplicator.ts
    - src/synthesis/article-builder.ts
    - src/synthesis/wikilink-sanitizer.ts
    - tests/synthesis-dedup.test.ts
    - tests/synthesis-builder.test.ts
  modified: []

key-decisions:
  - "WikiStore passed as argument (not imported directly) in findExistingArticle — testability without filesystem"
  - "existingArticles[] passed in by caller to avoid redundant listArticles() calls inside deduplicator"
  - "Only API errors propagate from tiebreak — parseTiebreakDecision defaults to 'new' on ambiguous output (safe)"
  - "Wikilink sanitization applied inside buildNewArticle/buildUpdatedArticle — caller cannot skip it"
  - "Categories fallback to ['Uncategorized'] for both new and updated articles when LLM provides none"

patterns-established:
  - "Pattern: three-tier dedup (exact slug → BM25 → LLM) for corpus-aware deduplication"
  - "Pattern: builder functions return complete Article — all provenance fields set programmatically, never from LLM output"
  - "Pattern: source URL union via Set spread — O(n) dedup without sorting"

requirements-completed: [SYNTH-03, SYNTH-05, SYNTH-06, SYNTH-07]

# Metrics
duration: 5min
completed: "2026-04-04"
---

# Phase 4 Plan 2: Deduplicator, Article Builder, and Wikilink Sanitizer Summary

**Three-tier deduplication (exact slug → BM25 near-match → LLM tiebreak), article builder with complete provenance frontmatter, and wikilink sanitizer that strips hallucinated links — 40 new tests, 178 total passing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-04T15:42:37Z
- **Completed:** 2026-04-04T15:48:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `findExistingArticle()` with three-tier deduplication: exact slug match returns immediately (no LLM cost), BM25 near-match uses MiniSearch on the pre-fetched article list, LLM tiebreak with `temperature: 0` only fires when BM25 score exceeds `BM25_DEDUP_THRESHOLD = 3.0`
- Created `buildNewArticle()` with complete provenance frontmatter: `type: 'web'`, `sources` as URL array from `SourceRef[]`, `sourced_at` as ISO timestamp, `categories` defaulting to `['Uncategorized']`
- Created `buildUpdatedArticle()` that merges source URLs via `new Set([...old, ...new])`, preserves `created_at`, refreshes `updated_at` and `sourced_at`, updates categories and summary from new LLM output
- Created `stripHallucinatedWikilinks()` — pure regex function supporting both `[[slug]]` and `[[slug|display text]]` formats; strips unknown slugs to plain text (display text if provided, otherwise slug)
- Both builders apply wikilink sanitization internally — callers cannot skip it
- 40 new tests (10 dedup, 30 builder/sanitizer); full suite 178 tests across 11 files, all green

## Task Commits

Each task was committed atomically:

1. **Task 1: Three-tier deduplicator with BM25 and LLM tiebreak** - `7a57c5e` (feat)
2. **Task 2: Article builder and wikilink sanitizer with tests** - `4c94420` (feat)

_Note: Both tasks used TDD pattern (RED → GREEN)_

## Files Created/Modified

- `src/synthesis/deduplicator.ts` - New: `findExistingArticle()` with exact slug, BM25, and LLM tiers; `BM25_DEDUP_THRESHOLD = 3.0`
- `src/synthesis/article-builder.ts` - New: `buildNewArticle()` and `buildUpdatedArticle()` with complete provenance frontmatter
- `src/synthesis/wikilink-sanitizer.ts` - New: `stripHallucinatedWikilinks()` — pure function, no external deps
- `tests/synthesis-dedup.test.ts` - New: 10 tests covering all three tiers and edge cases
- `tests/synthesis-builder.test.ts` - New: 30 tests covering new/updated article building and wikilink sanitizer

## Decisions Made

- `WikiStore` passed as argument (not imported directly) — enables unit testing without any filesystem setup
- `existingArticles[]` passed in by caller — avoids redundant `listArticles()` calls inside the deduplicator when the orchestrator already has the list
- `parseTiebreakDecision` defaults to `'new'` on ambiguous LLM output — safe default avoids accidental overwrites
- Wikilink sanitization built into both builder functions — guaranteed to run, callers cannot bypass it
- Categories fallback to `['Uncategorized']` in both new and updated articles when LLM provides none

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — this plan creates pure processing modules with no data flow to UI rendering.

## Next Phase Readiness

- `findExistingArticle()` is ready for the synthesizer (04-03) to call with pre-fetched article list
- `buildNewArticle()` and `buildUpdatedArticle()` produce `Article` objects ready for `WikiStore.saveArticle()`
- `stripHallucinatedWikilinks()` is wired into both builders — no additional sanitization step needed in synthesizer
- All provenance frontmatter fields (`sources`, `sourced_at`, `type`) are set programmatically — Phase 5 feedback loop can rely on these

## Self-Check: PASSED

All created files exist on disk. Task commits 7a57c5e and 4c94420 verified in git log. Full test suite: 178 tests passing across 11 files.

---
*Phase: 04-synthesis*
*Completed: 2026-04-04*

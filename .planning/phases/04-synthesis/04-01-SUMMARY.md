---
phase: 04-synthesis
plan: "01"
subsystem: synthesis
tags: [llm, prompt-engineering, output-parsing, typescript, vercel-ai-sdk]

# Dependency graph
requires:
  - phase: 02-llm-adapter
    provides: "generateText adapter and createProvider for LLM calls"
  - phase: 03-ingestion
    provides: "RawSourceEnvelope type and raw source storage"
provides:
  - "Extended generateText() with GenerateOptions (system, temperature, maxOutputTokens)"
  - "Synthesis type contracts: SynthesisInput, ArticlePlan, ParsedArticle, SourceRef, SynthesisResult"
  - "Prompt builder: buildPlanPrompt, buildGeneratePrompt, buildUpdatePrompt, buildTiebreakPrompt"
  - "Output parser: parsePlanOutput, parseArticleOutput, parseTiebreakDecision with defensive fallbacks"
affects: [04-02-deduplicator, 04-03-synthesizer, 05-orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delimiter-based LLM output parsing over JSON — safer for long bodies with code blocks and quotes"
    - "Code fence stripping before parsing — handles LLM preamble/postamble even after explicit instructions"
    - "Source content truncated to 3000 chars per source in prompts — prevents token overflow with 5 sources"
    - "parseTiebreakDecision defaults to 'new' on ambiguous input — safe default avoids accidental overwrites"
    - "GenerateOptions with defaults={} pattern keeps generateText() backward-compatible"

key-files:
  created:
    - src/synthesis/types.ts
    - src/synthesis/prompt-builder.ts
    - src/synthesis/output-parser.ts
    - tests/synthesis-parser.test.ts
  modified:
    - src/llm/adapter.ts
    - tests/llm-adapter.test.ts

key-decisions:
  - "GenerateOptions uses maxOutputTokens (not maxTokens) — Vercel AI SDK v4+ renamed to maxOutputTokens"
  - "Fallback plan returns all source indices when ARTICLE_COUNT not found — safe over silent failure"
  - "parseArticleOutput returns null (not throws) on missing TITLE or BODY — callers decide retry strategy"
  - "Source content truncation at 3000 chars per source as code constant, not config field"

patterns-established:
  - "Pattern: LLM prompt format uses ALL_CAPS: delimiters for structured output — TITLE:, SUMMARY:, BODY:, ARTICLE_COUNT:"
  - "Pattern: parseFn strips code fences first, then scans line-by-line — never splits on exact position"
  - "Pattern: fallback returns a usable default rather than throwing — plan step never aborts the pipeline"

requirements-completed: [SYNTH-01, SYNTH-02, SYNTH-04]

# Metrics
duration: 4min
completed: "2026-04-04"
---

# Phase 4 Plan 1: Synthesis Foundation Summary

**LLM adapter extended with GenerateOptions, synthesis type contracts defined, and delimiter-based prompt-builder/output-parser with 52 passing tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04T15:36:01Z
- **Completed:** 2026-04-04T15:39:47Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Extended `generateText()` with optional `GenerateOptions` (system, temperature, maxOutputTokens) — backward-compatible with all existing callers
- Defined all synthesis type contracts: `SynthesisInput`, `ArticlePlan`, `ParsedArticle`, `SourceRef`, `SynthesisResult`
- Created `buildPlanPrompt`, `buildGeneratePrompt`, `buildUpdatePrompt`, `buildTiebreakPrompt` as pure functions with 3000-char source truncation
- Created `parsePlanOutput`, `parseArticleOutput`, `parseTiebreakDecision` with code-fence stripping and graceful fallbacks
- 52 tests across 2 test files; full suite green at 138 tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend LLM adapter and create synthesis type contracts** - `684db81` (feat)
2. **Task 2: Prompt builder and output parser with tests** - `303c2c1` (feat)

**Plan metadata:** _(final docs commit — see below)_

_Note: Both tasks used TDD pattern (RED → GREEN)_

## Files Created/Modified

- `src/llm/adapter.ts` - Added `GenerateOptions` interface and extended `generateText()` signature
- `src/synthesis/types.ts` - New: all synthesis pipeline type contracts
- `src/synthesis/prompt-builder.ts` - New: four pure prompt-building functions
- `src/synthesis/output-parser.ts` - New: three pure output-parsing functions with defensive parsing
- `tests/llm-adapter.test.ts` - Added 3 new tests for GenerateOptions passthrough
- `tests/synthesis-parser.test.ts` - New: 36 tests covering parsers and prompt-builders

## Decisions Made

- `maxOutputTokens` used (not `maxTokens`) — AI SDK v4+ renamed the field; verified in installed `node_modules/ai/dist/index.d.ts`
- Fallback plan returns all source indices when `ARTICLE_COUNT` is not found — safe: pipeline continues with a single generic article rather than aborting
- `parseArticleOutput` returns `null` (not throws) on missing TITLE or BODY — callers (deduplicator, synthesizer) decide retry strategy per D-03
- Source content truncated at 3000 chars as a named constant `SOURCE_CONTENT_MAX_CHARS` — prevents token overflow when combining 5 sources

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — this plan creates pure type/function modules with no data flow to UI rendering.

## Next Phase Readiness

- `src/synthesis/types.ts` exports all type contracts needed by 04-02 (deduplicator) and 04-03 (synthesizer)
- `generateText()` accepts system prompts and temperature — ready for planning and generation calls
- Prompt-builder functions produce prompts with correct format instructions matching what the parser expects
- Output-parser handles all defensive edge cases — ready for real LLM output in integration

---
*Phase: 04-synthesis*
*Completed: 2026-04-04*

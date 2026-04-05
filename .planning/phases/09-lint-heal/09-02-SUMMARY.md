---
phase: 09-lint-heal
plan: "02"
subsystem: heal-engine
tags: [heal, auto-fix, wiki-health, dry-run, stub-articles, cross-references]
dependency_graph:
  requires:
    - src/lint/linter.ts
    - src/synthesis/see-also.ts
    - src/synthesis/ripple.ts
    - src/synthesis/backlink-enforcer.ts
    - src/synthesis/output-parser.ts
    - src/search/search-index.ts
    - src/llm/adapter.ts
    - src/store/wiki-store.ts
    - src/schema/template.ts
  provides:
    - src/lint/healer.ts
    - src/commands/heal.ts
  affects:
    - src/index.ts
tech_stack:
  added: []
  patterns:
    - Sequential for-loop (not Promise.all) prevents index rebuild races (RESEARCH Pitfall 2)
    - TDD red-green cycle with vi.mock isolation for all external deps
    - Per-item try/catch enables graceful degradation — one failure does not abort batch
    - parseArticleOutput + one retry on parse failure (same retry pattern as file.ts)
    - dryRun flag gates entire mutation triple: saveArticle + rippleUpdates + enforceBacklinks
    - Contradiction category: stderr only, never auto-fixed (HUMAN REVIEW pattern)
    - Stale category: recommendation logging only (avoids duplicating 10-step ask pipeline)
key_files:
  created:
    - src/lint/healer.ts
    - src/commands/heal.ts
    - tests/healer.test.ts
    - tests/heal-command.test.ts
  modified:
    - src/index.ts
decisions:
  - "Stale re-fetch logs recommendation rather than executing — duplicating the 10-step ask pipeline in healer would be fragile and unmaintainable; user-facing fix is wiki ask <title> --refresh"
  - "dryRun skips generateText call entirely for missing-concept (no LLM call in dry-run mode)"
  - "Orphan fix uses BM25 top match excluding self — same search-index pattern as ripple/linter"
  - "Missing-cross-ref fix operates only on affected[0] (the source article), not both sides — enforceBacklinks handles reciprocal linking"
  - "mock.mockReset() required in beforeEach for ripple/backlink mocks — mockResolvedValue alone does not reset call counts between tests"
metrics:
  duration_seconds: 264
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_changed: 5
---

# Phase 9 Plan 02: Heal Engine and CLI Command Summary

Heal routing engine with 5-category dispatch (missing-concept, missing-cross-ref, orphan, stale, contradiction) plus `wiki heal` CLI command with `--dry-run`, JSON-to-stdout output, schema bootstrap, and internal lint invocation.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 (TDD RED) | Failing tests for healFindings() — 10 tests covering all 5 routing paths + dry-run + error handling | ca45882 | tests/healer.test.ts |
| 1 (TDD GREEN) | Implement healFindings() engine with full routing | 3714497 | src/lint/healer.ts, tests/healer.test.ts |
| 2 | Create wiki heal CLI command and wire both lint+heal into index.ts | 52a97c4 | src/commands/heal.ts, src/index.ts, tests/heal-command.test.ts |

## What Was Built

### src/lint/healer.ts

`healFindings(findings, store, config, schema, dryRun)` implementing 5 private heal functions:

1. **healMissingConcept** — LLM stub article creation via `generateText` + `parseArticleOutput`, type set programmatically to 'filed' (T-09-05), one retry on parse failure. Followed by `rippleUpdates` + `enforceBacklinks`.
2. **healMissingCrossRef** — `upsertSeeAlsoEntry` on `affected[0]` article, followed by `enforceBacklinks`.
3. **healStale** — Logs recommendation: `wiki ask "<title>" --refresh`. Increments skipped (full re-fetch is the ask pipeline — pragmatic approach).
4. **healOrphan** — BM25 via `buildIndex`/`search`, top match excluding self, `upsertSeeAlsoEntry` adds backlink from match to orphan, followed by `enforceBacklinks`.
5. **handleContradiction** — `[HUMAN REVIEW]` to stderr, adds to `humanReview[]` array, never auto-fixed.

**Critical constraints:**
- `dryRun=true` gates the entire mutation sequence (saveArticle + rippleUpdates + enforceBacklinks) — T-09-06
- Sequential `for` loop prevents index rebuild races — RESEARCH Pitfall 2 / T-09-07
- Per-item `try/catch` — one failing finding does not abort the batch

### src/commands/heal.ts

Commander `heal` subcommand:
- `--dry-run` flag passed through to healFindings()
- Schema bootstrap: reads from store, bootstraps if null via `buildDefaultSchema` (D-18)
- D-11: Runs `runLint` internally before calling `healFindings`
- JSON result to stdout, heal summary to stderr
- Logs heal start + completion to log.md via `store.appendLog()`
- Empty wiki handled with graceful early return

### src/index.ts

`healCommand` imported and registered after `lintCommand` — 7 total commands: ask, search, list, ingest, file, lint, heal.

## Test Coverage

| File | Tests | Coverage |
|------|-------|----------|
| tests/healer.test.ts | 10 | All 5 routing paths, dry-run suppression, per-item error handling, sequential ordering, post-heal ripple+backlink |
| tests/heal-command.test.ts | 4 | Command name, --dry-run option, description keywords, source-level contract (runLint, healFindings, appendLog, JSON output, buildDefaultSchema) |

**Full suite: 371 tests passing — no regressions.**

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Test adjustment** (within scope): The test for `Test 9 (per-item error)` used `expect.any(Number)` as a `toHaveBeenCalledTimes` argument, which is not a valid vitest matcher. Replaced with `toHaveBeenCalledTimes(1)` — equivalent assertion. The `beforeEach` mock reset for `rippleUpdates` and `enforceBacklinks` was extended to include `mockReset()` (not just `mockResolvedValue`) to prevent call-count leakage between test cases.

## Known Stubs

None — all 5 heal categories are fully implemented and routed:
- `missing-concept`: LLM stub article created and saved
- `missing-cross-ref`: See Also entry upserted
- `orphan`: BM25 top-match backlink upserted
- `stale`: recommendation logged (pragmatic — full pipeline is `wiki ask --refresh`)
- `contradiction`: stderr output for human review

The stale recommendation pattern is intentional and documented in the plan. It is not a stub — it is the correct behavior for this category given the complexity of duplicating the ask pipeline.

## Threat Surface Scan

No new network endpoints or auth paths introduced. `wiki heal` reuses existing patterns:
- `generateText` (existing LLM pattern via adapter.ts)
- `WikiStore.saveArticle()` (existing write pattern with frontmatter validation)
- `rippleUpdates` / `enforceBacklinks` (existing post-save patterns)

Threat mitigations T-09-05 and T-09-06 implemented as planned:
- T-09-05: LLM stub content parsed via `parseArticleOutput`, type set programmatically to 'filed'
- T-09-06: `dryRun` flag gates all three mutations (saveArticle + rippleUpdates + enforceBacklinks)

## Self-Check: PASSED

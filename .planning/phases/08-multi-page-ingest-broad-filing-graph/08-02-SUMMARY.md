---
phase: 08-multi-page-ingest-broad-filing-graph
plan: "02"
subsystem: commands
tags: [ripple, backlink, ask-command, integration, graph]
dependency_graph:
  requires: [08-01]
  provides: [ask-ripple-integration, ask-backlink-integration]
  affects: [src/commands/ask.ts, tests/cli.test.ts]
tech_stack:
  added: []
  patterns: [graceful-degradation, try-catch-non-fatal, sequential-post-synthesis]
key_files:
  created: []
  modified:
    - src/commands/ask.ts
    - tests/cli.test.ts
decisions:
  - "rippleUpdates called after synthesize() returns on web-search path — not inside synthesize() per D-01"
  - "enforceBacklinks runs after ripple on primary articles only — prevents infinite loop per RESEARCH Pitfall 4 / D-13"
  - "Both ripple and backlink enforcement wrapped in try/catch — primary articles already saved at that point"
  - "enforceBacklinks also called on wiki-first path after fileAnswerAsArticle saves compound article (GRAPH-02)"
metrics:
  duration: 15
  completed_date: "2026-04-04"
  tasks_completed: 1
  files_changed: 2
---

# Phase 08 Plan 02: Ask Command Integration Summary

**One-liner:** Wired ripple cross-reference propagation and bidirectional backlink enforcement into the wiki ask command's web-search and wiki-first paths, with graceful degradation on failure.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire ripple + backlink enforcement into ask command | 05ff482 | src/commands/ask.ts, tests/cli.test.ts |

## What Was Built

### `src/commands/ask.ts` — Web-search path additions

After `synthesize()` returns primary articles and their titles are written to stdout, two new phases run:

1. **Ripple phase** — calls `rippleUpdates(synthesisResult.articles, store, schema)`. Reports `[RIPPLE] Updated N related article(s)` or `[RIPPLE] No related articles to update` to stderr. On failure, writes `[RIPPLE] Warning: ripple failed — <msg>` and continues — primary articles are already saved.

2. **Backlink enforcement phase** — loops over each primary article calling `enforceBacklinks(article, store)`. Reports `[BACKLINK] <slug>: added backlinks to N article(s)` per article. On failure per article, writes `[BACKLINK] Warning: backlink enforcement failed for <slug> — <msg>` and continues to the next article.

The existing "Done: N new, N updated" summary message follows both phases.

### `src/commands/ask.ts` — Wiki-first path additions

After `fileAnswerAsArticle()` saves a compound article and the title is written to stdout, `enforceBacklinks(filed, store)` is called. Reports `[BACKLINK] <slug>: added backlinks to N article(s)` on success. On failure, writes `[BACKLINK] Warning: backlink enforcement failed — <msg>` and does not throw.

### `tests/cli.test.ts` — 5 new integration tests

New `describe` block: `ask command — Phase 8 ripple + backlink enforcement wiring`

| Test | Assertion |
|------|-----------|
| calls rippleUpdates after synthesize returns | `rippleUpdatesMock` called once with primary articles, store, schema string |
| calls enforceBacklinks for each article after ripple | `enforceBacklinksMock` called N times (once per article in synthesis result) |
| ripple failure does not abort the ask command | `process.exit(1)` not called; `[RIPPLE] Warning:` in stderr; "Done:" in stderr |
| backlink enforcement failure does not abort the ask command | `process.exit(1)` not called; `[BACKLINK] Warning:` in stderr; "Done:" in stderr |
| stderr contains [RIPPLE] progress message | `[RIPPLE]`, `Rippling cross-references`, `Enforcing bidirectional backlinks` all in stderr |

A shared `setupAskWebPathMocks()` helper was extracted to reduce duplication in the new tests.

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

```
Test Files  19 passed (19)
Tests  315 passed (315)
```

5 new tests added (310 → 315). No regressions.

## Known Stubs

None — all paths are fully wired with real module imports.

## Threat Flags

No new security-relevant surface introduced. T-08-05 (DoS via ripple/backlink cascade) mitigated as planned — ripple capped at 10 BM25 targets in ripple.ts; backlink enforcer is non-recursive; both wrapped in try/catch preventing abort cascade.

## Self-Check: PASSED

- [x] `grep "rippleUpdates" src/commands/ask.ts` — imported (line 16) and called (line 259)
- [x] `grep "enforceBacklinks" src/commands/ask.ts` — imported (line 17) and called (lines 117, 277)
- [x] `grep "RIPPLE" src/commands/ask.ts` — present (lines 262, 265, 269)
- [x] `grep "BACKLINK" src/commands/ask.ts` — present (lines 120, 125, 280, 285)
- [x] `npx vitest run tests/cli.test.ts` — 29 tests passed
- [x] `npx vitest run` — 315 tests passed, 0 failing
- [x] Commit 05ff482 present in git log

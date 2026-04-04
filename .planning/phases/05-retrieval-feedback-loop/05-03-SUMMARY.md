---
phase: 05-retrieval-feedback-loop
plan: "03"
subsystem: ask-command
tags: [retrieval, wiki-first, feedback-loop, readline, compound-article, cli]
dependency_graph:
  requires:
    - src/retrieval/orchestrator.ts    # assessCoverage() from Plan 01
    - src/retrieval/wiki-answer.ts     # generateWikiAnswer() from Plan 01
    - src/retrieval/article-filer.ts   # fileAnswerAsArticle() from Plan 02
    - src/config/config.ts             # coverage_threshold field from Plan 01
    - src/store/wiki-store.js          # WikiStore for both wiki and web paths
  provides:
    - src/commands/ask.ts              # Modified with wiki-first flow and --web flag
  affects:
    - tests/cli.test.ts                # Extended with 5 new Phase 5 routing tests
    - tests/debug-cli.test.ts          # Fixed to include Phase 5 retrieval mocks
tech_stack:
  added: []
  patterns:
    - readline on stderr for user confirmation prompts (INTG-02 stdout/stderr contract)
    - Wiki-first routing: BM25 coverage check -> wiki answer OR web search fallback
    - --web flag as escape hatch for direct web search
    - WikiStore hoisted to top of action for reuse across wiki and web paths
    - vi.doMock('readline') pattern for mocking readline in vitest
key_files:
  created: []
  modified:
    - src/commands/ask.ts
    - tests/cli.test.ts
    - tests/debug-cli.test.ts
decisions:
  - "readline imported as * namespace — allows vi.doMock('readline') to intercept it in tests"
  - "WikiStore created at top of action before wiki-check block — shared across wiki and web paths to avoid redundant instantiation"
  - "confirmFiling() defined as module-level async function (not inline arrow) — improves readability and testability"
  - "Existing web flow unchanged after wiki-check block — safe fallthrough path preserved"
  - "debug-cli.test.ts updated alongside cli.test.ts — was untracked but breaks from same cause"
metrics:
  duration_seconds: 480
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_changed: 3
---

# Phase 05 Plan 03: Ask Command Integration Summary

Full Phase 5 retrieval + feedback loop wired into ask command: wiki-first BM25 coverage check, wiki answer generation, readline filing confirmation on stderr, compound article filing on approval, and --web flag for direct web search bypass.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Modify ask command with wiki-first flow, --web flag, readline confirmation | 8cade29 | src/commands/ask.ts |
| 2 | Add CLI tests for wiki path, web fallback, --web flag, filing confirmation | 8c38c0f | tests/cli.test.ts, tests/debug-cli.test.ts |
| 3 | Checkpoint: human-verify (auto-approved) | — | — |

## What Was Built

**Modified `src/commands/ask.ts`**

The ask command now implements the full Phase 5 retrieval + feedback loop:

1. **Wiki-first check** (new, skipped if `--web`):
   - Writes `Checking wiki for: "..."` to stderr
   - Calls `assessCoverage(question, store, config.coverage_threshold)` from Plan 01
   - If `covered: true`: writes `[WIKI] Found N relevant article(s)...` to stderr
     - Calls `generateWikiAnswer(question, coverage.articles)` — writes answer to stdout
     - Calls `confirmFiling()` — prompts `File this answer back into the wiki? [y/N]` on stderr
     - If user approves: calls `fileAnswerAsArticle()` — writes article title to stdout, `[SAVED]` to stderr
     - Returns — does NOT fall through to web search
   - If `covered: false`: writes `[WEB] Wiki coverage insufficient...` to stderr, falls through

2. **`--web` flag** — bypasses wiki check entirely, goes directly to web search

3. **`confirmFiling()` helper** — `readline.createInterface` with `output: process.stderr` (critical for INTG-02 contract), resolves to boolean based on `y/Y` prefix input

4. **Existing web flow unchanged** — search -> fetch -> extract -> quality -> store -> synthesize continues exactly as before

**Extended `tests/cli.test.ts`**

5 new tests in `describe('ask command — Phase 5 retrieval routing')`:
- Routes to wiki answer when coverage is sufficient (generateWikiAnswer called, search not called)
- Falls through to web search when coverage is insufficient (search called)
- `--web` skips wiki check entirely (assessCoverage not called, search called)
- stderr contains `[WIKI]` when answering from wiki
- stderr contains `[WEB]` when falling through to web search

Existing tests fixed: added `coverage_threshold: 5.0` to config mocks and `assessCoverage` mock returning `{ covered: false }` so they continue testing the web path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing ask command tests breaking from Phase 5 integration**

- **Found during:** Task 2 — running existing tests after Task 1 changes
- **Issue:** 3 existing tests in `ask command — ingestion pipeline wiring` and 1 in `tests/debug-cli.test.ts` failed because ask command now calls `assessCoverage(question, store, ...)` before web search. The mock `WikiStore` had no `listArticles()` method, causing errors when `assessCoverage` was called.
- **Fix:** Added `coverage_threshold: 5.0` to config mock and `vi.doMock('../src/retrieval/orchestrator.js', () => ({ assessCoverage: vi.fn().mockResolvedValue({ covered: false, articles: [] }) }))` to each affected test so they fall through to web search as expected.
- **Files modified:** `tests/cli.test.ts`, `tests/debug-cli.test.ts`
- **Commit:** 8c38c0f

## Known Stubs

None. All integrations are fully wired:
- `assessCoverage` is the real function from Plan 01 (called in production; mocked in tests)
- `generateWikiAnswer` is the real function from Plan 01
- `fileAnswerAsArticle` is the real function from Plan 02
- `confirmFiling` uses real Node.js readline (mocked via `vi.doMock('readline')` in tests)

## Self-Check

Files modified:

- [x] `src/commands/ask.ts` — contains `import * as readline`, `assessCoverage`, `generateWikiAnswer`, `fileAnswerAsArticle`, `.option('--web')`, `confirmFiling`, `if (!options.web)`, `rl.close()`, `process.stdout.write` for answers
- [x] `tests/cli.test.ts` — contains `vi.mock` for all 3 retrieval modules (via doMock), describe block with "Phase 5 retrieval routing", test for --web flag
- [x] `tests/debug-cli.test.ts` — fixed with Phase 5 retrieval mocks

Commits:

- [x] `8cade29` — feat(05-03): wire wiki-first flow, --web flag, and readline confirmation into ask command
- [x] `8c38c0f` — test(05-03): add Phase 5 retrieval routing tests and fix existing test mocks

## Self-Check: PASSED

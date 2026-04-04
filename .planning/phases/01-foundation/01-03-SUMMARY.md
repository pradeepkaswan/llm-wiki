---
phase: 01-foundation
plan: 03
subsystem: cli
tags: [typescript, commander, minisearch, bm25, cli, vitest, tdd, stdout-stderr]
dependency_graph:
  requires: [src/types/article.ts, src/config/config.ts, src/store/wiki-store.ts, commander, minisearch, @clack/prompts]
  provides: [src/index.ts, src/search/search-index.ts, src/commands/ask.ts, src/commands/search.ts, src/commands/list.ts, src/commands/ingest.ts]
  affects: [phase-02, phase-03, phase-06]
tech_stack:
  added: []
  patterns:
    - CLI entry point via Commander 14 with configureOutput() routing all Commander output to stderr
    - stdout/stderr separation enforced at entry point — stdout reserved for machine-readable JSON only
    - BM25 search via MiniSearch with title boost 3, summary boost 2, prefix + fuzzy matching
    - All human output via process.stderr.write() directly (clack.intro/outro write stdout — not safe for INTG-02)
    - TDD Red-Green — failing tests committed before implementation in both tasks
key_files:
  created:
    - src/index.ts
    - src/search/search-index.ts
    - src/commands/ask.ts
    - src/commands/search.ts
    - src/commands/list.ts
    - src/commands/ingest.ts
    - tests/search-index.test.ts
    - tests/cli.test.ts
  modified:
    - src/commands/search.ts (clack removed — Rule 1 fix)
decisions:
  - "clack.intro/outro write to process.stdout by default — replaced with process.stderr.write() in all command files to satisfy INTG-02 stdout/stderr contract"
  - "configureOutput({ writeOut: process.stderr.write, writeErr: process.stderr.write }) in src/index.ts redirects Commander help/error output from stdout to stderr"
  - "MiniSearch searchOptions defined at buildIndex() time (not per-search) for performance consistency — fuzzy:0.2, prefix:true, boost:{title:3,summary:2}"
metrics:
  duration: "1443 seconds (24 minutes)"
  completed: "2026-04-04"
  tasks_completed: 2
  files_created: 8
  files_modified: 1
---

# Phase 1 Plan 3: CLI Entry Point + MiniSearch BM25 Summary

Commander 14 CLI with all four subcommands wired, stdout/stderr separation enforced via configureOutput(), and MiniSearch BM25 search over local wiki articles.

## Public API

```
wiki ask "<question>"         — stderr stub: "LLM features available in Phase 2+"
wiki search "<query>"         — BM25 search, JSON results to stdout
wiki list                     — article list to stderr; --json flag writes to stdout
wiki ingest <url>             — stderr stub: "URL ingestion available in Phase 3"
wiki --help                   — help output to stderr (configureOutput redirect)
```

```typescript
// src/search/search-index.ts
export function buildIndex(articles: Article[]): MiniSearch<SearchDoc>
export function search(index: MiniSearch<SearchDoc>, query: string): SearchResult[]

export interface SearchResult {
  slug: string;
  title: string;
  summary: string;
  score: number;
}
```

## Test Results

All 25 tests pass across 4 test files:

```
tests/config.test.ts         (3 tests — all pass)
tests/wiki-store.test.ts     (10 tests — all pass)
tests/search-index.test.ts   (4 tests — all pass)
tests/cli.test.ts            (8 tests — all pass)
```

## Stdout/stderr Verification

```bash
wiki ask "test" 2>/dev/null          # → "" (empty stdout — VERIFIED)
wiki --help 2>/dev/null              # → "" (empty stdout — VERIFIED)
wiki search "test" 2>/dev/null       # → "[]" (valid JSON — VERIFIED)
wiki list 2>/dev/null                # → "" (empty stdout — VERIFIED)
```

## configureOutput Confirmation

```typescript
program.configureOutput({
  writeOut: (str) => process.stderr.write(str),
  writeErr: (str) => process.stderr.write(str),
  outputError: (str, write) => write(str),
});
```

This is the key line for Phase 6 subprocess use: `wiki search | jq` works correctly because Commander's help/error output never reaches stdout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] clack.intro/outro write to stdout, not stderr**
- **Found during:** Task 2 GREEN phase (3 of 8 CLI tests failed)
- **Issue:** `@clack/prompts` `intro()` and `outro()` hardcode `process.stdout` as their output stream. The plan specified "clack or process.stderr.write" for stderr output, but clack's built-ins unconditionally write to stdout, violating INTG-02.
- **Fix:** Replaced all `clack.intro()`, `clack.outro()` calls in ask.ts, ingest.ts, list.ts, and search.ts with direct `process.stderr.write()` calls. The `@clack/prompts` import was removed from ask.ts and ingest.ts entirely; list.ts and search.ts also dropped the import.
- **Files modified:** src/commands/ask.ts, src/commands/ingest.ts, src/commands/list.ts, src/commands/search.ts
- **Commit:** 4bfca0f

**2. [Rule 3 - Blocking] wiki-store.ts missing from worktree**
- **Found during:** Pre-execution setup
- **Issue:** This worktree (agent-ac085118) branched from main at 87d09f3. The WikiStore implementation (c6b9ec2) was committed to a parallel worktree (worktree-agent-a2bfeee8) that hadn't been merged to main yet.
- **Fix:** Merged `worktree-agent-a2bfeee8` into this worktree before starting task execution.
- **Files affected:** src/store/wiki-store.ts, tests/wiki-store.test.ts
- **Resolution:** `git merge worktree-agent-a2bfeee8` — clean merge, no conflicts

## Known Stubs

- `wiki ask` — Phase 2+ only. Prints stub message to stderr, no LLM call.
- `wiki ingest` — Phase 3+ only. Prints stub message to stderr, no URL fetching.

These stubs are intentional per the plan. Phase 2 will wire LLM/web search into `ask`. Phase 3 will implement URL ingestion.

## Self-Check: PASSED

Files exist:
- FOUND: src/index.ts
- FOUND: src/search/search-index.ts
- FOUND: src/commands/ask.ts
- FOUND: src/commands/search.ts
- FOUND: src/commands/list.ts
- FOUND: src/commands/ingest.ts
- FOUND: tests/search-index.test.ts
- FOUND: tests/cli.test.ts
- FOUND: .planning/phases/01-foundation/01-03-SUMMARY.md

Commits exist:
- ab5ef03 — test(01-03): add failing tests for MiniSearch search-index module
- 18e1728 — feat(01-03): implement MiniSearch BM25 search index and search command
- b87466a — test(01-03): add failing CLI integration tests for all four commands
- 4bfca0f — feat(01-03): wire CLI entry point and all four subcommands

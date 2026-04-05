---
phase: 08-multi-page-ingest-broad-filing-graph
plan: "03"
subsystem: commands
tags: [file-command, placement-planning, broad-filing, tdd, ripple, backlink]
dependency_graph:
  requires: [08-01]
  provides: [wiki-file-command, placement-planner, filed-article-type]
  affects: [src/commands/file.ts, src/index.ts]
tech_stack:
  added: []
  patterns: [LLM-placement-planning, sequential-placement-execution, TTY-guard, dedup-before-create, type-preservation-on-update]
key_files:
  created:
    - src/commands/file.ts
    - tests/file-command.test.ts
  modified:
    - src/index.ts
decisions:
  - "parsePlacementDecisions uses /^```[a-zA-Z]*\\n?/ regex to handle both json-fenced and plain-fenced LLM responses"
  - "executePlacement falls through from update to create when target slug not found in store"
  - "Update path preserves existing article type (web/compound/filed) — filing merges never override type"
  - "Create path always assigns type:filed per D-09 — empty sources array (no web sources for filed content)"
  - "Deduplication via findExistingArticle() runs on create path before writing — same pattern as article-filer.ts"
metrics:
  duration: 4
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_changed: 3
---

# Phase 08 Plan 03: Wiki File Command Summary

**One-liner:** `wiki file` command with LLM placement planning (create/update/split decisions), type:filed articles, and ripple+backlink propagation after every filing operation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for file command | 77e8ab7 | tests/file-command.test.ts |
| 1 (GREEN) | Wiki file command implementation | 744d347 | src/commands/file.ts |
| 2 | Register file command in CLI entry point | e4359cd | src/index.ts |

## What Was Built

### `src/commands/file.ts`

Main wiki file command with four exported units:

**`readInput(textArg)`** — Reads freeform text from CLI argument or stdin pipe. Per T-08-09, exits immediately with a helpful error if stdin is a TTY and no argument was given — prevents the command from hanging waiting for terminal input.

**`buildPlacementPrompt(text, existingArticles, schema)`** — Constructs the LLM prompt for placement planning. Includes the full freeform text, an enumerated list of all existing articles with their slugs and summaries, and the wiki schema. Instructs the LLM to return a JSON array of `{action, slug, title, reason}` decisions.

**`parsePlacementDecisions(raw)`** — Parses LLM placement response. Strips markdown code fences (both ` ```json ` and plain ` ``` ` variants), wraps `JSON.parse` in try/catch, validates that each entry has all four required fields and a valid action value. Returns empty array on any failure — never throws.

**`executePlacement(decision, text, store, existingArticles, schema)`** — Executes one placement decision:
- `update`: Loads existing article via slug, calls LLM to merge text into body, preserves existing `type` (web/compound stays as-is), saves with `'update'` operation
- `create`: Runs `findExistingArticle()` for dedup; if match found treats as merge; otherwise generates new article with `type: 'filed'` and `sources: []`, saves with `'create'` operation
- Both paths retry LLM call once on parse failure (established pattern from article-filer.ts)

**`fileCommand`** — Commander subcommand `wiki file [text]`:
1. Reads input (arg or stdin)
2. Bootstraps schema if missing (same pattern as ask command)
3. Calls LLM for placement decisions
4. Executes placements sequentially (graceful per-item failure)
5. Calls `rippleUpdates()` on all filed articles
6. Calls `enforceBacklinks()` per filed article
7. Titles written to stdout; all progress to stderr (INTG-02)

### `src/index.ts` (modified)

Added `import { fileCommand } from './commands/file.js'` and `program.addCommand(fileCommand)` after `ingestCommand` registration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plain code fence regex needed broader match**
- **Found during:** Task 1 GREEN (1 failing test after initial implementation)
- **Issue:** The regex `/^```json?\n?/i` only stripped ` ```json ` and ` ```j ` fences. Plain ` ``` ` fences (without language specifier) were not matched, causing `parsePlacementDecisions` to fail on plain-fenced JSON.
- **Fix:** Changed to `/^```[a-zA-Z]*\n?/` — matches ` ``` ` followed by any optional language identifier.
- **Files modified:** src/commands/file.ts
- **Commit:** 744d347 (included in GREEN commit)

## Test Results

```
Test Files  20 passed (20)
Tests  336 passed (336)
```

26 new tests added (file-command.test.ts). Full suite: **336 tests passing**, no regressions.

## Known Stubs

None — all functions are fully implemented with real logic. rippleUpdates and enforceBacklinks are fully wired from Plan 01 implementations.

## Threat Flags

No new security surface beyond the plan's threat model. Mitigations applied:
- T-08-08: JSON.parse wrapped in try/catch with code fence stripping — implemented
- T-08-09: TTY guard in readInput() — implemented (exits with clear error + usage hint)
- T-08-10: Slug safety delegated to WikiStore.saveArticle() which uses slugify — no path traversal risk

## Self-Check: PASSED

- [x] `src/commands/file.ts` exists
- [x] `tests/file-command.test.ts` exists
- [x] `src/index.ts` contains `fileCommand`
- [x] `grep "export const fileCommand" src/commands/file.ts` matches
- [x] `grep "type: 'filed'" src/commands/file.ts` matches
- [x] `grep "rippleUpdates" src/commands/file.ts` matches
- [x] `grep "enforceBacklinks" src/commands/file.ts` matches
- [x] Commits 77e8ab7, 744d347, e4359cd present in git log
- [x] 336 tests passing, 0 failing

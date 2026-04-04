---
phase: 06-openclaw-skill
plan: "01"
subsystem: config, ask-command
tags: [freshness, refresh, non-tty, subprocess, config]
dependency_graph:
  requires: []
  provides: [freshness_days-config, refresh-flag, non-tty-guard, isArticleStale]
  affects: [src/config/config.ts, src/commands/ask.ts]
tech_stack:
  added: []
  patterns: [optional-config-field, isTTY-guard, staleness-check]
key_files:
  created: []
  modified:
    - src/config/config.ts
    - src/commands/ask.ts
    - tests/config.test.ts
    - tests/cli.test.ts
decisions:
  - "freshness_days is optional in Config interface — avoids breaking 20+ test fixtures that construct Config inline"
  - "isArticleStale exported for testability — sourced_at=null always treated as stale"
  - "confirmFiling exported for direct unit testing of non-TTY guard"
  - "Non-TTY guard placed BEFORE readline.createInterface() — prevents hang in subprocess"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_modified: 4
requirements: [INTG-03]
---

# Phase 6 Plan 01: Article Freshness and Non-TTY Guard Summary

**One-liner:** freshness_days config field (default 30) with --refresh flag that re-fetches stale articles and non-TTY guard preventing readline hang in subprocess invocation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend Config with freshness_days | 843e62f | src/config/config.ts, tests/config.test.ts |
| 2 | Add --refresh flag and non-TTY guard to ask command | 98fdbbc | src/commands/ask.ts, tests/cli.test.ts |

## What Was Built

### Task 1: freshness_days Config Field

Added `freshness_days?: number` as an optional field to the `Config` interface in `src/config/config.ts`. The field is optional to preserve compatibility with all existing test fixtures that construct Config objects inline without the field. `DEFAULTS.freshness_days = 30` sets the standard default. `validateConfig()` enforces that if the field is present, it must be a positive number — rejecting zero, negatives, and non-number types. The loadConfig catch block re-throws freshness_days validation errors so they are not silently swallowed as first-run cases.

### Task 2: --refresh Flag and Non-TTY Guard

Three additions to `src/commands/ask.ts`:

1. **Non-TTY guard on confirmFiling** (D-09, T-06-02): `if (!process.stdin.isTTY) return false` added before `readline.createInterface()`. This prevents indefinite hang when wiki is invoked as a subprocess by OpenClaw. `confirmFiling` is now exported for direct unit testing.

2. **isArticleStale helper** (exported): Checks `article.frontmatter.sourced_at` against `freshnessDays`. `sourced_at === null` is always stale. Otherwise compares age in milliseconds against `freshnessDays * 86400000`.

3. **--refresh flag** on askCommand: When `--refresh` is set and `--web` is not, the command calls `assessCoverage` to find the top article. If stale (via `isArticleStale`), forces `options.web = true` to trigger web re-fetch. If fresh, falls through to normal wiki-first flow. If no matching article found, degrades to web search (D-07).

## Test Results

- Config tests: 23 passed (17 original + 6 new freshness_days tests)
- CLI tests: 24 passed (19 original + 5 new: 1 non-TTY guard + 4 refresh scenarios)
- Full suite: **262 tests passed** (up from 251)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All new functionality is fully wired with real logic.

## Threat Surface Scan

Both threats from the plan's threat model are mitigated:

| Threat | Mitigation | Location |
|--------|-----------|----------|
| T-06-01: freshness_days tampering | typeof check + > 0 guard in validateConfig() | src/config/config.ts:51-54 |
| T-06-02: readline DoS in subprocess | `if (!process.stdin.isTTY) return false` before createInterface | src/commands/ask.ts:20-22 |

T-06-03 (stderr logging) accepted per plan — no secrets in refresh log messages.

## Self-Check

Files exist:
- src/config/config.ts: FOUND
- src/commands/ask.ts: FOUND
- tests/config.test.ts: FOUND
- tests/cli.test.ts: FOUND

Commits exist:
- 843e62f (Task 1): FOUND
- 98fdbbc (Task 2): FOUND

## Self-Check: PASSED

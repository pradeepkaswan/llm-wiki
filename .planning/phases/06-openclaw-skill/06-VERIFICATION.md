---
phase: 06-openclaw-skill
verified: 2026-04-04T19:02:49Z
status: human_needed
score: 7/8 must-haves verified
human_verification:
  - test: "Invoke `wiki ask` from within a Claude Code session using the registered OpenClaw skill"
    expected: "Claude Code agent can call `wiki ask \"<question>\"` as a subprocess, receive stdout with an answer or article title, and not hang on confirmFiling"
    why_human: "OpenClaw agent runtime is not available in the dev environment; cannot programmatically simulate an agent-driven subprocess invocation"
---

# Phase 6: OpenClaw Skill Verification Report

**Phase Goal:** The wiki is accessible from any OpenClaw-connected interface (Telegram, Claude Code) with no new logic — the CLI is the implementation, the skill is a thin wrapper
**Verified:** 2026-04-04T19:02:49Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `freshness_days` is a configurable option in `~/.llm-wiki/config.json` with default 30 | VERIFIED | `src/config/config.ts`: `freshness_days?: number` in Config interface; `freshness_days: 30` in DEFAULTS; `validateConfig` enforces positive number. 6 passing tests confirm. |
| 2 | `wiki ask --refresh` re-fetches web sources when an existing article's `sourced_at` is older than `freshness_days` | VERIFIED | `src/commands/ask.ts` lines 54-78: `isArticleStale` compares `sourced_at` against `freshnessDays * 86400000`; forces `options.web = true` when stale. Test "stale article (sourced_at 60 days ago) triggers web search path" passes. |
| 3 | `wiki ask --refresh` with a fresh article answers from wiki without web search | VERIFIED | Same logic in ask.ts: when `isArticleStale` returns false, `options.web` stays false and wiki-first flow runs. Test "fresh article (sourced_at 5 days ago) answers from wiki without web search" passes. |
| 4 | `wiki ask --refresh` with no matching article degrades gracefully to normal web search | VERIFIED | `src/commands/ask.ts` lines 73-77: when `coverage.covered` is false or `articles.length === 0`, forces `options.web = true`. Test "no matching article falls through to normal web search (D-07)" passes. |
| 5 | `confirmFiling()` returns false immediately when `process.stdin.isTTY` is falsy (non-interactive subprocess) | VERIFIED | `src/commands/ask.ts` lines 19-22: `if (!process.stdin.isTTY) return false` placed before `readline.createInterface()`. Test "returns false when process.stdin.isTTY is undefined" passes. |
| 6 | SKILL.md exists at `skills/llm-wiki/SKILL.md` with valid OpenClaw frontmatter | VERIFIED | File exists; frontmatter contains `name: llm-wiki`, `version: 1.0.0`, `metadata: {"openclaw":{"requires":{"bins":["wiki"]}}}` as single-line JSON. |
| 7 | SKILL.md documents all four commands with stdout/stderr parsing instructions | VERIFIED | File contains `wiki ask`, `wiki search`, `wiki list`, `wiki ingest` sections; `--refresh` and `--web` flags documented; "Never parse stderr" instruction present. |
| 8 | A user can invoke `wiki ask` and `wiki search` from within a Claude Code session via the registered OpenClaw skill | UNCERTAIN | SKILL.md is correctly placed in `skills/llm-wiki/` (OpenClaw path priority #1). Non-TTY guard ensures no readline hang. However, end-to-end invocation via actual OpenClaw agent requires human verification. |

**Score:** 7/8 truths verified (1 requires human verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/config/config.ts` | `freshness_days` field in Config interface, DEFAULTS, validateConfig | VERIFIED | Lines 18, 30, 51-54. Optional field (`freshness_days?: number`) avoids breaking 20+ existing test fixtures. |
| `src/commands/ask.ts` | `--refresh` flag, `isArticleStale` helper, non-TTY guard on `confirmFiling` | VERIFIED | Lines 18-40 (confirmFiling with isTTY guard, isArticleStale export); lines 42-46 (--refresh option); lines 54-78 (staleness logic). Both functions exported for testability. |
| `skills/llm-wiki/SKILL.md` | OpenClaw skill manifest with subprocess invocation instructions | VERIFIED | File at correct path. All required frontmatter present. All four commands documented with stdout/stderr contract. |
| `package.json` | `prepare` and `prepublishOnly` scripts, `files` field | VERIFIED | `prepare: "npm run build"`, `prepublishOnly: "npm run build"`, `files: ["dist/", "skills/", "package.json"]`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/commands/ask.ts` | `src/config/config.ts` | `loadConfig().freshness_days` used in staleness check | WIRED | `config.freshness_days ?? 30` at line 60; imported via `loadConfig` at line 3. |
| `src/commands/ask.ts` | `src/retrieval/orchestrator.ts` | `assessCoverage` finds relevant articles for staleness check | WIRED | `assessCoverage` imported at line 12; called at line 56 within `--refresh` block. |
| `skills/llm-wiki/SKILL.md` | `dist/index.js` | `requires.bins` declares `wiki` binary dependency | WIRED | Line 5: `metadata: {"openclaw":{"requires":{"bins":["wiki"]}}}`. `dist/index.js` line 1 is `#!/usr/bin/env node`. |
| `package.json` | `dist/` | `files` field includes `dist/` for registry installs | WIRED | `"files": ["dist/", "skills/", "package.json"]` confirmed. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/commands/ask.ts` (--refresh path) | `coverage.articles[0]` (topArticle) | `assessCoverage()` → MiniSearch BM25 index query against real WikiStore | Yes — BM25 queries actual on-disk article index | FLOWING |
| `src/commands/ask.ts` (isArticleStale) | `article.frontmatter.sourced_at` | Loaded from article frontmatter in WikiStore (real YAML parse) | Yes — sourced_at is a real ISO date from previously synthesized articles | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `--refresh` flag visible in `wiki ask --help` | `npx tsx src/index.ts ask --help` | Output contains `--refresh   re-fetch sources for stale articles (older than freshness_days)` | PASS |
| `--web` flag still visible in `wiki ask --help` | Same command | Output contains `--web       skip wiki check and search the web directly` | PASS |
| `dist/index.js` shebang for global install | `head -1 dist/index.js` | `#!/usr/bin/env node` | PASS |
| `package.json` packaging configuration | `node -e "const p=require('./package.json'); ..."` | `prepare: npm run build`, `prepublishOnly: npm run build`, `files: ["dist/", "skills/", "package.json"]` | PASS |
| `confirmFiling` and `isArticleStale` exported | Rebuild + inspect `dist/commands/ask.js` | `exports.confirmFiling = confirmFiling` (line 37), `exports.isArticleStale = isArticleStale` (line 38) | PASS |
| Full test suite passes | `npx vitest run` | 262 tests passed, 15 test files | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INTG-01 | 06-02-PLAN.md | OpenClaw skill allows querying the wiki from any OpenClaw-connected interface | SATISFIED | `skills/llm-wiki/SKILL.md` exists with valid frontmatter, all four commands documented, `bins: ["wiki"]` declared. SKILL.md placed at `skills/llm-wiki/` (OpenClaw workspace path priority #1). |
| INTG-03 | 06-01-PLAN.md | Article freshness tracked via `sourced_at` frontmatter + `--refresh` flag to update stale articles | SATISFIED | `freshness_days` in Config (default 30); `isArticleStale()` checks `sourced_at` against freshness threshold; `--refresh` flag wired to staleness check; 4 passing test scenarios. |

**Note:** REQUIREMENTS.md still shows INTG-01 and INTG-03 as `[ ]` (pending) and "Pending" in the traceability table — the document was not updated as part of Phase 6 execution. This is a documentation gap only; the implementation fully satisfies both requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No anti-patterns found. No TODOs, placeholders, empty implementations, or hardcoded stub data in any of the four modified/created files.

### Human Verification Required

#### 1. End-to-End OpenClaw Skill Invocation

**Test:** Open a Claude Code session in the `llm-wiki` project directory. OpenClaw should auto-load `skills/llm-wiki/SKILL.md` from the workspace `skills/` directory. Ask Claude Code: "Search the wiki for attention mechanism" or "Ask the wiki how attention works."

**Expected:** Claude Code agent invokes `wiki ask "how does attention work?"` or `wiki search "attention mechanism"` as a subprocess. The command completes without hanging (non-TTY guard active). Stdout contains either an answer (wiki path) or article title(s) (web path). No TTY escape codes or spinner output on stdout.

**Why human:** OpenClaw agent runtime is not available in the dev environment. Cannot programmatically simulate an agent-driven subprocess invocation or verify that OpenClaw correctly parses the SKILL.md frontmatter and loads the skill.

### Gaps Summary

No gaps. All automated checks pass. The single human_needed item is an end-to-end integration test requiring the OpenClaw agent runtime, which is not available in the dev environment. All underlying components (non-TTY guard, SKILL.md format, stdout/stderr contract, binary shebang, npm packaging) are verified correct.

The REQUIREMENTS.md document was not updated to mark INTG-01 and INTG-03 as complete — this is a documentation-only gap that does not affect functionality.

---

_Verified: 2026-04-04T19:02:49Z_
_Verifier: Claude (gsd-verifier)_

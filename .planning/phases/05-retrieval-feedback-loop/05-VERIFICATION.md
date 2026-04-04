---
phase: 05-retrieval-feedback-loop
verified: 2026-04-04T22:50:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Run 'wiki ask' against a populated vault (at least one article)"
    expected: "System checks wiki BM25 before going to web; if coverage sufficient, prints answer to stdout; prompts 'File this answer back into the wiki? [y/N]' on stderr"
    why_human: "Requires live vault data, API keys, and terminal interaction to observe readline prompt behaviour"
  - test: "Run 'wiki ask' with an empty vault"
    expected: "Falls through to web search without error (empty-wiki guard path)"
    why_human: "Requires a real empty vault directory and live Exa/Brave API key"
  - test: "Run 'wiki ask --web <question>' on a populated vault"
    expected: "assessCoverage is skipped entirely; web search runs; [WEB] prefix never appears; no stdin readline prompt"
    why_human: "Requires live environment to confirm --web bypass at the UX level"
  - test: "Approve filing when prompted"
    expected: "compound article saved to vault with type: compound, sources prefixed wiki://, and readable Markdown frontmatter"
    why_human: "Requires interactive stdin confirmation and vault-filesystem inspection"
---

# Phase 05: Retrieval + Feedback Loop Verification Report

**Phase Goal:** The wiki answers its own questions — the system checks local knowledge before fetching the web, and Q&A answers compound back into the wiki as durable artifacts.
**Verified:** 2026-04-04T22:50:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `assessCoverage()` returns `covered: false` for empty wiki (no crash) | VERIFIED | `orchestrator.ts` line 27-29: early return guard when `articles.length === 0` |
| 2 | `assessCoverage()` returns `covered: true` with top articles when BM25 score >= threshold | VERIFIED | Lines 36-46: score check, `results.slice(0, 5)`, full article load via `store.getArticle()` |
| 3 | `assessCoverage()` returns `covered: false` when BM25 score < threshold | VERIFIED | Line 36-38: `!topResult || topResult.score < threshold` guard |
| 4 | `assessCoverage()` returns at most 5 articles above minimum score | VERIFIED | `results.slice(0, 5)` at line 41 |
| 5 | `generateWikiAnswer()` produces a text answer from wiki article context | VERIFIED | `wiki-answer.ts` calls `generateText` with `buildWikiAnswerPrompt` output and returns result |
| 6 | `coverage_threshold` is configurable in config.json with default 5.0 | VERIFIED | `config.ts` line 17: interface field; line 28: `DEFAULTS.coverage_threshold: 5.0`; lines 44-48: validation |
| 7 | Q&A answer is converted to article format via LLM and parsed by `parseArticleOutput()` | VERIFIED | `article-filer.ts` lines 179-198: `generateText` + `parseArticleOutput` with retry |
| 8 | Filed compound article has `type: compound` in frontmatter | VERIFIED | `article-filer.ts` line 99: `type: 'compound'` in `buildCompoundArticle` frontmatter |
| 9 | Filed compound article has sources prefixed with `wiki://` | VERIFIED | `article-filer.ts` line 91: `sourceArticles.map((a) => \`wiki://${a.slug}\`)` |
| 10 | Filed compound article goes through deduplication via `findExistingArticle()` | VERIFIED | `article-filer.ts` lines 205-206: `store.listArticles()` + `findExistingArticle(parsed.title, store, existingArticles)` |
| 11 | Existing compound article on same topic is updated rather than duplicated | VERIFIED | Lines 209-211: ternary using `buildUpdatedCompoundArticle` when existing found |
| 12 | `wiki ask` checks the wiki via BM25 before searching the web | VERIFIED | `ask.ts` lines 41-68: `if (!options.web)` block calls `assessCoverage` before web flow |
| 13 | `wiki ask --web` skips the wiki check entirely | VERIFIED | `ask.ts` line 41: `if (!options.web)` guard; CLI test at line 876 asserts `assessCoverageMock` not called |
| 14 | After wiki-sourced answer, user is prompted to file it back (readline on stderr) | VERIFIED | `ask.ts` lines 17-28: `confirmFiling()` uses `readline.createInterface` with `output: process.stderr`; `rl.close()` present |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/config/config.ts` | `coverage_threshold` field in Config + DEFAULTS + validation | VERIFIED | Interface line 17, DEFAULTS line 28, validateConfig lines 44-48, re-throw guard line 66-68 |
| `src/retrieval/orchestrator.ts` | `assessCoverage()` + `CoverageResult` export | VERIFIED | 48 lines, exports both, fully wired to `buildIndex`/`search`/`store` |
| `src/retrieval/wiki-answer.ts` | `generateWikiAnswer()` export | VERIFIED | 20 lines, exports function, calls `generateText` at `temperature: 0.2`, `maxOutputTokens: 2048` |
| `src/retrieval/prompt-builder.ts` | `buildWikiAnswerPrompt()` + `WIKI_CONTEXT_MAX_CHARS` export | VERIFIED | 49 lines, exports both, `WIKI_CONTEXT_MAX_CHARS = 3000`, truncation at line 13-17 |
| `src/retrieval/article-filer.ts` | `fileAnswerAsArticle()` + `buildCompoundArticle()` exports | VERIFIED | 219 lines, exports all 4 functions, full pipeline wired |
| `src/commands/ask.ts` | Modified ask with wiki-first flow, `--web` flag, readline confirmation | VERIFIED | 202 lines, all new imports present, `confirmFiling()` defined, `if (!options.web)` guard, `process.stdout.write` for answers |
| `tests/retrieval.test.ts` | Unit tests for coverage assessment, wiki answer, config | VERIFIED | 284 lines (min 100), 4 describe blocks, all assertions present |
| `tests/retrieval-filer.test.ts` | Unit tests for compound article filing | VERIFIED | 421 lines (min 80), 4 describe blocks, 35 tests covering all paths |
| `tests/cli.test.ts` | Extended CLI tests for wiki routing, --web flag, stderr labels | VERIFIED | `describe('ask command — Phase 5 retrieval routing')` block with 5 tests |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/retrieval/orchestrator.ts` | `src/search/search-index.ts` | `import { buildIndex, search }` | WIRED | Line 1: `import { buildIndex, search } from '../search/search-index.js'` |
| `src/retrieval/orchestrator.ts` | `src/store/wiki-store.ts` | `store.listArticles()` + `store.getArticle()` | WIRED | Lines 24, 43: both store methods called in production path |
| `src/retrieval/wiki-answer.ts` | `src/llm/adapter.ts` | `generateText()` call | WIRED | Line 1: import; line 14: called with prompt and options |
| `src/config/config.ts` | `coverage_threshold` in DEFAULTS | `Config interface + DEFAULTS + validateConfig` | WIRED | Interface line 17; DEFAULTS line 28 (value `5.0`); validation lines 44-48 |
| `src/retrieval/article-filer.ts` | `src/llm/adapter.ts` | `generateText()` for Q&A-to-article conversion | WIRED | Line 5: import; line 179: called with filing prompt |
| `src/retrieval/article-filer.ts` | `src/synthesis/output-parser.ts` | `parseArticleOutput()` | WIRED | Line 6: import; lines 186, 197: called (initial + retry) |
| `src/retrieval/article-filer.ts` | `src/synthesis/deduplicator.ts` | `findExistingArticle()` for compound article dedup | WIRED | Line 7: import; line 206: called with parsed title |
| `src/retrieval/article-filer.ts` | `src/store/wiki-store.ts` | `store.saveArticle()` | WIRED | Line 214: `await store.saveArticle(article)` |
| `src/commands/ask.ts` | `src/retrieval/orchestrator.ts` | `assessCoverage()` call before web search | WIRED | Line 12: import; line 43: `assessCoverage(question, store, config.coverage_threshold)` |
| `src/commands/ask.ts` | `src/retrieval/wiki-answer.ts` | `generateWikiAnswer()` for wiki-sourced answers | WIRED | Line 13: import; line 51: `generateWikiAnswer(question, coverage.articles)` |
| `src/commands/ask.ts` | `src/retrieval/article-filer.ts` | `fileAnswerAsArticle()` for compound article filing | WIRED | Line 14: import; line 58: `fileAnswerAsArticle(question, answer, coverage.articles, store)` |
| `src/commands/ask.ts` | `readline` | `confirmFiling()` with `output: process.stderr` | WIRED | Line 1: `import * as readline`; lines 19-21: `readline.createInterface({ input: process.stdin, output: process.stderr })`; line 24: `rl.close()` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ask.ts` (wiki path) | `coverage` from `assessCoverage()` | BM25 search over `store.listArticles()` — real WikiStore articles from vault | Yes — reads live markdown files from disk | FLOWING |
| `ask.ts` (wiki path) | `answer` from `generateWikiAnswer()` | LLM call via `generateText()` with real article context built by `buildWikiAnswerPrompt()` | Yes — real LLM response (mocked in tests) | FLOWING |
| `ask.ts` (filing path) | `filed` from `fileAnswerAsArticle()` | `generateText` -> `parseArticleOutput` -> `buildCompoundArticle` -> `store.saveArticle` | Yes — real write to vault filesystem | FLOWING |
| `orchestrator.ts` | `contextArticles` | `store.getArticle()` per slug from search results | Yes — actual article content from WikiStore | FLOWING |

No hollow props or disconnected data sources found. All production code paths read from real sources (vault filesystem, LLM) and write real output. Static/empty returns in `orchestrator.ts` are early-return guard clauses, not stubs — they only fire when the wiki is genuinely empty or BM25 scores are below threshold.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Test suite passes | `npx vitest run` | 251/251 passed, 15 test files | PASS |
| Retrieval module exports present | `ls src/retrieval/` | `article-filer.ts`, `orchestrator.ts`, `prompt-builder.ts`, `wiki-answer.ts` | PASS |
| TypeScript compile (Phase 5 files) | Manual check (pre-existing errors in `adapter.ts` / `wiki-store.ts`) | No errors in any Phase 5 file (`ask.ts`, `orchestrator.ts`, `wiki-answer.ts`, `prompt-builder.ts`, `article-filer.ts`, `config.ts`) | PASS |

**Note on TypeScript:** `npx tsc --noEmit` exits with 2 errors, but both are pre-existing from before Phase 5:
- `src/llm/adapter.ts(30,7)` — Vercel AI SDK `LanguageModelV1` vs `LanguageModelV2` type mismatch (SDK version conflict)
- `src/store/wiki-store.ts(49,52)` — `Frontmatter` to `Record<string, unknown>` type assertion

Neither file was modified in Phase 5. Confirmed by checking that the same errors appear against the git state before Phase 5 commits.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RETR-01 | 05-01, 05-03 | User can query the existing wiki before the system searches the web | SATISFIED | `ask.ts` lines 41-68: wiki check runs before `createSearchProvider` call |
| RETR-02 | 05-01 | System uses local index (BM25) to find 3-5 relevant articles per query | SATISFIED | `orchestrator.ts`: `buildIndex` + `search` + `results.slice(0, 5)` — at most 5 |
| RETR-03 | 05-01, 05-03 | Orchestrator decides "answer from wiki" vs "search web" based on coverage confidence | SATISFIED | `assessCoverage()` returns `CoverageResult.covered`; `ask.ts` branches on it |
| LOOP-01 | 05-02 | Q&A answers against the wiki are filed back as new or updated articles | SATISFIED | `fileAnswerAsArticle()` converts answer via LLM and persists via `store.saveArticle()` |
| LOOP-02 | 05-02 | Compound articles are marked with `type: compound` in frontmatter | SATISFIED | `buildCompoundArticle()` line 99: `type: 'compound'`; test at retrieval-filer.test.ts line 153 |
| LOOP-03 | 05-03 | Feedback loop is gated — user can approve/skip filing answer back into wiki | SATISFIED | `confirmFiling()` readline prompt on stderr; `shouldFile` gate at `ask.ts` line 56 |

All 6 requirement IDs from plan frontmatter are satisfied. No orphaned requirements found — REQUIREMENTS.md maps RETR-01..03 and LOOP-01..03 to Phase 5, matching exactly what the plans claim.

---

### Anti-Patterns Found

No anti-patterns detected in Phase 5 files:

- No TODO/FIXME/PLACEHOLDER comments in any Phase 5 source file
- No stub returns (`return null`, `return []`, `return {}`) in production code paths — the two `return { covered: false, articles: [] }` instances in `orchestrator.ts` are legitimate guard clauses (empty wiki, below-threshold score), not stubs
- No hardcoded empty data flowing to rendering
- No handlers that only call `e.preventDefault()` without side effects
- All LLM calls pass real prompts assembled from live data
- `confirmFiling()` resolves to a real boolean from user input (not hardcoded)

---

### Human Verification Required

#### 1. Wiki-first routing with populated vault

**Test:** Add at least one article to the vault, then run `wiki ask "What is flash attention?"` without `--web`.
**Expected:** Stderr shows `Checking wiki for: "..."`, then either `[WIKI] Found N relevant article(s)...` or `[WEB] Wiki coverage insufficient...` depending on BM25 scores.
**Why human:** Requires a live vault, API keys, and terminal observation. BM25 threshold behaviour against real content can only be validated in a live environment.

#### 2. Empty-vault fallthrough

**Test:** Point vault to an empty directory, run `wiki ask "anything"`.
**Expected:** No crash; falls through to web search immediately.
**Why human:** Requires a real empty vault path configured in `~/.llm-wiki/config.json`.

#### 3. --web bypass end-to-end

**Test:** Run `wiki ask --web "some question"` on a populated vault.
**Expected:** No wiki check (`Checking wiki for:` should not appear on stderr); web search starts immediately.
**Why human:** Requires live environment; the unit test mocks `assessCoverage` to confirm it's not called, but UX-level observation needs a real CLI run.

#### 4. Filing confirmation flow

**Test:** After a wiki-sourced answer, type `y` at the `File this answer back into the wiki? [y/N]` prompt.
**Expected:** New `type: compound` article appears in vault with `wiki://slug` sources and valid YAML frontmatter. Repeat the same question — BM25 should now find the compound article.
**Why human:** Interactive stdin (readline) cannot be meaningfully tested in automated tests; compound article filesystem output needs vault inspection.

---

### Gaps Summary

No gaps found. All must-haves from all three plans are verified at levels 1-4 (exist, substantive, wired, data-flowing). The feedback loop is fully implemented:

1. **Coverage engine** (`orchestrator.ts`) — BM25 index built from real wiki articles, threshold-routed, capped at 5 articles.
2. **Wiki answer generator** (`wiki-answer.ts`) — LLM call with proper context, temperature 0.2, 2048 token cap.
3. **Prompt builder** (`prompt-builder.ts`) — formats articles with truncation at 3000 chars, instructs citation.
4. **Compound article filer** (`article-filer.ts`) — LLM conversion with retry, dedup via `findExistingArticle`, `type: compound`, `wiki://` sources, persisted via `store.saveArticle`.
5. **Ask command integration** (`ask.ts`) — wiki-first check before web, `--web` escape hatch, readline confirmation on stderr, filing on approval.
6. **Config** (`config.ts`) — `coverage_threshold: 5.0` default, validated, re-throw guarded.
7. **Tests** — 251/251 passing; Phase 5 adds retrieval.test.ts (284 lines), retrieval-filer.test.ts (421 lines), and 5 routing tests in cli.test.ts.

---

_Verified: 2026-04-04T22:50:00Z_
_Verifier: Claude (gsd-verifier)_

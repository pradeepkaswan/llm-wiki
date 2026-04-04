---
phase: 04-synthesis
verified: 2026-04-04T21:35:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 4: Synthesis Verification Report

**Phase Goal:** Raw sources become structured wiki articles in the Obsidian vault — with citations, backlinks to real articles, deduplication, and provenance frontmatter baked in before the feedback loop exists
**Verified:** 2026-04-04T21:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from 04-03 must_haves — the integration plan)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `wiki ask 'How does X work?'` produces a .md article in the vault's articles/ directory | VERIFIED | `src/commands/ask.ts` calls `synthesize(dir, store)` then `store.saveArticle(article)` via WikiStore; synthesis.test.ts T1 confirmed end-to-end |
| 2 | The article has a summary, structured ## sections, inline [N] citations, and a ## Sources section | VERIFIED | `parseArticleOutput` extracts body with `## sections`; synthesizer tests T2 assert `article.body` contains `[1]`, `## Sources`, and source link pattern |
| 3 | Every [[wikilink]] in the article points to an existing article — no hallucinated links | VERIFIED | `stripHallucinatedWikilinks()` wired inside both `buildNewArticle`/`buildUpdatedArticle`; synthesis T4 asserts `[[transformer-architecture]]` stripped when not in known slugs |
| 4 | Asking the same question a second time updates the existing article rather than creating a duplicate | VERIFIED | Three-tier dedup in `findExistingArticle()` — exact slug → BM25 → LLM tiebreak; synthesis T6 asserts `updatedSlugs.includes('flash-attention')` and merged sources |
| 5 | A broad question generates 2+ linked articles covering distinct sub-concepts | VERIFIED | `parsePlanOutput` supports `ARTICLE_COUNT: N`; synthesizer T5 asserts two articles produced with cross-links where article 2 contains `[[flash-attention]]` |
| 6 | Every article's YAML frontmatter includes sources (URL[]), sourced_at (ISO), type: 'web' | VERIFIED | `buildNewArticle` sets `sources`, `sourced_at: now`, `type: 'web'` programmatically; synthesis T3 asserts all three fields |
| 7 | Article title(s) are written to stdout on success (machine-readable for Phase 6) | VERIFIED | `ask.ts` line 137: `process.stdout.write(\`\${article.frontmatter.title}\n\`)` ; cli.test.ts "writes article title to stdout" asserts `stdoutSpy.toHaveBeenCalledWith('Flash Attention\n')` |
| 8 | All progress output goes to stderr | VERIFIED | Every `process.stderr.write(...)` in `ask.ts` and `synthesizer.ts`; cli.test.ts "writes synthesis progress messages to stderr" asserts both `'Synthesizing wiki article(s)'` and `'Done:'` messages |

**Score:** 8/8 truths verified

---

### Required Artifacts

All artifacts from Plans 01, 02, and 03 checked at Levels 1–3 (exists, substantive, wired).

#### Plan 01 Artifacts

| Artifact | Expected | Level 1 | Level 2 | Level 3 | Status |
|----------|----------|---------|---------|---------|--------|
| `src/llm/adapter.ts` | Extended generateText() with GenerateOptions | EXISTS | Exports `GenerateOptions`, `generateText`, `createProvider`; `system/temperature/maxOutputTokens` passed to SDK | Imported by synthesizer.ts, deduplicator.ts, tests | VERIFIED |
| `src/synthesis/types.ts` | Type contracts for synthesis pipeline | EXISTS | Exports `SynthesisInput`, `ArticlePlan`, `ParsedArticle`, `SourceRef`, `SynthesisResult` | Imported by prompt-builder, output-parser, article-builder, synthesizer, tests | VERIFIED |
| `src/synthesis/prompt-builder.ts` | Pure prompt-building functions | EXISTS | Exports `buildPlanPrompt`, `buildGeneratePrompt`, `buildUpdatePrompt`, `buildTiebreakPrompt`; `SOURCE_CONTENT_MAX_CHARS = 3000` | Imported by synthesizer.ts, deduplicator.ts | VERIFIED |
| `src/synthesis/output-parser.ts` | Pure output-parsing functions | EXISTS | Exports `parsePlanOutput`, `parseArticleOutput`, `parseTiebreakDecision`; `stripCodeFences()` handles code fences; returns `null` not throw on parse failure | Imported by synthesizer.ts, deduplicator.ts | VERIFIED |
| `tests/synthesis-parser.test.ts` | Parser unit tests | EXISTS | 36 tests covering plan parsing (single, multi, malformed, fenced), article parsing (well-formed, fenced, null cases), tiebreak, all four prompt-builders | Standalone; run via vitest | VERIFIED |

#### Plan 02 Artifacts

| Artifact | Expected | Level 1 | Level 2 | Level 3 | Status |
|----------|----------|---------|---------|---------|--------|
| `src/synthesis/deduplicator.ts` | Three-tier deduplication | EXISTS | Exports `findExistingArticle`, `BM25_DEDUP_THRESHOLD = 3.0`; tiers: slugify/getArticle → buildIndex/search → LLM tiebreak at `temperature: 0` | Imported by synthesizer.ts; calls wiki-store, search-index, adapter, prompt-builder, output-parser | VERIFIED |
| `src/synthesis/article-builder.ts` | Article assembly with provenance | EXISTS | Exports `buildNewArticle`, `buildUpdatedArticle`; `type: 'web'` hardcoded; source URL union via `new Set([...old,...new])`; `stripHallucinatedWikilinks` called inside both | Imported by synthesizer.ts; calls wikilink-sanitizer | VERIFIED |
| `src/synthesis/wikilink-sanitizer.ts` | Post-processing wikilink validation | EXISTS | Exports `stripHallucinatedWikilinks`; regex `/\[\[([^\]]+)\]\]/g`; handles `[[slug]]` and `[[slug\|display]]` | Imported by article-builder.ts (guaranteed, callers cannot bypass) | VERIFIED |
| `tests/synthesis-dedup.test.ts` | Deduplicator tests | EXISTS | 10 tests covering all three tiers, below-threshold early exit, empty wiki, BM25+LLM->update, BM25+LLM->new | Standalone; run via vitest | VERIFIED |
| `tests/synthesis-builder.test.ts` | Builder and sanitizer tests | EXISTS | 30 tests covering buildNewArticle (sources, timestamps, categories, slug), buildUpdatedArticle (source union, created_at preserved, updated_at refreshed), stripHallucinatedWikilinks (preserve valid, strip invalid, display-text format) | Standalone; run via vitest | VERIFIED |

#### Plan 03 Artifacts

| Artifact | Expected | Level 1 | Level 2 | Level 3 | Status |
|----------|----------|---------|---------|---------|--------|
| `src/synthesis/synthesizer.ts` | Pipeline orchestrator | EXISTS | Exports `synthesize(rawDir, store)`; full 5-step pipeline: load envelopes, list articles, plan, generate per-article, return SynthesisResult; retry logic on parse failure; batch dedup by slug; growing knownSlugsSet | Imported by ask.ts; calls all synthesis modules + wiki-store + adapter | VERIFIED |
| `src/commands/ask.ts` | Full ask pipeline | EXISTS | Imports `synthesize` and `WikiStore`; calls `synthesize(dir, store)` after `storeSourceEnvelopes`; writes titles to stdout; progress to stderr; no "Raw sources ready" placeholder | Root command; wired to index.ts | VERIFIED |
| `tests/synthesis.test.ts` | Integration tests for synthesize() | EXISTS | 11 tests with mocked LLM; covers T1–T11: single-article, citations (SYNTH-02), frontmatter (SYNTH-07), wikilink stripping (SYNTH-03), multi-article (SYNTH-04), dedup/update (SYNTH-05), retry D-03, error after retry, saveArticle called (SYNTH-06), batch dedup, all-excluded error | Standalone; run via vitest | VERIFIED |
| `tests/cli.test.ts` | Updated CLI tests | EXISTS | Added 3 new tests: pipeline wiring, stdout title D-17, stderr progress; existing "all-excluded exits 1" preserved; `class MockWikiStore` pattern for vitest compatibility | Run via vitest | VERIFIED |

---

### Key Link Verification

All key links from Plan 03 must_haves verified:

| From | To | Via | Status | Evidence |
|------|----|----|--------|----------|
| `synthesizer.ts` | `prompt-builder.ts` | `import { buildPlanPrompt, buildGeneratePrompt, buildUpdatePrompt }` | WIRED | Lines 8-12 of synthesizer.ts; all three functions called in pipeline |
| `synthesizer.ts` | `output-parser.ts` | `import { parsePlanOutput, parseArticleOutput }` | WIRED | Line 13 of synthesizer.ts; both called in pipeline |
| `synthesizer.ts` | `deduplicator.ts` | `import { findExistingArticle }` | WIRED | Line 14 of synthesizer.ts; called per plan in Step 4a |
| `synthesizer.ts` | `article-builder.ts` | `import { buildNewArticle, buildUpdatedArticle }` | WIRED | Line 15 of synthesizer.ts; conditional call at Step 4f |
| `synthesizer.ts` | `wiki-store.ts` | `store.saveArticle(article)` | WIRED | Line 144 of synthesizer.ts; called per article in Step 4g |
| `ask.ts` | `synthesizer.ts` | `import { synthesize } from '../synthesis/synthesizer.js'` | WIRED | Line 9 of ask.ts; called at line 133 after storeSourceEnvelopes |
| `ask.ts` | `stdout` | `process.stdout.write(title)` | WIRED | Line 137 of ask.ts; verifiable output for Phase 6 |

---

### Data-Flow Trace (Level 4)

Level 4 checks applied to `synthesizer.ts` (renders/saves dynamic data) and `ask.ts` (pipeline entry point):

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `synthesizer.ts` | `envelopes[]` | `fs.readFile(manifest.json)` + per-source JSON files | Real disk reads (tested with temp dir in synthesis.test.ts) | FLOWING |
| `synthesizer.ts` | `existingArticles[]` | `store.listArticles()` | Real WikiStore call (mocked in tests, real in production) | FLOWING |
| `synthesizer.ts` | `plans[]` | `generateText(buildPlanPrompt(...))` → `parsePlanOutput()` | Real LLM call → delimiter parsing | FLOWING |
| `synthesizer.ts` | `parsed` (ParsedArticle) | `generateText(build*Prompt(...))` → `parseArticleOutput()` | Real LLM call → delimiter parsing; retry on null | FLOWING |
| `synthesizer.ts` | `article` (Article) | `buildNewArticle` / `buildUpdatedArticle` | Programmatic assembly from `parsed` + metadata | FLOWING |
| `ask.ts` | `result.articles[]` | `synthesize(dir, store)` | Real synthesize call returns SynthesisResult | FLOWING |

No STATIC or DISCONNECTED data paths found.

---

### Behavioral Spot-Checks

Run against existing test infrastructure (no server required):

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (191 tests) | `npx vitest run` | 13 files, 191 passed, 0 failed | PASS |
| Synthesis parser tests | implicit in suite | 36 tests in synthesis-parser.test.ts — all pass | PASS |
| Dedup tests | implicit in suite | 10 tests in synthesis-dedup.test.ts — all pass | PASS |
| Builder tests | implicit in suite | 30 tests in synthesis-builder.test.ts — all pass | PASS |
| Synthesizer integration tests | implicit in suite | 11 tests in synthesis.test.ts — all pass | PASS |
| CLI integration tests | implicit in suite | 14 tests in cli.test.ts — all pass | PASS |

---

### Requirements Coverage

All SYNTH requirements declared across Plans 01, 02, 03 cross-referenced against REQUIREMENTS.md:

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SYNTH-01 | 01, 03 | LLM synthesizes 3-5 web sources into a structured wiki article | SATISFIED | synthesizer.ts loads non-excluded envelopes, passes to two-step LLM pipeline; synthesis T1 confirms 1 article from 3 sources |
| SYNTH-02 | 01, 03 | Every claim traceable to source URL via citations | SATISFIED | `buildGeneratePrompt` instructs inline `[N]` citations + `## Sources`; `parseSourceRefs` extracts them; synthesis T2 asserts `[1]` and `## Sources` in body |
| SYNTH-03 | 02, 03 | Articles include `[[wikilink]]` backlinks constrained to existing manifest | SATISFIED | `stripHallucinatedWikilinks` built into both builders; knownSlugsSet grows with batch; synthesis T4 confirms hallucinated links stripped |
| SYNTH-04 | 01, 03 | Broad questions generate multiple linked articles (topic clustering) | SATISFIED | `parsePlanOutput` supports ARTICLE_COUNT: N; batch grows knownSlugsSet for cross-links; synthesis T5 confirms 2 articles with inter-article wikilink |
| SYNTH-05 | 02, 03 | LLM decides create new or update existing (deduplication) | SATISFIED | Three-tier dedup: exact slug → BM25 → LLM tiebreak; synthesis T6 confirms updated article with merged sources |
| SYNTH-06 | 02, 03 | YAML frontmatter validated after every LLM write | SATISFIED | `store.saveArticle(article)` called for every article; WikiStore.saveArticle validates frontmatter per Phase 1 implementation; synthesis T9 spies on saveArticle |
| SYNTH-07 | 01, 03 | Articles include provenance tracking (`sources`, `sourced_at`, `type: web\|compound`) | SATISFIED | `buildNewArticle` sets all three programmatically; synthesis T3 asserts `sources` is non-empty URL array, `sourced_at` matches ISO regex, `type === 'web'` |

All 7 SYNTH requirements satisfied. No orphaned requirements — REQUIREMENTS.md Traceability table maps all SYNTH-01 through SYNTH-07 to Phase 4 with status Complete.

---

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `output-parser.ts:183` | `return null` | Checked | Intentional documented API: `parseArticleOutput` returns null on parse failure; synthesizer handles it with retry — not a stub |
| `deduplicator.ts:48,52,56` | `return null` | Checked | Intentional early-return guards in three-tier dedup — not stubs |

No blocking anti-patterns found. No TODO/FIXME/placeholder comments. The old `'Raw sources ready for synthesis'` placeholder was confirmed removed from `ask.ts`.

---

### Human Verification Required

The following behaviors require real LLM calls and cannot be verified programmatically:

#### 1. End-to-End Article Quality

**Test:** Run `wiki ask "How does flash attention work?"` with a real Exa API key and Claude API key configured
**Expected:** A well-structured `.md` file appears in vault at `articles/flash-attention.md` with a YAML frontmatter block containing `sources`, `sourced_at`, and `type: web`; inline `[N]` citations in body; a `## Sources` section at the end
**Why human:** Requires live API credentials and evaluating LLM output quality, not just structure

#### 2. Deduplication with Real LLM Tiebreak

**Test:** Ask two related questions: first `"How does flash attention work?"`, then `"What is Flash Attention and how does it reduce memory usage?"`
**Expected:** Second ask updates the existing `flash-attention.md` article (merged sources, updated summary) rather than creating a second file
**Why human:** BM25 threshold tuning and LLM tiebreak behavior depend on real article corpus and LLM response

#### 3. Multi-Article Generation for Broad Question

**Test:** Run `wiki ask "How do transformers work and what makes them efficient?"` 
**Expected:** Two or more articles generated (e.g., "Transformer Architecture" and "Attention Mechanisms" or "Flash Attention"), with `[[wikilink]]` cross-references between them
**Why human:** LLM planning step determines whether question triggers ARTICLE_COUNT > 1; requires real LLM

#### 4. Obsidian Vault Compatibility

**Test:** Open the generated articles in Obsidian and verify: wikilinks resolve correctly, frontmatter is displayed in properties pane, `[[wikilink]]` backlinks are clickable
**Expected:** All generated articles appear as valid Obsidian notes with working internal links
**Why human:** Obsidian rendering behavior cannot be tested programmatically

---

### Gaps Summary

None. All 8 observable truths are VERIFIED. All 14 artifacts pass Level 1 (exists), Level 2 (substantive), and Level 3 (wired). All 7 key links are confirmed wired. All 7 SYNTH requirements are SATISFIED. 191 tests pass across 13 test files.

---

_Verified: 2026-04-04T21:35:00Z_
_Verifier: Claude (gsd-verifier)_

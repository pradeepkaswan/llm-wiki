# Phase 9: Lint + Heal - Research

**Researched:** 2026-04-04
**Domain:** Wiki health analysis, structural lint, LLM-based contradiction detection, auto-repair workflows
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Lint Engine Architecture**
- D-01: The lint engine is a standalone module (`src/lint/linter.ts`) that reads all articles via `WikiStore.listArticles()` and performs check-by-check analysis. Structural checks are purely local (no LLM); contradiction detection uses a single LLM call.
- D-02: Lint check categories: `orphan`, `stale`, `missing-concept`, `missing-cross-ref`, `contradiction`.
- D-03: Orphan detection builds a reverse-link map from all article bodies using `WIKILINK_RE`. index.md and schema.md are excluded.
- D-04: Staleness check reuses `isArticleStale()` from ask.ts and `freshness_days` from config.
- D-05: Missing concepts: extract all `[[wikilinks]]` from all articles, compare against known article slugs.
- D-06: Missing cross-references: for each article, BM25 search with its title. High-scoring matches not already linked are flagged.
- D-07: Contradiction detection: batch article summaries to LLM. One call for the entire wiki (or chunked for large wikis).

**Lint Finding Data Model**
- D-08: Each finding: `{ category, severity, affected: string[], suggestedFix: string }`. Severity defaults: contradiction → error; orphan/stale → warning; missing-concept/missing-cross-ref → info.
- D-09: `wiki lint` outputs JSON array to stdout, human-readable summary to stderr.
- D-10: `LintReport` type wraps findings with metadata: total counts per category, wiki health score.

**Heal Command**
- D-11: `wiki heal` runs lint internally (lint-then-fix single pass), not from a pre-computed findings file.
- D-12: Heal routing by category:
  - `missing-concept`: Create stub article via LLM using synthesis pipeline
  - `missing-cross-ref`: Add cross-reference via `upsertSeeAlsoEntry()`
  - `stale`: Re-fetch via `--refresh` code path
  - `orphan`: Add backlinks from BM25 top match via `upsertSeeAlsoEntry()`
  - `contradiction`: Output to stderr for human review — NOT auto-fixed
- D-13: Heal writes exclusively through `WikiStore.saveArticle()`, which auto-logs via `appendLog()`.
- D-14: Heal runs ripple updates and backlink enforcement after each article modification.

**CLI Integration**
- D-15: `wiki lint` and `wiki heal` are new Commander subcommands registered in index.ts.
- D-16: `wiki lint` accepts optional `--category <type>` flag to filter checks.
- D-17: `wiki heal` accepts optional `--dry-run` flag.
- D-18: Both commands read the schema and pass it to LLM calls.

### Claude's Discretion
- BM25 threshold for missing cross-reference detection
- LLM prompt wording for contradiction detection
- Whether to add a wiki health score to index.md
- Exact stub article template for missing concepts
- Test structure and mocking approach

### Deferred Ideas (OUT OF SCOPE)
- Scheduled/automatic lint on a cron
- Lint results persisted to a findings.json for historical tracking
- Custom lint rules defined in schema.md
- Quality scoring of individual articles (beyond binary pass/fail)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LINT-01 | `wiki lint` scans for contradictions, orphan pages, missing cross-references, stale claims, and concepts mentioned but lacking their own page | All 5 check types mapped to concrete algorithms using existing BM25 + WIKILINK_RE + isArticleStale() infrastructure |
| LINT-02 | Lint results are structured and actionable — each finding has a category, severity, affected articles, and suggested fix | LintFinding/LintReport type design established; stdout/stderr split follows existing conventions |
| LINT-03 | `wiki heal` auto-fixes findings: creates missing pages, adds missing cross-references, flags contradictions, updates stale content via --refresh | Heal routing per D-12 maps directly to existing upsertSeeAlsoEntry(), isArticleStale(), synthesize(), rippleUpdates(), enforceBacklinks() |
</phase_requirements>

---

## Summary

Phase 9 adds `wiki lint` and `wiki heal` as new Commander subcommands. The lint engine is a new module (`src/lint/linter.ts`) that performs five distinct checks: orphan detection (reverse-link map), staleness (reusing `isArticleStale()`), missing concept stubs (wikilink-to-slug comparison), missing cross-references (BM25 search), and contradiction detection (single LLM call over article summaries). All structural checks are local-only — no network or LLM cost. Only contradiction detection uses the LLM.

The heal engine (`src/lint/healer.ts`) routes each finding category to the appropriate repair function. Three categories are auto-fixable using existing infrastructure: missing-concept stubs are created via the LLM synthesis pipeline, missing cross-references and orphan backlinks are repaired using `upsertSeeAlsoEntry()`, and stale articles are refreshed via the existing `--refresh` code path. Contradictions are surfaced to stderr only — no auto-fix. After each repair, the standard post-write pipeline (ripple + backlink enforcement) runs.

The phase is essentially "wiring existing capabilities into a diagnostic+repair command" rather than building new algorithms from scratch. The biggest implementation risks are: (1) keeping the `--dry-run` simulation accurate (must predict what would change without mutating state), (2) avoiding index rebuild cascades when heal sequentially saves many articles, and (3) writing an LLM prompt for contradiction detection that reliably identifies semantic conflicts at batch scale.

**Primary recommendation:** Build linter.ts as pure data-in/data-out (takes articles array, returns LintReport) for testability. Build healer.ts as a thin router that calls existing utilities. Keep the LLM out of all structural checks.

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `minisearch` | 7.2.0 | BM25 for missing-cross-ref detection | Already used in search-index.ts; same buildIndex()/search() API [VERIFIED: package.json] |
| `ai` (Vercel AI SDK) | ^6.0.146 | generateText() for contradiction detection | Already wired in adapter.ts; one call covers entire wiki [VERIFIED: package.json] |
| `gray-matter` | 4.0.3 | Frontmatter parsing for article reads | Already used in wiki-store.ts [VERIFIED: package.json] |
| `commander` | 14.0.3 | CLI subcommand registration | Already used for all existing commands [VERIFIED: package.json] |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `slugify` | 1.6.9 | Stub article slug generation | When creating missing-concept stubs |

### No New Dependencies Required

Phase 9 requires zero new npm packages. All algorithms use existing installed libraries. [VERIFIED: package.json analysis]

**Installation:** No new installs needed.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lint/
│   ├── linter.ts          # Pure check engine: Article[] → LintReport
│   └── healer.ts          # Repair router: LintFinding[] + WikiStore → void
├── commands/
│   ├── lint.ts            # Commander command: loads config, calls linter, outputs
│   └── heal.ts            # Commander command: loads config, calls linter+healer
└── index.ts               # Add lintCommand + healCommand
```

### Pattern 1: Pure Linter Function (Testability First)

**What:** `linter.ts` exports a single `runLint(articles, config)` function that takes the article array and config as arguments — no direct WikiStore reads. Callers (lint.ts, heal.ts) call `store.listArticles()` first, then pass the result.

**When to use:** Always. Injecting the article array makes every check independently testable without filesystem access.

**Example:**
```typescript
// src/lint/linter.ts
export interface LintFinding {
  category: 'orphan' | 'stale' | 'missing-concept' | 'missing-cross-ref' | 'contradiction';
  severity: 'error' | 'warning' | 'info';
  affected: string[];          // slugs
  suggestedFix: string;
}

export interface LintReport {
  findings: LintFinding[];
  counts: Record<LintFinding['category'], number>;
  healthScore: number;          // percentage of articles with no findings
  articleCount: number;
}

export async function runLint(
  articles: Article[],
  config: Config,
  options?: { categories?: LintFinding['category'][] }
): Promise<LintReport> {
  // ...
}
```

### Pattern 2: Reverse-Link Map for Orphan Detection (D-03)

**What:** Build a `Map<slug, Set<referencingSlug>>` by scanning every article body with WIKILINK_RE. Articles with empty incoming sets (excluding index.md and schema.md) are orphans.

**When to use:** Structural orphan check — no LLM needed.

**Example:**
```typescript
// Source: WIKILINK_RE from backlink-enforcer.ts (already in codebase)
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function buildReverseLinks(articles: Article[]): Map<string, Set<string>> {
  const inbound = new Map<string, Set<string>>();
  // Initialize all known slugs
  for (const a of articles) inbound.set(a.slug, new Set());

  for (const source of articles) {
    const re = new RegExp(WIKILINK_RE.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(source.body)) !== null) {
      const target = match[1]!.trim();
      if (inbound.has(target)) {
        inbound.get(target)!.add(source.slug);
      }
    }
  }
  return inbound;
}
```

### Pattern 3: BM25 Cross-Reference Check (D-06)

**What:** For each article, query `buildIndex(articles)` with the article's title. Results above threshold that are not already in the article's body wikilinks and not in the See Also section are missing cross-references.

**When to use:** Missing cross-reference check — local BM25 only, no LLM.

**Key insight:** The BM25 index must exclude the article being tested from its own results (same exclusion pattern as in ripple.ts).

```typescript
// Pattern from ripple.ts — proven working
const results = search(index, article.frontmatter.title);
const alreadyLinked = extractWikilinks(article.body);
const missing = results
  .filter(r => r.slug !== article.slug)
  .filter(r => r.score >= CROSS_REF_THRESHOLD)
  .filter(r => !alreadyLinked.has(r.slug));
```

**BM25 threshold guidance (Claude's Discretion):** Start at `5.0` (same as coverage_threshold default). This is higher than the ripple threshold (3.0) to reduce false positives in cross-ref suggestions.

### Pattern 4: Contradiction Detection via Single LLM Call (D-07)

**What:** Batch article titles + summaries into a single prompt. Ask LLM to return JSON array of conflicting pairs with explanation.

**When to use:** Contradiction check only. Keep structural checks entirely free of LLM calls.

**Example prompt pattern (Claude's Discretion for exact wording):**
```typescript
const articleList = articles
  .map(a => `- "${a.frontmatter.title}" (${a.slug}): ${a.frontmatter.summary}`)
  .join('\n');

const prompt = `Review these wiki article summaries and identify any contradictions 
between them — claims that cannot both be true.

Articles:
${articleList}

Return ONLY a JSON array. Each element:
{ "slugA": "<slug>", "slugB": "<slug>", "conflict": "<one-sentence description>" }

If no contradictions found, return an empty array: []`;
```

**Chunking for large wikis:** For wikis > 50 articles, batch in groups of 20-30 and merge results. This prevents context overflow. [ASSUMED — threshold is a reasonable heuristic, not empirically validated]

### Pattern 5: Heal Dry-Run Implementation

**What:** `--dry-run` mode runs the full lint + heal routing logic but replaces `store.saveArticle()` with a no-op. The heal output still describes what would happen.

**Implementation approach:**
- Inject a `dryRun: boolean` parameter into healer functions
- In dry-run mode, log the would-be action to stderr but skip the `saveArticle()` call
- This mirrors the existing pattern used in file.ts where each decision is logged before execution

**Key constraint:** Dry-run must not call `rippleUpdates()` or `enforceBacklinks()` since these write articles. Skip them entirely in dry-run mode.

### Pattern 6: Stub Article Creation for Missing Concepts (D-12)

**What:** When healing a `missing-concept` finding, create a minimal stub article using `generateText()` with a structured prompt, then save via `WikiStore.saveArticle()`.

**Stub article template (Claude's Discretion for exact wording):**
```typescript
const stubPrompt = `Create a minimal wiki stub article for the concept: "${conceptTitle}".

This concept is referenced in: ${referencingArticles.join(', ')}.

Return in the standard format:
TITLE: ${conceptTitle}
SUMMARY: [one sentence describing what this concept is]
CATEGORIES: [relevant categories]
BODY:
## Overview
[2-3 sentences describing this concept]

> This article was auto-generated by wiki heal. Expand it by running: wiki ask "${conceptTitle}"

## See Also
${referencingArticles.map(slug => `- [[${slug}]]`).join('\n')}`;
```

### Anti-Patterns to Avoid

- **Parallel article saves in healer:** Always process findings sequentially (for loop, not Promise.all). WikiStore.saveArticle() triggers index rebuild — parallel calls cause races. [VERIFIED: established pattern from ask.ts, file.ts, ripple.ts]
- **Calling enforceBacklinks() from inside linter.ts:** Linter must be pure (read-only). All mutations belong in healer.ts.
- **Re-running lint after every heal step:** Run lint once, collect all findings, then heal them in a single pass. Re-linting mid-heal creates cascading updates and unpredictable behavior.
- **Using WIKILINK_RE with the shared stateful version:** Always create a fresh `new RegExp(WIKILINK_RE.source, 'g')` per scan. [VERIFIED: backlink-enforcer.ts pattern — regex `g` flag is stateful]
- **Including index.md or schema.md in lint scope:** `store.listArticles()` already excludes index.md (filters `!== 'index.md'`). schema.md lives at vault root, not in articles/. Both are naturally excluded. [VERIFIED: wiki-store.ts line 91]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wikilink extraction | Custom regex | `WIKILINK_RE` from backlink-enforcer.ts | Already handles `[[slug]]` and `[[slug\|display]]` formats, battle-tested with 7 tests |
| BM25 similarity | TF-IDF from scratch | `buildIndex()` + `search()` from search-index.ts | MiniSearch already configured with boost settings, prefix matching, fuzzy |
| Article staleness | Date arithmetic | `isArticleStale()` from ask.ts | Already handles null sourced_at edge case |
| See Also insertion | String manipulation | `upsertSeeAlsoEntry()` from see-also.ts | Already handles idempotency, inserts before Sources, handles missing section |
| Stub article save | Direct fs.writeFile | `WikiStore.saveArticle()` | Atomic write, frontmatter validation, auto-log, auto-index rebuild |
| Post-heal propagation | Custom link traversal | `rippleUpdates()` + `enforceBacklinks()` | Phase 8 infrastructure handles this completely |
| JSON parse from LLM | Regex extraction | Strip code fences + JSON.parse in try/catch | Established pattern in ripple.ts, file.ts — handles `\`\`\`json` wrapping |

**Key insight:** Phase 9 is primarily an integration phase. The algorithms all exist; the work is wiring them into new entry points with clean type definitions.

---

## Common Pitfalls

### Pitfall 1: WIKILINK_RE Global Flag Reuse
**What goes wrong:** Using a module-level `const WIKILINK_RE = /.../g` and calling `.exec()` in a loop. The `g` flag makes regex stateful — `lastIndex` persists between calls, causing skipped matches on second use.
**Why it happens:** backlink-enforcer.ts exports `WIKILINK_RE` as a constant; importing and reusing it directly in a loop corrupts state.
**How to avoid:** Always create a fresh regex: `const re = new RegExp(WIKILINK_RE.source, 'g')` before each scan loop.
**Warning signs:** Orphan detection or missing-concept detection finds fewer issues on second call than first.

### Pitfall 2: Index Rebuild Cascade During Heal
**What goes wrong:** Healing 20 findings calls `saveArticle()` 20 times, each triggering `rebuildIndex()`. On a 200-article wiki, this is 20 full directory reads + 20 index.md writes sequentially.
**Why it happens:** WikiStore.saveArticle() always calls rebuildIndex() (Phase 1 invariant).
**How to avoid:** This is acceptable for a personal wiki at this scale (< 1000 articles). The existing pattern (sequential, not parallel) prevents corruption. If it becomes slow, document as a known performance characteristic — do NOT work around WikiStore's invariants.
**Warning signs:** `wiki heal` takes > 30 seconds on large wikis.

### Pitfall 3: Heal Changes Invalidate Remaining Findings
**What goes wrong:** Lint produces 10 findings. After healing finding #3 (adds a cross-ref), the cross-ref finding for #7 is now stale (that cross-ref was added). The heal for #7 writes a duplicate entry.
**Why it happens:** Lint snapshot is taken once; heal changes the wiki state.
**How to avoid:** `upsertSeeAlsoEntry()` is idempotent — it will detect the duplicate slug and return body unchanged without writing. WikiStore.saveArticle() will still be called but the body will be identical. Net effect: harmless redundant write. [VERIFIED: upsertSeeAlsoEntry() idempotency confirmed in ripple.test.ts]

### Pitfall 4: Missing Concept Stubs for Wikilinks That Are Slugs, Not Titles
**What goes wrong:** An article body contains `[[machine-learning]]` (slug format). The missing-concept healer creates a stub with title "Machine-Learning" instead of "Machine Learning".
**Why it happens:** Slugs use hyphens; titles use spaces. The linter extracts slugs from wikilinks, not titles.
**How to avoid:** When creating stubs, convert the slug to a display title: replace hyphens with spaces and title-case. Use `slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')`.

### Pitfall 5: Contradiction LLM Call Fails on Empty Wiki
**What goes wrong:** `runLint()` called on a wiki with 0 or 1 articles. LLM call for contradiction detection is unnecessary and may behave oddly with empty input.
**Why it happens:** No guard on minimum article count before making LLM call.
**How to avoid:** Guard: if `articles.length < 2`, skip contradiction detection entirely and return empty array for that category. [ASSUMED — reasonable defensive programming practice]

### Pitfall 6: --dry-run Running Ripple/Backlink Steps
**What goes wrong:** `wiki heal --dry-run` reports what it would fix but actually calls rippleUpdates() which writes to disk.
**Why it happens:** Dry-run guards only on the primary saveArticle() call, forgetting the post-heal pipeline.
**How to avoid:** The `dryRun` flag must gate the ENTIRE mutation sequence: saveArticle + rippleUpdates + enforceBacklinks. Skip all three in dry-run mode.

---

## Code Examples

Verified patterns from the existing codebase:

### Wikilink Extraction (Safe Re-Entry Pattern)
```typescript
// Source: src/synthesis/backlink-enforcer.ts — battle-tested with 7 tests
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function extractWikilinks(body: string): Set<string> {
  const slugs = new Set<string>();
  const re = new RegExp(WIKILINK_RE.source, 'g'); // fresh instance each time
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const slug = match[1]!.trim();
    if (slug) slugs.add(slug);
  }
  return slugs;
}
```

### BM25 Search for Cross-Reference Finding
```typescript
// Source: src/synthesis/ripple.ts — proven pattern with threshold filtering
import { buildIndex, search } from '../search/search-index.js';

const index = buildIndex(articles);
const results = search(index, article.frontmatter.title);
const related = results.filter(r =>
  r.slug !== article.slug &&
  r.score >= CROSS_REF_THRESHOLD
);
```

### MockWikiStore for Tests
```typescript
// Source: tests/backlink-enforcer.test.ts — standard test pattern in this project
class MockWikiStore {
  private articles = new Map<string, Article>();
  async saveArticle(article: Article, _op?: 'create' | 'update'): Promise<string> {
    this.articles.set(article.slug, article);
    return `/tmp/vault/articles/${article.slug}.md`;
  }
  async listArticles(): Promise<Article[]> { return Array.from(this.articles.values()); }
  async getArticle(slug: string): Promise<Article | null> { return this.articles.get(slug) ?? null; }
  async readSchema(): Promise<string | null> { return null; }
  async updateSchema(_c: string): Promise<void> {}
  async appendLog(_op: string, _desc: string): Promise<void> {}
  seedArticle(article: Article): void { this.articles.set(article.slug, article); }
}
```

### LLM Response Parsing (Strip Code Fences + JSON.parse)
```typescript
// Source: src/synthesis/ripple.ts — established project pattern
const cleaned = rawResponse
  .replace(/^```json?\n?/i, '')
  .replace(/\n?```$/, '')
  .trim();
let parsed: unknown;
try {
  parsed = JSON.parse(cleaned);
} catch {
  process.stderr.write('[lint] Failed to parse LLM response — skipping\n');
  return [];
}
if (!Array.isArray(parsed)) {
  process.stderr.write('[lint] LLM response was not an array — skipping\n');
  return [];
}
```

### isArticleStale() Reuse (D-04)
```typescript
// Source: src/commands/ask.ts — export confirmed in codebase
import { isArticleStale } from '../commands/ask.js';
// freshness_days from config (already has default of 30)
const stale = isArticleStale(article, config.freshness_days ?? 30);
```

### Sequential Heal Loop (Avoid Parallel Writes)
```typescript
// Source: established pattern from ask.ts, file.ts, ripple.ts
for (const finding of findings) {
  try {
    await healFinding(finding, store, config, schema, dryRun);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[heal] Warning: ${finding.affected[0]} — ${msg}\n`);
    // Continue processing remaining findings
  }
}
```

---

## Existing Code Inventory (Phase 9 Reads/Reuses)

All files verified to exist in codebase: [VERIFIED: Glob src/**/*.ts]

| File | What Phase 9 Uses |
|------|-------------------|
| `src/synthesis/backlink-enforcer.ts` | WIKILINK_RE regex constant, `enforceBacklinks()` |
| `src/synthesis/see-also.ts` | `upsertSeeAlsoEntry()` for orphan + cross-ref fixes |
| `src/synthesis/ripple.ts` | `rippleUpdates()` for post-heal propagation |
| `src/commands/ask.ts` | `isArticleStale()` export for staleness check |
| `src/search/search-index.ts` | `buildIndex()` + `search()` for cross-ref detection |
| `src/config/config.ts` | `Config` type, `freshness_days`, `loadConfig()` |
| `src/llm/adapter.ts` | `generateText()` for contradiction detection + stub creation |
| `src/store/wiki-store.ts` | `WikiStore.listArticles()`, `saveArticle()`, `appendLog()` |
| `src/index.ts` | Commander program — add lintCommand + healCommand |
| `src/types/article.ts` | `Article`, `Frontmatter` types |

**New files to create:**
- `src/lint/linter.ts` — LintFinding, LintReport types + runLint()
- `src/lint/healer.ts` — healFindings() router
- `src/commands/lint.ts` — Commander lint subcommand
- `src/commands/heal.ts` — Commander heal subcommand

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wiki health maintained manually | Automated lint+heal commands | Phase 9 | Users no longer need to audit article links manually |
| Single-article writes | All writes through WikiStore.saveArticle() | Phase 1 | Lint/heal inherits atomic writes + auto-logging automatically |
| LLM called per-article for similarity | BM25 for structural checks + single LLM batch for semantics | Phase 9 design | Keeps structural lint O(n) local cost, contradiction check O(1) LLM cost |

**Deprecated/outdated:**
- Nothing — Phase 9 extends, does not replace existing patterns.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | BM25 cross-reference threshold of 5.0 is reasonable starting point | Architecture Patterns (Pattern 3) | Too high: misses real cross-refs. Too low: false positive noise. Tunable post-release. |
| A2 | Batching 20-30 articles per contradiction detection call prevents context overflow | Architecture Patterns (Pattern 4) | With very long summaries, even 20 might overflow. But context_threshold scales with actual summary lengths — tunable. |
| A3 | Less than 2 articles should skip contradiction detection entirely | Common Pitfalls (Pitfall 5) | Edge case. Correct behavior regardless. |
| A4 | Dry-run should suppress rippleUpdates() + enforceBacklinks(), not just saveArticle() | Architecture Patterns (Pattern 5) | If wrong, dry-run will mutate related articles while previewing — breaks user trust in the flag. HIGH RISK if wrong. |

---

## Open Questions

1. **Should `wiki lint --category contradiction` skip structural checks entirely?**
   - What we know: D-16 says `--category` filters to specific check type.
   - What's unclear: If user passes `--category contradiction`, should orphan/stale/etc. checks still run (just not be output), or be skipped for speed?
   - Recommendation: Skip non-requested checks entirely — contradiction is LLM-only so there's no cost benefit to running structural checks when they won't be shown.

2. **Should `wiki heal` log its invocation to log.md before or after fixes?**
   - What we know: D-13 says both lint and heal log their invocation. D-11 in Phase 7 established `lint` and `heal` as valid log operations.
   - What's unclear: Log at invocation start (before any fixes) or at completion (after all fixes)?
   - Recommendation: Log at invocation start (operation: `heal`, description: `Heal run started`) and add individual fix logs via `saveArticle()` auto-logging. This mirrors the `wiki ask` pattern.

3. **What is the exact BM25 threshold for missing cross-references?**
   - What we know: ripple.ts uses 3.0; coverage_threshold defaults to 5.0.
   - What's unclear: Cross-ref lint is more conservative than ripple (we want fewer false positives in lint output).
   - Recommendation: Start at 5.0, expose as `lint_cross_ref_threshold` config field (Claude's Discretion area).

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — Phase 9 is purely code changes using already-installed npm packages and existing config infrastructure).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | vitest.config.ts (inferred from package.json test script) |
| Quick run command | `npx vitest run tests/lint*.test.ts tests/heal*.test.ts` |
| Full suite command | `npm test` |

**Current test suite health:** 341 tests passing across 20 files. [VERIFIED: npm test output 2026-04-04]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LINT-01 | runLint() returns findings for orphan articles | unit | `npx vitest run tests/linter.test.ts -t "orphan"` | Wave 0 |
| LINT-01 | runLint() returns findings for stale articles | unit | `npx vitest run tests/linter.test.ts -t "stale"` | Wave 0 |
| LINT-01 | runLint() returns findings for missing-concept | unit | `npx vitest run tests/linter.test.ts -t "missing-concept"` | Wave 0 |
| LINT-01 | runLint() returns findings for missing-cross-ref | unit | `npx vitest run tests/linter.test.ts -t "cross-ref"` | Wave 0 |
| LINT-01 | runLint() calls generateText() once for contradiction detection | unit | `npx vitest run tests/linter.test.ts -t "contradiction"` | Wave 0 |
| LINT-02 | Each finding has category, severity, affected[], suggestedFix | unit | `npx vitest run tests/linter.test.ts -t "LintFinding"` | Wave 0 |
| LINT-02 | LintReport has counts per category and healthScore | unit | `npx vitest run tests/linter.test.ts -t "LintReport"` | Wave 0 |
| LINT-02 | wiki lint outputs JSON to stdout, summary to stderr | unit | `npx vitest run tests/lint-command.test.ts` | Wave 0 |
| LINT-03 | heal routes missing-concept to stub article creation | unit | `npx vitest run tests/healer.test.ts -t "missing-concept"` | Wave 0 |
| LINT-03 | heal routes missing-cross-ref to upsertSeeAlsoEntry | unit | `npx vitest run tests/healer.test.ts -t "cross-ref"` | Wave 0 |
| LINT-03 | heal routes orphan to upsertSeeAlsoEntry on top BM25 match | unit | `npx vitest run tests/healer.test.ts -t "orphan"` | Wave 0 |
| LINT-03 | heal routes contradiction to stderr only (no auto-fix) | unit | `npx vitest run tests/healer.test.ts -t "contradiction"` | Wave 0 |
| LINT-03 | heal --dry-run logs actions but calls no saveArticle() | unit | `npx vitest run tests/healer.test.ts -t "dry-run"` | Wave 0 |
| LINT-03 | heal appends to log.md via appendLog() | unit | `npx vitest run tests/healer.test.ts -t "log"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/linter.test.ts tests/healer.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (341+ tests) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/linter.test.ts` — covers all 5 LINT-01 check types + LINT-02 data model
- [ ] `tests/healer.test.ts` — covers all 5 LINT-03 heal routing paths + dry-run
- [ ] `tests/lint-command.test.ts` — covers stdout/stderr convention for `wiki lint`
- [ ] `tests/heal-command.test.ts` — covers stdout/stderr convention for `wiki heal`

*(No framework install needed — vitest 4.1.2 already installed and working)*

---

## Security Domain

Phase 9 has no new authentication, session management, external API calls, or user input beyond CLI flags. The LLM call for contradiction detection uses the same `generateText()` adapter as all other phases. No new security surface area is introduced.

Applicable ASVS: V5 Input Validation — the `--category` flag value is validated against the known enum of 5 category types. Invalid values should exit with a clear error, not panic.

---

## Sources

### Primary (HIGH confidence)
- `src/synthesis/backlink-enforcer.ts` — WIKILINK_RE pattern, VERIFIED in codebase
- `src/synthesis/see-also.ts` — upsertSeeAlsoEntry() API, VERIFIED in codebase
- `src/synthesis/ripple.ts` — BM25 threshold (3.0), sequential write pattern, VERIFIED in codebase
- `src/commands/ask.ts` — isArticleStale() export, VERIFIED in codebase
- `src/search/search-index.ts` — buildIndex()/search() API, VERIFIED in codebase
- `src/store/wiki-store.ts` — WikiStore API, appendLog(), saveArticle(), VERIFIED in codebase
- `src/config/config.ts` — Config interface, DEFAULTS, freshness_days, VERIFIED in codebase
- `tests/backlink-enforcer.test.ts` — MockWikiStore pattern, VERIFIED in codebase
- `tests/ripple.test.ts` — LLM mock pattern (vi.mock), sequential write assertions, VERIFIED in codebase
- `package.json` — installed versions, no new packages needed, VERIFIED in codebase

### Secondary (MEDIUM confidence)
- `.planning/phases/09-lint-heal/09-CONTEXT.md` — All implementation decisions (D-01 through D-18), CITED from context file

### Tertiary (LOW confidence, flagged in Assumptions Log)
- BM25 threshold of 5.0 for cross-ref detection — [ASSUMED] reasonable starting point based on existing thresholds
- Chunking at 20-30 articles for contradiction detection — [ASSUMED] conservative estimate for LLM context limits

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages verified in package.json; no new installs needed
- Architecture: HIGH — patterns directly verified from existing phase implementations
- Pitfalls: HIGH — derived from reading actual codebase (regex stateful flag, sequential writes, upsertSeeAlsoEntry idempotency)
- BM25 threshold: LOW — assumed heuristic, user should tune after first run

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable codebase, no fast-moving dependencies)

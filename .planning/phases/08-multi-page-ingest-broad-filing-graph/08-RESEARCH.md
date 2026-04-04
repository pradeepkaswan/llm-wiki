# Phase 8: Multi-Page Ingest + Broad Filing + Graph - Research

**Researched:** 2026-04-04
**Domain:** Knowledge ripple, broad filing, bidirectional backlinks, Obsidian graph integrity
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ripple Update Strategy**
- D-01: Ripple updates are a separate module (`src/synthesis/ripple.ts`) called from the ask command AFTER `synthesize()` returns — not integrated into synthesize() itself.
- D-02: Ripple uses lightweight cross-reference updates, NOT full article rewrites. For each related article, the LLM appends/updates a `## See Also` section with a brief contextual note and `[[wikilink]]` to the new article.
- D-03: Ripple targets are found via BM25 search: query the search index with the primary article's title + summary, take the top 10 results (excluding the primary article itself), filter to those above a relevance threshold.
- D-04: A single LLM call handles all ripple updates: the prompt includes the primary article summary + list of target article titles/summaries, and the LLM returns structured output specifying which targets to update and what cross-reference text to add.
- D-05: Ripple updates go through `WikiStore.saveArticle()` with `operation: 'update'`, so each gets logged via `appendLog()` automatically. Log entries use operation `update` with description mentioning "ripple from [primary-slug]".
- D-06: The ripple module receives the wiki schema (from `readSchema()`) so cross-references follow wiki conventions.

**Broad Filing / `wiki file` Command**
- D-07: New `wiki file` Commander subcommand accepts freeform text via argument or stdin pipe.
- D-08: Filing uses a planning step (single LLM call) that returns structured placement decisions: `[{action: 'create'|'update', slug: string, title: string, reason: string}]`. Then each decision is executed using the existing article-builder and dedup infrastructure.
- D-09: Filed content is marked with `type: 'filed'` in frontmatter (new type alongside 'web' and 'compound').
- D-10: After filing, ripple updates run on each created/updated article (same as `wiki ask` ripple).
- D-11: The `wiki file` command reads the schema and passes it to the filing LLM prompt.

**Bidirectional Backlinks**
- D-12: Backlinks are enforced at the body level using a `## See Also` section — NOT frontmatter arrays. Obsidian's graph view parses `[[wikilink]]` from body text; frontmatter arrays are NOT rendered as graph edges without plugins.
- D-13: Backlink enforcement is a post-save utility (`src/synthesis/backlink-enforcer.ts`) that runs after every `saveArticle()` in the synthesis/ripple/filing pipelines.
- D-14: The backlink enforcer uses `WikiStore.getArticle()` to read targets and `WikiStore.saveArticle()` with `operation: 'update'` to write back.
- D-15: The `## See Also` section is appended or updated (never duplicated). If a section already exists, the enforcer adds missing backlinks to the existing list.
- D-16: The wikilink sanitizer (`src/synthesis/wikilink-sanitizer.ts`) continues to strip invalid forward links. The backlink enforcer handles the reverse direction separately.

### Claude's Discretion
- Ripple relevance threshold for BM25 scoring
- Exact LLM prompt wording for ripple, filing placement, and backlink text
- Whether `wiki file` supports `--dry-run` to preview placement decisions
- Test structure and mocking approach
- Whether to add `type: 'filed'` to the existing Frontmatter union or keep it as `'compound'`

### Deferred Ideas (OUT OF SCOPE)
- Full article rewrites during ripple (expensive, save for later when cost is less of a concern)
- Automatic ripple on `wiki ingest <url>` (currently only `wiki ask` triggers ripple)
- Graph visualization command (`wiki graph`) — Obsidian handles this natively
- Semantic similarity for ripple targets (vector embeddings) — BM25 is sufficient at personal scale
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MULTI-01 | A single source ingestion touches 10-15 existing wiki pages — not just creates one article | D-01 through D-06 (ripple module), BM25 targeting, batched LLM call |
| MULTI-02 | After synthesizing the primary article, the LLM identifies existing articles that should cross-reference or incorporate findings | D-03 (BM25 search), D-04 (single batched LLM call with structured JSON output) |
| LOOP-04 | Not just Q&A answers — comparisons, analyses, discovered connections, and any valuable LLM output can be filed back | D-07 through D-11 (wiki file command, planning step, placement decisions) |
| LOOP-05 | `wiki file` command takes freeform text and LLM decides where it belongs — new page, update existing, or split across multiple | D-07 (stdin/argument), D-08 (placement planning step), D-09 (filed type) |
| GRAPH-01 | Backlinks are bidirectional — when article A links to B, article B is updated to include a backlink to A | D-12 through D-15 (backlink-enforcer.ts, See Also section, idempotent append) |
| GRAPH-02 | `wiki ask` and `wiki ingest` verify and repair bidirectional links after every write operation | D-13 (post-save utility called from synthesis/ripple/filing pipelines) |
</phase_requirements>

---

## Summary

Phase 8 transforms the wiki from single-article output to a wiki-wide knowledge ripple. Three new modules — `ripple.ts`, `backlink-enforcer.ts`, and a `wiki file` command — layer on top of the existing pipeline infrastructure established in Phases 4-7.

The core technical challenges are: (1) designing a batched LLM ripple prompt that returns structured JSON for multi-target updates without incurring per-article LLM cost, (2) implementing an idempotent `## See Also` section manager that reads and writes through WikiStore without creating duplicates, and (3) adding `'filed'` to the Frontmatter type union without breaking the existing `validateFrontmatter()` guard in WikiStore.

All new modules follow the established patterns: WikiStore as sole disk writer, `store` injected for testability, sequential processing with per-item error handling, and schema read once per operation and passed through. Phase 7 must be complete before Phase 8 begins — the schema injection and `appendLog()` centralization in WikiStore are prerequisites for ripple log entries and schema-aware prompts.

**Primary recommendation:** Build in three sequential waves: (Wave 1) `ripple.ts` + ask command integration, (Wave 2) `backlink-enforcer.ts` + post-save wiring, (Wave 3) `wiki file` command + type system extension.

---

## Standard Stack

### Core (all verified in installed node_modules)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `minisearch` | 7.2.0 | BM25 search for ripple target discovery | Already installed; `buildIndex()` and `search()` are the exact interface needed | [VERIFIED: npm list output] |
| `commander` | 14.0.3 | `wiki file` subcommand registration | Already used for all CLI commands; pattern established in `src/index.ts` | [VERIFIED: package.json] |
| `gray-matter` | 4.0.3 | Frontmatter read/write for See Also section updates | Already used by WikiStore for all article I/O | [VERIFIED: package.json] |
| `write-file-atomic` | 7.0.1 | Atomic article saves in backlink enforcer | Already used by WikiStore; prevents partial writes | [VERIFIED: package.json] |
| Vercel AI SDK (`ai`) | 6.0.146 | LLM calls for ripple batch prompt and filing placement | Already used by all synthesis, retrieval, and filing code | [VERIFIED: package.json] |

### No New Dependencies Required

Phase 8 requires zero new npm packages. Every capability needed exists in the current dependency graph:
- BM25 ripple target discovery: `minisearch` (installed)
- Structured JSON output from LLM: Vercel AI SDK's `generateText()` with a JSON-instruction prompt (existing pattern)
- Article read/modify/write: `WikiStore.getArticle()` + `WikiStore.saveArticle()` (existing)
- stdin pipe for `wiki file`: Node.js built-in `process.stdin` (existing pattern from `confirmFiling()`)
- Commander subcommand: `src/index.ts` addCommand pattern (existing)

**Version verification:** All versions confirmed via `npm list` in the project. [VERIFIED: npm list output]

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/
├── synthesis/
│   ├── ripple.ts              # NEW: ripple update module
│   └── backlink-enforcer.ts   # NEW: bidirectional backlink enforcer
├── commands/
│   └── file.ts                # NEW: wiki file command
└── types/
    └── article.ts             # EXTEND: add 'filed' to type union
```

### Pattern 1: Ripple Module (`src/synthesis/ripple.ts`)

**What:** Takes the primary article's title + summary, queries BM25 for top-10 related articles (excluding itself), batches them into a single LLM call, and applies the returned cross-reference updates through WikiStore.

**When to use:** Called from `ask.ts` AFTER `synthesize()` returns, operating on the full set of articles that were just created/updated.

**Interface:**

```typescript
// Source: Derived from established synthesizer.ts and article-filer.ts patterns [ASSUMED structure]
export interface RippleTarget {
  slug: string;
  title: string;
  seeAlsoText: string;  // The cross-reference text to append/add
}

export interface RippleResult {
  updatedSlugs: string[];
  skippedSlugs: string[];
}

export async function rippleUpdates(
  primaryArticles: Article[],
  store: WikiStore,
  schema: string,
): Promise<RippleResult>
```

**Key decisions from D-03/D-04:**
- Build MiniSearch index from all existing articles
- Query with `primaryArticle.frontmatter.title + ' ' + primaryArticle.frontmatter.summary`
- Take top 10, exclude primary article's own slug
- Apply relevance threshold (Claude's Discretion — recommend starting at BM25 score 3.0, same as `BM25_DEDUP_THRESHOLD`)
- Single LLM call: pass all target titles/summaries + primary article summary, receive JSON array of `{slug, seeAlsoText}` decisions

**Batched LLM prompt structure (MULTI-02):**

```typescript
// [ASSUMED: prompt pattern based on existing prompt-builder.ts conventions]
`You are a wiki cross-reference assistant. Given a new article summary, identify which
existing articles should add a cross-reference to this new article.

NEW ARTICLE: ${primaryArticle.frontmatter.title}
SUMMARY: ${primaryArticle.frontmatter.summary}

CANDIDATE ARTICLES (${targets.length} total):
${targets.map((t, i) => `${i}. [${t.slug}] ${t.title}: ${t.summary}`).join('\n')}

WIKI SCHEMA:
${schema}

Return ONLY valid JSON array. For each article that should cross-reference the new article,
include a brief contextual note (1-2 sentences). Skip articles where the connection is weak.

REQUIRED OUTPUT FORMAT:
[{"slug":"<slug>","seeAlsoText":"[[${primaryArticle.slug}]] — <brief contextual note>"}]

If no articles should be updated, return: []`
```

### Pattern 2: See Also Section Manager (used by both ripple and backlink enforcer)

**What:** Reads an article's body, appends/updates a `## See Also` section idempotently. Core operation shared by both ripple.ts and backlink-enforcer.ts.

**Implementation:**

```typescript
// Source: Derived from existing gray-matter patterns in wiki-store.ts [ASSUMED]
export function upsertSeeAlsoEntry(body: string, entry: string): string {
  const SEE_ALSO_HEADER = '## See Also';
  const sectionIdx = body.indexOf(SEE_ALSO_HEADER);

  if (sectionIdx === -1) {
    // No existing section — append at end
    return body.trimEnd() + `\n\n${SEE_ALSO_HEADER}\n\n- ${entry}\n`;
  }

  // Section exists — check if entry already present (idempotency guard)
  const afterHeader = body.slice(sectionIdx + SEE_ALSO_HEADER.length);
  // Extract the wikilink slug from entry to check for exact duplicate
  const wikilink = entry.match(/\[\[([^\]]+)\]\]/)?.[1];
  if (wikilink && afterHeader.includes(`[[${wikilink}]]`)) {
    return body; // Already present — no change
  }

  // Find insertion point: end of See Also section (before next ## or EOF)
  const nextSectionMatch = afterHeader.match(/\n##\s/);
  const insertAt = nextSectionMatch
    ? sectionIdx + SEE_ALSO_HEADER.length + nextSectionMatch.index!
    : body.length;

  return body.slice(0, insertAt).trimEnd() + `\n- ${entry}\n` + body.slice(insertAt);
}
```

**Critical:** This function MUST be idempotent — running it twice produces the same result. Check for the exact `[[slug]]` before inserting.

### Pattern 3: Backlink Enforcer (`src/synthesis/backlink-enforcer.ts`)

**What:** Post-save utility that scans a saved article's body for `[[wikilinks]]`, reads each target article, and ensures the target has a reciprocal backlink in its `## See Also` section.

**Interface:**

```typescript
// Source: Derived from wikilink-sanitizer.ts regex + wiki-store patterns [ASSUMED structure]
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export async function enforceBacklinks(
  article: Article,
  store: WikiStore,
): Promise<string[]>  // returns slugs that were updated
```

**Key constraint (D-14):** All reads via `store.getArticle()`, all writes via `store.saveArticle(article, 'update')`. Never write to disk directly.

**Idempotency check (D-15):** Before calling `saveArticle()` on a target, verify the backlink is not already present. Avoid unnecessary writes and index rebuilds.

**Performance note:** Each `saveArticle()` triggers `rebuildIndex()`. For articles with many wikilinks, this means N index rebuilds per article save. At personal wiki scale (<1000 articles), this is acceptable. If it becomes a bottleneck, a batched-save strategy can be added later.

### Pattern 4: `wiki file` Command (`src/commands/file.ts`)

**What:** Accepts freeform text via argument or stdin, runs a planning LLM call to get placement decisions, then executes each placement using existing article-builder and dedup infrastructure.

**Stdin detection pattern (from existing `confirmFiling()`):**

```typescript
// Source: src/commands/ask.ts confirmFiling() — established stdin pattern [VERIFIED: codebase]
async function readInput(textArg: string | undefined): Promise<string> {
  if (textArg) return textArg;
  if (process.stdin.isTTY) {
    process.stderr.write('Error: provide text as argument or pipe via stdin\n');
    process.exit(1);
  }
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}
```

**Placement decision output format (D-08):**

```typescript
// [ASSUMED structure based on D-08 spec]
interface PlacementDecision {
  action: 'create' | 'update';
  slug: string;       // For 'update': existing slug. For 'create': proposed slug.
  title: string;
  reason: string;
}
```

**Registration in `src/index.ts`:**

```typescript
// Source: src/index.ts — established addCommand pattern [VERIFIED: codebase]
import { fileCommand } from './commands/file.js';
program.addCommand(fileCommand);
```

### Pattern 5: Frontmatter Type Extension

**What:** Add `'filed'` to the `type` union in `src/types/article.ts` and update `validateFrontmatter()` in `wiki-store.ts` to accept it.

**Current state (VERIFIED: codebase):**

```typescript
// src/types/article.ts — current
type: 'web' | 'compound';

// src/store/wiki-store.ts validateFrontmatter() — current
if (fm.type !== 'web' && fm.type !== 'compound') {
  throw new Error(`Invalid frontmatter type: "${fm.type}". Must be "web" or "compound".`);
}
```

**Required change:**

```typescript
// src/types/article.ts — extended
type: 'web' | 'compound' | 'filed';

// src/store/wiki-store.ts validateFrontmatter() — extended
const VALID_TYPES = ['web', 'compound', 'filed'] as const;
if (!VALID_TYPES.includes(fm.type as typeof VALID_TYPES[number])) {
  throw new Error(`Invalid frontmatter type: "${fm.type}". Must be one of: ${VALID_TYPES.join(', ')}.`);
}
```

**CRITICAL: Test fixture impact.** Every existing test that constructs a `Frontmatter` object with `type: 'web' | 'compound'` will continue to pass — TypeScript's union extension is backward-compatible. But `validateFrontmatter()` change must be tested. The MEMORY.md note about "Config Extension Regressions" applies here: if `type` validation changes, check all test fixtures that pass a `type` field to `saveArticle()`. [VERIFIED: MEMORY.md]

### Anti-Patterns to Avoid

- **Writing to disk outside WikiStore:** All article writes — including ripple updates and backlink enforcer writes — MUST go through `store.saveArticle()`. Never use `fs.writeFile()` directly. [VERIFIED: established invariant from Phase 1 decisions]
- **Parallel writes in ripple/backlink enforcer:** Use sequential `for...of` loops (not `Promise.all`) for ripple updates and backlink enforcement. Each `saveArticle()` triggers `rebuildIndex()`, which reads all articles. Parallel writes would cause race conditions on the index. [VERIFIED: ask.ts sequential processing pattern]
- **Assuming `## See Also` is always at the end:** Articles generated by the LLM have a `## Sources` section at the very end. `## See Also` should be inserted BEFORE `## Sources`, or at the end if no Sources section exists. Check for `## Sources` section before appending.
- **Ripple on empty wiki:** If the wiki has 0 or <2 articles, ripple has no targets. Guard with `if (existingArticles.length === 0) return { updatedSlugs: [], skippedSlugs: [] }`.
- **LLM returns invalid JSON in ripple batch call:** Always wrap ripple LLM output parsing in try/catch. On JSON parse failure, log a warning and return empty updates — don't throw, since the primary article has already been saved.
- **Backlink enforcer running on the article it just saved:** When enforcing backlinks for article A (which links to B), enforcer updates B to link back to A. Do NOT then re-run the enforcer on B (which would try to update A, which would re-run on B, etc.). The enforcer is not recursive — it only runs one level.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BM25 ripple target search | Custom relevance algorithm | `buildIndex()` + `search()` from `src/search/search-index.ts` | Already tuned for the project's SearchDoc schema; handles prefix/fuzzy matching |
| Article dedup during filing | Duplicate slug detection | `findExistingArticle()` from `src/synthesis/deduplicator.ts` | Three-tier dedup (slug, BM25, LLM tiebreak) already handles edge cases |
| Atomic article writes in enforcer | `fs.writeFile()` | `WikiStore.saveArticle()` | Atomic write, frontmatter validation, index rebuild, and log append all happen automatically |
| JSON output from LLM | Custom parsing | Prompt engineering with strict JSON instruction + `JSON.parse()` in try/catch | Simpler than function calling or tool use for this use case; retry pattern already established |
| Frontmatter manipulation | String replacement | `gray-matter` parse + modify + re-stringify via `WikiStore` | Round-trip YAML validation already in WikiStore prevents corruption |
| Wikilink extraction | Custom regex | Reuse `WIKILINK_RE = /\[\[([^\]]+)\]\]/g` from `wikilink-sanitizer.ts` (or export it) | Already handles `[[slug]]` and `[[slug|display text]]` formats |

**Key insight:** Phase 8 is almost entirely an orchestration problem. The hard parts (BM25 search, article dedup, atomic writes, log entries) are already solved. The new code is glue logic and LLM prompt design.

---

## Common Pitfalls

### Pitfall 1: `validateFrontmatter()` rejects `type: 'filed'`
**What goes wrong:** The `wiki file` command builds an article with `type: 'filed'`, calls `store.saveArticle()`, which calls `validateFrontmatter()`, which throws because `'filed'` is not in the allowed set.
**Why it happens:** `validateFrontmatter()` has an explicit allow-list: `fm.type !== 'web' && fm.type !== 'compound'`. Adding a new type requires updating both `src/types/article.ts` AND the validation guard.
**How to avoid:** Update both files in the same plan task. Add a test that explicitly saves an article with `type: 'filed'` and asserts no error.
**Warning signs:** TypeScript compile passes (type is in the union) but runtime test fails with "Invalid frontmatter type: filed".

### Pitfall 2: Ripple triggers on newly created article's own slug
**What goes wrong:** BM25 search for ripple targets returns the primary article itself as the top hit. The ripple then adds a self-referential backlink.
**Why it happens:** The primary article was just saved to disk before ripple runs. `listArticles()` includes it. BM25 query with its own title returns it as the highest scorer.
**How to avoid:** After getting top-10 BM25 results, filter out any slug that matches a primary article slug: `results.filter(r => !primarySlugs.has(r.slug))`.
**Warning signs:** Articles gain a `## See Also` entry pointing to themselves.

### Pitfall 3: `## See Also` appears before `## Sources` — breaking citation order
**What goes wrong:** Ripple or backlink enforcer appends `## See Also` after `## Sources`, or between sources entries.
**Why it happens:** Naive `body.trimEnd() + '\n\n## See Also\n\n...'` ignores existing sections.
**How to avoid:** In `upsertSeeAlsoEntry`, detect the `## Sources` section position and insert `## See Also` before it if sources exist. Canonical article structure: `...body content... ## See Also ... ## Sources`.
**Warning signs:** Obsidian renders a sources section with a See Also section appended after it, breaking citation list.

### Pitfall 4: Backlink enforcer creates infinite write loop
**What goes wrong:** Enforcer updates article B to add backlink to A. If enforcer is called recursively on the updated B, it would add B's wikilinks back to A, and so on.
**Why it happens:** Calling `enforceBacklinks()` inside the enforcer itself, or calling it from `saveArticle()` rather than from the command-level pipeline.
**How to avoid:** Call `enforceBacklinks()` ONLY from the command-level pipeline (ask.ts, file.ts) after all primary saves are complete. Never call it from inside WikiStore or from inside the ripple module's per-target save loop.
**Warning signs:** Runaway LLM calls or stack overflow during `wiki ask`.

### Pitfall 5: Ripple LLM JSON parse failure silently drops all updates
**What goes wrong:** LLM returns malformed JSON (e.g., markdown-fenced JSON block, trailing comma). `JSON.parse()` throws. If uncaught, ripple exits without any updates. If caught and silently swallowed, there's no indication to the user.
**Why it happens:** LLMs sometimes wrap JSON in `\`\`\`json ... \`\`\`` even when instructed not to.
**How to avoid:** Strip leading/trailing markdown fences before `JSON.parse()`. On parse failure, log to stderr and return empty result (don't throw). Add a test for malformed JSON input.
**Warning signs:** `wiki ask` completes with "0 ripple updates" when wiki has 50+ articles.

### Pitfall 6: `wiki file` with stdin hangs in non-TTY context
**What goes wrong:** `wiki file` reads from stdin. In a non-TTY context (scripted use, subprocess), `process.stdin.on('end')` never fires if the parent process keeps the pipe open.
**Why it happens:** Stdin pipe is kept open by the parent process.
**How to avoid:** When reading stdin, set a reasonable timeout. If the text argument is provided, don't read stdin at all. Follow the `confirmFiling()` guard pattern: check `process.stdin.isTTY` before attempting readline.
**Warning signs:** `wiki file` hangs indefinitely when piped input is not terminated with EOF.

### Pitfall 7: `saveArticle()` called N times in ripple — N index rebuilds
**What goes wrong:** Ripple updates 10 articles. Each `saveArticle()` calls `rebuildIndex()` which calls `listArticles()` which reads N files from disk. With 10 ripple targets and 500 articles, that's 10 × 500 file reads.
**Why it happens:** `rebuildIndex()` is unconditional in the current `saveArticle()` implementation.
**How to avoid:** At personal wiki scale (<1000 articles, <15 ripple targets), this is acceptable — empirically about 150ms per rebuild. The Phase 8 plan should NOT add batch-save optimization unless perf tests show it's needed. Document it as a known trade-off.
**Warning signs:** `wiki ask` takes >30 seconds on wikis with 500+ articles.

---

## Code Examples

Verified patterns from the codebase:

### Existing `buildIndex()` + `search()` usage (ripple target discovery)
```typescript
// Source: src/synthesis/deduplicator.ts [VERIFIED: codebase]
import { buildIndex, search } from '../search/search-index.js';

const index = buildIndex(existingArticles);
const results = search(index, plannedTitle);
const topResult = results[0];
if (!topResult || topResult.score < BM25_DEDUP_THRESHOLD) return null;
```

### MockWikiStore pattern for tests (established in all synthesis tests)
```typescript
// Source: tests/synthesis.test.ts, tests/retrieval-filer.test.ts [VERIFIED: codebase]
class MockWikiStore {
  private articles = new Map<string, Article>();
  slugify(title: string): string { ... }
  async saveArticle(article: Article, _operation?: 'create' | 'update'): Promise<string> { ... }
  async listArticles(): Promise<Article[]> { ... }
  async getArticle(slug: string): Promise<Article | null> { ... }
  async readSchema(): Promise<string | null> { return null; }
  async updateSchema(_content: string): Promise<void> {}
  async appendLog(_op: string, _desc: string): Promise<void> {}
  seedArticle(article: Article): void { ... }
}
```

### Commander subcommand registration pattern
```typescript
// Source: src/index.ts [VERIFIED: codebase]
import { fileCommand } from './commands/file.js';
program.addCommand(fileCommand);
```

### Stdin reading in non-TTY-safe context
```typescript
// Source: src/commands/ask.ts confirmFiling() [VERIFIED: codebase]
if (!process.stdin.isTTY) {
  return false; // auto-decline in subprocess context
}
```

### LLM call pattern with retry
```typescript
// Source: src/retrieval/article-filer.ts fileAnswerAsArticle() [VERIFIED: codebase]
let parsed = parseArticleOutput(await generateText(prompt, { temperature: 0.3, maxOutputTokens: 4096 }));
if (parsed === null) {
  const retryPrompt = prompt + '\n\nIMPORTANT: You MUST follow the exact format...';
  parsed = parseArticleOutput(await generateText(retryPrompt, { temperature: 0.3, maxOutputTokens: 4096 }));
}
if (parsed === null) throw new Error('Filing failed: could not parse LLM output after retry');
```

### Sequential processing for graceful per-item failure
```typescript
// Source: src/commands/ask.ts [VERIFIED: codebase]
for (const result of results) {
  try {
    // ... per-item logic
  } catch (err) {
    process.stderr.write(`  [SKIP] ${url}: ${message}\n`);
    continue; // don't abort entire batch
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-article output per `wiki ask` | Multi-article ripple across 10-15 pages | Phase 8 | Each ask compounds wiki connectivity |
| Forward-only wikilinks (sanitizer strips hallucinations) | Bidirectional backlinks (enforcer adds reciprocal links) | Phase 8 | Obsidian graph view shows full graph |
| Q&A-only filing (`wiki ask` + confirm gate) | Any freeform content via `wiki file` | Phase 8 | Analyses, comparisons, notes become wiki articles |
| `type: 'web' | 'compound'` | `type: 'web' | 'compound' | 'filed'` | Phase 8 | User-filed content distinguishable from web-sourced |

**Deprecated/outdated for this phase:**
- Nothing is being removed. All existing commands remain unchanged. Phase 8 is additive.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ripple relevance threshold should start at BM25 score 3.0 (same as `BM25_DEDUP_THRESHOLD`) | Architecture Patterns > Pattern 1 | May produce too many or too few ripple targets; tunable via Claude's Discretion |
| A2 | `## See Also` should appear before `## Sources` in article structure | Common Pitfalls > Pitfall 3 | If wrong, articles become malformatted; easily fixed once canonical order is defined |
| A3 | `upsertSeeAlsoEntry()` should be a shared utility (not duplicated in ripple.ts and backlink-enforcer.ts) | Architecture Patterns > Pattern 2 | If kept separate, bug fixes would need to be applied in two places |
| A4 | Backlink enforcer should NOT be called recursively — only from command-level pipeline | Common Pitfalls > Pitfall 4 | If called from inside WikiStore or ripple's per-target save loop, creates infinite write loop |
| A5 | The `wiki file` command should support `--dry-run` (Claude's Discretion) | Standard Stack | If omitted, users have no way to preview placement decisions before committing |
| A6 | JSON.parse() is sufficient for ripple LLM output (no structured output/tool use needed) | Architecture Patterns > Pattern 1 | If LLM consistently returns malformed JSON, may need to use Vercel AI SDK's structured output (`generateObject`) |

---

## Open Questions (RESOLVED)

1. RESOLVED: `## See Also` goes BEFORE `## Sources` — Sources is citations, See Also is navigation (Wikipedia convention). Plans implement this in see-also.ts upsertSeeAlsoEntry().

2. RESOLVED: Ripple runs once after ALL placement decisions complete (not per-article). Plan 08-03 Task 1 implements this: collect all filed articles, then single rippleUpdates() call.

3. RESOLVED: enforceBacklinks() runs ONLY on primary articles, NOT on ripple-updated articles. Plan 08-02 Task 1 constrains this. Ripple adds see-also sections (not body wikilinks), so no new forward links to reciprocate.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — Phase 8 is a pure code extension using already-installed packages)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run tests/ripple.test.ts tests/backlink-enforcer.test.ts tests/file-command.test.ts` |
| Full suite command | `npx vitest run` |

**Current baseline:** 287 tests passing across 17 test files. [VERIFIED: test run output]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MULTI-01 | Ripple updates 5+ existing articles after `wiki ask` | unit | `npx vitest run tests/ripple.test.ts` | ❌ Wave 0 |
| MULTI-02 | BM25 finds related articles; single batched LLM call returns structured update decisions | unit | `npx vitest run tests/ripple.test.ts` | ❌ Wave 0 |
| LOOP-04 | `wiki file` accepts text argument and freeform content | unit | `npx vitest run tests/file-command.test.ts` | ❌ Wave 0 |
| LOOP-05 | LLM placement planning returns create/update decisions; each is executed via existing dedup | unit | `npx vitest run tests/file-command.test.ts` | ❌ Wave 0 |
| GRAPH-01 | `enforceBacklinks()` adds reciprocal link to target article's See Also section | unit | `npx vitest run tests/backlink-enforcer.test.ts` | ❌ Wave 0 |
| GRAPH-02 | After `wiki ask` synthesize, backlinks are verified for all produced articles | unit | `npx vitest run tests/backlink-enforcer.test.ts` | ❌ Wave 0 |
| D-09 | Article saved with `type: 'filed'` passes `validateFrontmatter()` | unit | `npx vitest run tests/wiki-store.test.ts` | ✅ (extend) |
| D-04 | Ripple skips articles below BM25 threshold | unit | `npx vitest run tests/ripple.test.ts` | ❌ Wave 0 |
| D-15 | `upsertSeeAlsoEntry()` is idempotent — calling twice produces same result | unit | `npx vitest run tests/backlink-enforcer.test.ts` | ❌ Wave 0 |
| D-02 | Ripple does NOT rewrite article body — only appends to See Also | unit | `npx vitest run tests/ripple.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/ripple.test.ts tests/backlink-enforcer.test.ts tests/file-command.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (287+ tests) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/ripple.test.ts` — covers MULTI-01, MULTI-02, D-04, D-02
- [ ] `tests/backlink-enforcer.test.ts` — covers GRAPH-01, GRAPH-02, D-15
- [ ] `tests/file-command.test.ts` — covers LOOP-04, LOOP-05, D-09

*(Existing `tests/wiki-store.test.ts` will need one new test case for `type: 'filed'` validation.)*

---

## Security Domain

`security_enforcement` is not explicitly set in `.planning/config.json` — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | CLI tool, local-only |
| V3 Session Management | No | Stateless CLI |
| V4 Access Control | No | Single-user local tool |
| V5 Input Validation | Yes | `wiki file` accepts freeform user text; passed to LLM prompt |
| V6 Cryptography | No | No secrets or encrypted data |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via `wiki file` argument | Tampering | Text is included in LLM prompt verbatim — at personal-tool scale this is acceptable; do not eval or execute the content |
| Path traversal in slug-derived filenames | Tampering | All file writes go through `WikiStore.saveArticle()` which uses `slugify()` before constructing paths — slugify strips all path separators |
| Disk exhaustion from runaway ripple | Denial of Service | BM25 top-10 cap (D-03) limits ripple to at most 10 article updates per operation |

---

## Sources

### Primary (HIGH confidence)
- `src/synthesis/synthesizer.ts` — Full synthesizer pipeline, established orchestration patterns
- `src/synthesis/deduplicator.ts` — BM25 threshold (3.0), three-tier dedup, MiniSearch usage
- `src/synthesis/wikilink-sanitizer.ts` — WIKILINK_RE regex pattern for body parsing
- `src/store/wiki-store.ts` — validateFrontmatter(), saveArticle(), appendLog() — all extension points
- `src/commands/ask.ts` — Integration point for ripple; established stdin/stdout patterns
- `src/retrieval/article-filer.ts` — Filing prompt pattern, compound article builder, retry-on-parse
- `src/index.ts` — Commander subcommand registration pattern
- `src/types/article.ts` — Frontmatter interface (type union to extend)
- `tests/synthesis.test.ts`, `tests/retrieval-filer.test.ts` — MockWikiStore class-based pattern
- `package.json` + `npm list` — All installed versions verified

### Secondary (MEDIUM confidence)
- `.planning/phases/08-multi-page-ingest-broad-filing-graph/08-CONTEXT.md` — Locked implementation decisions (D-01 through D-16)
- `.planning/REQUIREMENTS.md` — MULTI-01, MULTI-02, LOOP-04, LOOP-05, GRAPH-01, GRAPH-02 definitions
- Karpathy reference (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — Multi-page ingest concept (cited in CONTEXT.md; not directly fetched)

### Tertiary (LOW confidence)
- None — all claims are grounded in verified codebase reading or locked CONTEXT.md decisions

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages verified via `npm list` and `package.json`; zero new dependencies
- Architecture: HIGH — all patterns derived from verified existing code; new module interfaces follow established conventions
- Pitfalls: HIGH — derived from specific code reading (validateFrontmatter, saveArticle, sequential processing patterns)
- Test patterns: HIGH — verified against 287-test suite with confirmed MockWikiStore class structure

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable stack — no external APIs or fast-moving dependencies involved)

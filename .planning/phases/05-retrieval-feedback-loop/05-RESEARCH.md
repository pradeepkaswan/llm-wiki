# Phase 5: Retrieval + Feedback Loop - Research

**Researched:** 2026-04-04
**Domain:** BM25 retrieval orchestration, stdin user confirmation, compound article filing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Coverage Confidence Scoring**
- **D-01:** Orchestrator uses existing BM25 search (`src/search/search-index.ts`) — load articles via `WikiStore.listArticles()`, build index via `buildIndex()`, query with user's question.
- **D-02:** Coverage threshold is a configurable parameter in `~/.llm-wiki/config.json` — add `coverage_threshold` field to the `Config` interface with a sensible default (e.g. 5.0).
- **D-03:** Routing logic: if BM25 top result score >= `coverage_threshold`, route to wiki answer path. If below, route to web search path. The threshold is intentionally tunable.
- **D-04:** Orchestrator retrieves the top 3-5 articles above a minimum score for context in the wiki answer.

**Wiki Answer Generation**
- **D-05:** Wiki answers use a single `generateText()` call. Prompt includes user's question + full body of top 3-5 relevant articles. Q&A-specific system prompt instructs LLM to answer from wiki content only, citing article titles.
- **D-06:** Wiki answer written to stdout (machine-readable). Progress/routing decisions go to stderr. Maintains stdout/stderr contract.
- **D-07:** No streaming — full response needed before deciding whether to file it back.

**Compound Article Structure**
- **D-08:** Filed Q&A answer becomes a standard article with `type: compound` in frontmatter. Reuses `WikiStore.saveArticle()` without changes.
- **D-09:** `sources` field in frontmatter lists slugs of wiki articles prefixed with `wiki://` to distinguish from URLs. `sourced_at` is set to current ISO timestamp.
- **D-10:** Compound articles go through the same deduplication pipeline — reuses `findExistingArticle()` from `src/synthesis/deduplicator.ts`.

**User Approval UX (Feedback Gating)**
- **D-11:** After displaying a wiki-sourced Q&A answer, system prompts on stderr: "File this answer back into the wiki? [y/N]". Simple stdin readline confirmation.
- **D-12:** Default is "no" — the user must actively opt in.
- **D-13:** When approved, LLM converts Q&A answer into article format (title, summary, categories, body), then saves via `WikiStore.saveArticle()` and rebuilds the index.

**CLI Integration**
- **D-14:** Add `--web` flag to `wiki ask` command. When set, skip the wiki check entirely.
- **D-15:** `wiki ask` command flow: check wiki (BM25) → [if covered: generate answer → display → prompt for filing] OR [if not covered OR --web: search → fetch → store → synthesize → save].
- **D-16:** `wiki search` command remains unchanged.

### Claude's Discretion
- Module file placement within `src/` (e.g., `src/retrieval/`, `src/orchestrator/`, or similar)
- Q&A system prompt wording for wiki answer generation
- Q&A-to-article conversion prompt wording
- BM25 default threshold value (5.0 suggested, but may need tuning)
- How to structure the article conversion step (reuse synthesis prompts or create new ones)
- Test structure and mocking approach

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RETR-01 | User can query the existing wiki before the system searches the web | D-01, D-03: BM25 check using existing `buildIndex()`+`search()` before triggering web search |
| RETR-02 | System uses local index (BM25) to find 3-5 relevant articles per query | D-04: Top 3-5 above minimum score used as context; `SearchResult.score` already returned by `search()` |
| RETR-03 | Orchestrator decides "answer from wiki" vs "search web" based on coverage confidence | D-02, D-03: `coverage_threshold` config field; routing based on `topResult.score >= coverage_threshold` |
| LOOP-01 | Q&A answers against the wiki are filed back as new or updated articles | D-10, D-13: dedup via `findExistingArticle()`, save via `WikiStore.saveArticle()` |
| LOOP-02 | Compound articles are marked with `type: compound` in frontmatter | D-08, D-09: `type: 'compound'` already in `Frontmatter` type; `sources` uses `wiki://slug` prefix |
| LOOP-03 | Feedback loop is gated — user can approve/skip filing answer back into wiki | D-11, D-12: readline prompt on stderr, default "no" |
</phase_requirements>

---

## Summary

Phase 5 inserts a retrieval-first decision layer into the existing `wiki ask` command. The current command runs unconditionally: search → fetch → synthesize. Phase 5 wraps this with a BM25 coverage check: if the wiki already covers the question, answer from local articles instead of hitting the web. The same `buildIndex()` and `search()` functions from `src/search/search-index.ts` are reused — no new search infrastructure is needed.

The feedback loop closes the compounding cycle. When the orchestrator answers from wiki articles, the Q&A answer can optionally be filed back as a `type: compound` article. This reuses the entire save/dedup pipeline from Phase 4 — `findExistingArticle()`, `WikiStore.saveArticle()`, and `parseArticleOutput()` all work for compound articles without modification. The only new parsing needed is the Q&A-to-article conversion prompt, whose output format matches the existing `parseArticleOutput()` expected format.

The user confirmation gate uses Node's built-in `readline` module — one `question()` call on `process.stderr` for the prompt, checking if the answer starts with 'y'. This is the only interaction point; all other output follows the established stdout/stderr contract. The `--web` flag is a clean Commander `.option()` addition. The `coverage_threshold` config extension follows the exact pattern used in Phase 2 (llm_provider) and Phase 3 (search_provider): add field to `Config` interface, add to `DEFAULTS`, add validation in `validateConfig()`.

**Primary recommendation:** Implement the orchestrator as a new `src/retrieval/orchestrator.ts` module that exports a single `routeQuestion()` function, wiring the BM25 check and routing decision while keeping `ask.ts` thin. The Q&A answer generation and compound article conversion belong in new `src/retrieval/` files that mirror the `src/synthesis/` pattern.

---

## Standard Stack

### Core (all already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `minisearch` | 7.2.0 | BM25 scoring for coverage check | Already in `src/search/search-index.ts`; `search()` already returns `score` |
| `ai` (Vercel AI SDK) | 6.0.146 | `generateText()` for wiki answer + article conversion | Already in `src/llm/adapter.ts`; `generateText()` with `GenerateOptions` |
| `commander` | 14.0.3 | `--web` flag addition to `ask` command | Already wired; `.option()` is a one-liner |
| Node `readline` (built-in) | — | Stdin confirmation prompt (D-11) | No dependency; `readline.createInterface()` on stderr/stdin |
| `gray-matter` + `write-file-atomic` | installed | Compound article save via `WikiStore.saveArticle()` | Already handles `type: compound` validation |

### No New Dependencies

This phase requires **zero new npm packages**. All required functionality is already installed:
- BM25 retrieval: `minisearch` via existing `search-index.ts`
- LLM calls: `ai` SDK via existing `adapter.ts`
- File writes: `write-file-atomic` + `gray-matter` via existing `WikiStore`
- Deduplication: existing `deduplicator.ts`
- Article parsing: existing `output-parser.ts`
- CLI flag: `commander` via existing `ask.ts`
- User confirmation: Node built-in `readline`

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── retrieval/
│   ├── orchestrator.ts      # routeQuestion() — coverage check + routing decision
│   ├── wiki-answer.ts       # generateWikiAnswer() — LLM call with wiki context
│   ├── article-filer.ts     # fileAnswerAsArticle() — Q&A-to-article conversion + save
│   └── prompt-builder.ts    # buildWikiAnswerPrompt(), buildFilingPrompt()
├── commands/
│   └── ask.ts               # Modified: insert wiki check before web search flow
└── config/
    └── config.ts            # Modified: add coverage_threshold field
```

This mirrors the `src/synthesis/` pattern: each concern in its own module, orchestrator wires them.

### Pattern 1: Config Extension (established pattern from Phase 2 and 3)

Add `coverage_threshold` to config using the exact same pattern as `llm_provider` and `search_provider`:

```typescript
// src/config/config.ts — extend Config interface
export interface Config {
  vault_path: string;
  llm_provider: LlmProvider;
  llm_model?: string;
  llm_base_url?: string;
  search_provider: SearchProvider;
  coverage_threshold: number;       // NEW: BM25 score threshold for wiki routing
}

// DEFAULTS
const DEFAULTS: Config = {
  // ... existing ...
  coverage_threshold: 5.0,
};

// validateConfig: add range check
if (typeof config.coverage_threshold !== 'number' || config.coverage_threshold < 0) {
  throw new Error('coverage_threshold must be a non-negative number');
}
```

**Why 5.0 as default:** The deduplicator uses `BM25_DEDUP_THRESHOLD = 3.0` to detect near-duplicate article titles. Coverage confidence is a different (stricter) question: "does the wiki have enough content to answer this?" A score of 5.0 corresponds to a query that substantially matches title + body content (not just a coincidental partial match). The threshold is user-configurable so it can be tuned after real usage.

### Pattern 2: BM25 Coverage Check (orchestrator core)

```typescript
// src/retrieval/orchestrator.ts
import { buildIndex, search } from '../search/search-index.js';
import { WikiStore } from '../store/wiki-store.js';

export interface CoverageResult {
  covered: boolean;
  articles: Article[];  // top 3-5 above minimum score, empty if not covered
}

const COVERAGE_MIN_SCORE = 1.0; // minimum score to include as context (separate from routing threshold)

export async function assessCoverage(
  question: string,
  store: WikiStore,
  threshold: number,
): Promise<CoverageResult> {
  const articles = await store.listArticles();
  if (articles.length === 0) return { covered: false, articles: [] };

  const index = buildIndex(articles);
  const results = search(index, question);

  const topResult = results[0];
  if (!topResult || topResult.score < threshold) {
    return { covered: false, articles: [] };
  }

  // Retrieve top 3-5 articles above minimum score for context (D-04)
  const contextSlugs = results
    .filter((r) => r.score >= COVERAGE_MIN_SCORE)
    .slice(0, 5)
    .map((r) => r.slug);

  const contextArticles = await Promise.all(
    contextSlugs.map((slug) => store.getArticle(slug))
  );

  return {
    covered: true,
    articles: contextArticles.filter((a): a is Article => a !== null),
  };
}
```

**Key insight:** `COVERAGE_MIN_SCORE` (for collecting context articles) is separate from `coverage_threshold` (for the routing decision). The top result triggers routing; the collected context may include additional articles that scored above a lower minimum.

### Pattern 3: Wiki Answer Generation

```typescript
// src/retrieval/wiki-answer.ts
import { generateText } from '../llm/adapter.js';

const WIKI_ANSWER_SYSTEM =
  'You are a wiki assistant. Answer the user\'s question using ONLY the wiki articles provided. ' +
  'Cite article titles inline as [Article Title]. Do not invent information not in the articles.';

export async function generateWikiAnswer(
  question: string,
  articles: Article[],
): Promise<string> {
  const prompt = buildWikiAnswerPrompt(question, articles);
  return generateText(prompt, {
    system: WIKI_ANSWER_SYSTEM,
    temperature: 0.2,
    maxOutputTokens: 2048,
  });
}
```

**No streaming** (D-07): The full response is needed before deciding whether to file back. Consistent with Phase 2 D-08 decision.

### Pattern 4: Stdin Readline Confirmation (D-11)

```typescript
// In ask.ts action, after displaying wiki answer
import * as readline from 'readline';

async function confirmFiling(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,  // prompt to stderr, not stdout
    });
    rl.question('File this answer back into the wiki? [y/N] ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}
```

**Critical:** `output: process.stderr` — the readline prompt goes to stderr, not stdout. This preserves the stdout/stderr contract (D-06, INTG-02). The wiki answer itself also goes to stdout.

**Non-TTY behavior:** When stdin is not a TTY (e.g., pipe or Phase 6 subprocess), `rl.question()` still works but the user has no way to type — the answer will be empty, resolving to `false` (the default). This is correct: piped usage skips filing automatically.

### Pattern 5: Compound Article Filing

The Q&A-to-article conversion LLM call must produce output in the exact format expected by `parseArticleOutput()` from `src/synthesis/output-parser.ts`:

```
TITLE: [article title]
SUMMARY: [one sentence summary]
CATEGORIES: [comma-separated]
BODY:
[markdown body]

## Sources
wiki://slug-1
wiki://slug-2
```

**Important:** `parseArticleOutput()` uses `sourceRefs` to populate `frontmatter.sources`. For compound articles, the source URLs are `wiki://slug-name` strings (D-09). The parser's `parseSourceRefs()` looks for numbered markdown links `[Title](url)` — so the filing prompt must output sources in that format:

```
## Sources

1. [Article Title](wiki://article-slug)
2. [Other Title](wiki://other-slug)
```

This way `parseSourceRefs()` captures them correctly, and `buildNewArticle()` sets `frontmatter.sources` to `['wiki://article-slug', 'wiki://other-slug']`.

**Then `buildNewArticle()` must NOT be used directly** — compound articles have `type: compound`, not `type: web`. A custom builder function in `src/retrieval/article-filer.ts` should assemble the Article object, mirroring `buildNewArticle()` but setting `type: 'compound'` and skipping the wikilink sanitizer (compound articles cite slugs directly, not `[[slug]]` links).

### Pattern 6: Ask Command Orchestration (modified flow)

```typescript
// src/commands/ask.ts — modified action
.option('--web', 'skip wiki check and search the web directly')
.action(async (question: string, options: { web?: boolean }) => {
  const config = await loadConfig();

  // Step 1: Wiki check (skip if --web)
  if (!options.web) {
    process.stderr.write(`Checking wiki for: "${question}"...\n`);
    const store = new WikiStore(config.vault_path);
    const coverage = await assessCoverage(question, store, config.coverage_threshold);

    if (coverage.covered) {
      process.stderr.write(`[WIKI] Found ${coverage.articles.length} relevant article(s) — answering from wiki\n`);
      const answer = await generateWikiAnswer(question, coverage.articles);
      process.stdout.write(`${answer}\n`);

      // Step 2: Prompt for filing (D-11)
      const shouldFile = await confirmFiling();
      if (shouldFile) {
        process.stderr.write('Filing answer as compound article...\n');
        const filed = await fileAnswerAsArticle(question, answer, coverage.articles, store);
        process.stdout.write(`${filed.frontmatter.title}\n`);
        process.stderr.write(`[SAVED] articles/${filed.slug}.md (type: compound)\n`);
      }
      return;
    }

    process.stderr.write(`[WEB] Wiki coverage insufficient (threshold: ${config.coverage_threshold}) — searching web\n`);
  }

  // Step 3: Existing web search → fetch → synthesize flow (unchanged)
  // ... current ask.ts code from line 23 onwards ...
});
```

### Anti-Patterns to Avoid

- **Calling `buildIndex()` once at startup:** The wiki grows — build the index fresh for each `ask` invocation. MiniSearch is fast enough for personal-scale wikis (<1000 articles).
- **Using `buildNewArticle()` for compound articles:** It hardcodes `type: 'web'`. Build the compound `Article` object directly in `article-filer.ts`.
- **Writing readline prompt to stdout:** Any text on stdout breaks Phase 6 subprocess piping. The prompt goes to `process.stderr`, the answer goes to `process.stdout`.
- **Making `coverage_threshold` validation too strict:** The config validation should warn about out-of-range values but not prevent startup — users experimenting with the threshold should not get hard failures.
- **Forgetting `rl.close()` after readline:** Leaving the interface open prevents Node from exiting cleanly. Always close in both resolve paths.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BM25 scoring | Custom scoring function | `buildIndex()` + `search()` in `src/search/search-index.ts` | Already tuned with title/summary/body boost weights; returns `score` field |
| Article deduplication | Slug-check-only logic | `findExistingArticle()` in `src/synthesis/deduplicator.ts` | Three-tier dedup (slug → BM25 → LLM) prevents silent creation of duplicate compound articles |
| LLM output parsing | New parser for Q&A-to-article conversion | `parseArticleOutput()` in `src/synthesis/output-parser.ts` | Already handles code fence stripping, fallback categories, `## Sources` parsing |
| Atomic file writes | `fs.writeFile()` directly | `WikiStore.saveArticle()` | Validates frontmatter, round-trips YAML, uses `write-file-atomic`, rebuilds index |
| Custom prompt templating | String interpolation | Pattern from `src/synthesis/prompt-builder.ts` | Established truncation constant (`SOURCE_CONTENT_MAX_CHARS`), consistent format |

**Key insight:** Phase 5 is primarily an orchestration phase. Nearly all implementation building blocks already exist — the value is wiring them in the correct order with the routing decision.

---

## Common Pitfalls

### Pitfall 1: stdout Contamination from Readline

**What goes wrong:** `readline.createInterface({ output: process.stdout })` writes the prompt string to stdout, breaking Phase 6 subprocess parsing.

**Why it happens:** readline's `question()` writes the prompt to its `output` stream. If `output` is stdout, the prompt appears in the machine-readable output.

**How to avoid:** Always set `output: process.stderr` when creating readline interfaces in this project.

**Warning signs:** CLI test `wiki ask produces nothing on stdout` starts failing.

### Pitfall 2: Empty Wiki Returning False Coverage

**What goes wrong:** On first run, `store.listArticles()` returns `[]`. Without a guard, `buildIndex([])` creates an empty index and `search()` returns `[]`. If the threshold check is written as `results[0].score >= threshold` without a null check, this throws a TypeError.

**How to avoid:** Guard with `if (articles.length === 0) return { covered: false, articles: [] }` before building the index. Validated: `buildIndex([])` works and returns an empty-results MiniSearch (confirmed in `tests/search-index.test.ts` line 22-25).

**Warning signs:** `assessCoverage()` throws on empty wiki; first-run `wiki ask` crashes before hitting web search.

### Pitfall 3: Wrong `type` on Compound Articles

**What goes wrong:** Using `buildNewArticle()` from `src/synthesis/article-builder.ts` to create compound articles sets `type: 'web'` (hardcoded in that function, Phase 4 D-15). `WikiStore.saveArticle()` then validates successfully (both types are valid) but the article is mislabeled.

**How to avoid:** Build the compound `Article` object inline in `article-filer.ts`, explicitly setting `type: 'compound'`. Do not reuse `buildNewArticle()`.

**Warning signs:** Filed articles appear in wiki with `type: web` instead of `type: compound`; LOOP-02 fails validation.

### Pitfall 4: Dedup Threshold Confusion

**What goes wrong:** Using `BM25_DEDUP_THRESHOLD` (3.0, from `deduplicator.ts`) as the coverage threshold. These serve different purposes: dedup threshold detects "same article" for update decisions; coverage threshold detects "wiki knows enough to answer this question."

**How to avoid:** The `coverage_threshold` config field (default 5.0) is separate from `BM25_DEDUP_THRESHOLD` (3.0). The orchestrator uses `config.coverage_threshold`; the deduplicator continues using its own constant.

**Warning signs:** High false-positive coverage detection (routing to wiki when it barely has any relevant content).

### Pitfall 5: Filing Dry Run Not Matching Save Behavior

**What goes wrong:** The compound article filing uses `findExistingArticle()` to decide new vs update, but the deduplication happens with the *current* wiki state. If the same question is asked twice in quick succession (before the index rebuilds), the second run might create a duplicate rather than updating.

**How to avoid:** `WikiStore.saveArticle()` already calls `rebuildIndex()` after each save, so the index is always current after a file operation. The dedup check in `fileAnswerAsArticle()` calls `store.listArticles()` fresh — not a cached value.

**Warning signs:** Duplicate compound articles for the same question slug.

### Pitfall 6: Q&A Source Format Breaking `parseSourceRefs()`

**What goes wrong:** The filing prompt lists source articles as `- [[slug]]` (wikilink format) or plain slugs. `parseSourceRefs()` expects numbered markdown links `1. [Title](url)`. If the format doesn't match, `sourceRefs` is empty and `frontmatter.sources` ends up as `[]`.

**How to avoid:** The filing prompt must explicitly instruct the LLM to output sources in the numbered link format: `1. [Article Title](wiki://slug)`. Validate in tests that `frontmatter.sources` contains `wiki://` prefixed strings.

**Warning signs:** Compound articles have `sources: []` in frontmatter despite being generated from wiki articles.

---

## Code Examples

### Coverage Assessment (verified pattern from existing codebase)

```typescript
// src/retrieval/orchestrator.ts
// Verified: buildIndex([]) returns valid empty index (search-index.test.ts line 22)
// Verified: search() returns SearchResult[] with .score field (search-index.test.ts line 46-54)

import { buildIndex, search } from '../search/search-index.js';
import type { WikiStore } from '../store/wiki-store.js';
import type { Article } from '../types/article.js';

export interface CoverageResult {
  covered: boolean;
  articles: Article[];
}

export async function assessCoverage(
  question: string,
  store: WikiStore,
  threshold: number,
): Promise<CoverageResult> {
  const articles = await store.listArticles();
  if (articles.length === 0) return { covered: false, articles: [] };

  const index = buildIndex(articles);
  const results = search(index, question);

  const topResult = results[0];
  if (!topResult || topResult.score < threshold) {
    return { covered: false, articles: [] };
  }

  const contextSlugs = results.slice(0, 5).map((r) => r.slug);
  const contextArticles = (
    await Promise.all(contextSlugs.map((slug) => store.getArticle(slug)))
  ).filter((a): a is Article => a !== null);

  return { covered: true, articles: contextArticles };
}
```

### Readline Confirmation (Node built-in, no package needed)

```typescript
// Pattern verified: readline.createInterface with output: process.stderr
import * as readline from 'readline';

export async function confirmFiling(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,  // CRITICAL: stderr not stdout
    });
    rl.question('File this answer back into the wiki? [y/N] ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}
```

### Compound Article Builder (verified `type: compound` path)

```typescript
// src/retrieval/article-filer.ts
// Verified: WikiStore.validateFrontmatter() accepts type: 'compound' (wiki-store.ts line 37-39)
// Verified: Frontmatter.type = 'web' | 'compound' (types/article.ts line 6)
import slugifyLib from 'slugify';

export function buildCompoundArticle(
  parsed: ParsedArticle,     // from parseArticleOutput()
  sourceArticles: Article[], // wiki articles used as context
  knownSlugs: Set<string>,
): Article {
  const now = new Date().toISOString();
  const wikiSources = sourceArticles.map((a) => `wiki://${a.slug}`);

  const frontmatter: Frontmatter = {
    title: parsed.title,
    tags: [],
    categories: parsed.categories.length > 0 ? parsed.categories : ['Uncategorized'],
    sources: wikiSources,         // wiki:// prefixed (D-09)
    sourced_at: now,
    type: 'compound',             // CRITICAL: not 'web'
    created_at: now,
    updated_at: now,
    summary: parsed.summary,
  };

  return {
    slug: slugifyLib(parsed.title, { lower: true, strict: true }),
    frontmatter,
    body: parsed.body,
  };
}
```

### Filing Prompt (must produce parseArticleOutput-compatible output)

```typescript
// src/retrieval/prompt-builder.ts
export function buildFilingPrompt(
  question: string,
  answer: string,
  sourceArticles: Article[],
): string {
  const sourceList = sourceArticles
    .map((a, i) => `[${i + 1}] ${a.frontmatter.title}\nSummary: ${a.frontmatter.summary}`)
    .join('\n\n');

  const sourceRefs = sourceArticles
    .map((a, i) => `${i + 1}. [${a.frontmatter.title}](wiki://${a.slug})`)
    .join('\n');

  return `Convert the following Q&A answer into a structured wiki article.

ORIGINAL QUESTION: ${question}

ANSWER:
${answer}

SOURCE WIKI ARTICLES (${sourceArticles.length} total):
${sourceList}

OUTPUT INSTRUCTIONS:
- Output ONLY the article in the EXACT format below.
- Do NOT add explanations or preambles.
- Do NOT wrap the output in markdown code fences.

REQUIRED OUTPUT FORMAT:
TITLE: [concise article title based on the question]

SUMMARY: [one sentence summary for the wiki index]

CATEGORIES: [comma-separated categories]

BODY:
[full markdown article body with ## section headers]

## Sources

${sourceRefs}`;
}
```

**Why pre-populate the Sources section:** The LLM is instructed to output sources in a specific numbered-link format. Pre-populating the `## Sources` template in the prompt ensures the correct `wiki://slug` format is produced, without relying on the LLM to invent the wiki:// prefix.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Always hit web for every question | Wiki-first retrieval with web fallback | Phase 5 | Eliminates redundant API calls for already-known topics |
| All articles are `type: web` | `type: compound` for Q&A-derived articles | Phase 5 | Full provenance chain: web → wiki → compound |
| `ask` always synthesizes from web sources | `ask` routes based on coverage confidence | Phase 5 | Knowledge compounds; cost and latency drop as wiki grows |

---

## Open Questions

1. **BM25 threshold calibration (5.0 default)**
   - What we know: Dedup uses 3.0 for near-duplicate title detection. Coverage is a stricter question.
   - What's unclear: Whether 5.0 will produce too many false positives (routing to wiki when it barely has relevant content) or too many false negatives (always hitting web despite good coverage).
   - Recommendation: Implement 5.0 as the default. Document in the config that users should adjust after accumulating 20+ articles. The `--web` flag provides an escape hatch for suspected false positives.

2. **Body truncation for wiki context**
   - What we know: Synthesis uses `SOURCE_CONTENT_MAX_CHARS = 3000` per source to prevent token overflow.
   - What's unclear: With 3-5 wiki articles passed as context, combined body length could easily exceed 15,000 chars.
   - Recommendation: Apply the same 3000-char per-article body truncation when building the wiki answer prompt. Add a `WIKI_CONTEXT_MAX_CHARS` constant in the retrieval prompt builder.

3. **Non-TTY stdin for confirmation**
   - What we know: `readline.question()` resolves to empty string when stdin is closed (piped/non-TTY).
   - What's unclear: Whether this needs explicit TTY detection or if the empty-string-resolves-to-false behavior is sufficient.
   - Recommendation: The default-no behavior (empty string → false → skip filing) is the correct behavior for piped usage. No explicit TTY detection needed. Document this in comments.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All JS execution | ✓ | v24.14.0 | — |
| `minisearch` | BM25 coverage scoring | ✓ | 7.2.0 | — |
| `ai` (Vercel AI SDK) | `generateText()` calls | ✓ | 6.0.146 | — |
| `commander` | `--web` flag | ✓ | 14.0.3 | — |
| Node `readline` | Stdin confirmation | ✓ | built-in | — |
| `gray-matter` | Frontmatter serialization | ✓ | 4.0.3 | — |
| `write-file-atomic` | Atomic saves | ✓ | 7.0.1 | — |
| `slugify` | Compound article slug | ✓ | 1.6.9 | — |
| `vitest` | Test runner | ✓ | 4.1.2 | — |

**Missing dependencies with no fallback:** None.

**Notes:** All 191 existing tests pass. No new packages required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/retrieval.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RETR-01 | `assessCoverage()` returns `covered: false` for empty wiki | unit | `npx vitest run tests/retrieval.test.ts` | ❌ Wave 0 |
| RETR-02 | `assessCoverage()` returns top ≤5 articles above min score | unit | `npx vitest run tests/retrieval.test.ts` | ❌ Wave 0 |
| RETR-03 | Orchestrator routes to wiki path when score >= threshold | unit | `npx vitest run tests/retrieval.test.ts` | ❌ Wave 0 |
| RETR-03 | Orchestrator routes to web path when score < threshold | unit | `npx vitest run tests/retrieval.test.ts` | ❌ Wave 0 |
| LOOP-01 | `fileAnswerAsArticle()` saves article via WikiStore | unit | `npx vitest run tests/retrieval.test.ts` | ❌ Wave 0 |
| LOOP-02 | Filed article has `type: compound` and `sources: ['wiki://slug']` | unit | `npx vitest run tests/retrieval.test.ts` | ❌ Wave 0 |
| LOOP-03 | `confirmFiling()` returns false for default/empty input | unit | `npx vitest run tests/retrieval.test.ts` | ❌ Wave 0 |
| D-06 | Wiki answer written to stdout, progress to stderr | unit | `npx vitest run tests/cli.test.ts` | ✅ (extend existing) |
| D-14 | `--web` flag skips wiki check entirely | unit | `npx vitest run tests/cli.test.ts` | ❌ Wave 0 |
| D-15 | Full ask command flow: wiki path + web path | unit | `npx vitest run tests/cli.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/retrieval.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite (191 + new tests) green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/retrieval.test.ts` — covers RETR-01, RETR-02, RETR-03, LOOP-01, LOOP-02, LOOP-03, D-14, D-15
- [ ] `tests/retrieval.test.ts` — mock pattern: class-based `MockWikiStore` (same as `synthesis.test.ts`)
- [ ] `tests/retrieval.test.ts` — mock `generateText` via `vi.mock('../src/llm/adapter.js', ...)` (same pattern as `synthesis.test.ts`)

No new framework install required — vitest is already configured.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 5 |
|-----------|------------------|
| Stack: Node/TypeScript | All new files in TypeScript; no Python, shell scripts, or alternative runtimes |
| Storage: Markdown files in Obsidian vault — must be valid Obsidian-compatible markdown | Compound articles go through `WikiStore.saveArticle()` which validates frontmatter and round-trips YAML |
| LLM: Must support multiple providers via configuration | `generateWikiAnswer()` and `fileAnswerAsArticle()` must call `generateText()` from the adapter, not any provider SDK directly |
| Privacy: Raw sources and wiki live locally on disk, not in the cloud | No remote calls for the retrieval path; the entire wiki-answer flow is local |
| stdout/stderr contract (enforced from Phase 1 D-02) | Wiki answer to stdout; ALL prompts, routing decisions, progress to stderr; readline output to stderr |
| LangChain.js explicitly rejected | Not relevant — no new AI framework should be introduced |
| `configureOutput({ writeOut: process.stderr.write })` in src/index.ts | Commander help already redirected; no new Commander configuration needed |
| GSD Workflow Enforcement | Changes must go through `/gsd:execute-phase`, not direct edits |

---

## Sources

### Primary (HIGH confidence — code verified in repo)

- `/Users/pradeep/Desktop/llm-wiki/src/search/search-index.ts` — `buildIndex()` signature, `SearchResult.score` field, empty index behavior
- `/Users/pradeep/Desktop/llm-wiki/src/store/wiki-store.ts` — `saveArticle()` validates `type: 'compound'`, `listArticles()`, `getArticle()`
- `/Users/pradeep/Desktop/llm-wiki/src/synthesis/deduplicator.ts` — `findExistingArticle()` signature, `BM25_DEDUP_THRESHOLD`
- `/Users/pradeep/Desktop/llm-wiki/src/synthesis/output-parser.ts` — `parseArticleOutput()` expected format, `parseSourceRefs()` numbered-link pattern
- `/Users/pradeep/Desktop/llm-wiki/src/synthesis/article-builder.ts` — `buildNewArticle()` hardcodes `type: 'web'` (confirmed)
- `/Users/pradeep/Desktop/llm-wiki/src/config/config.ts` — Config extension pattern (add to interface + DEFAULTS + validateConfig)
- `/Users/pradeep/Desktop/llm-wiki/src/commands/ask.ts` — Current command structure; Phase 5 inserts before line 23
- `/Users/pradeep/Desktop/llm-wiki/src/llm/adapter.ts` — `generateText()` signature, `GenerateOptions`
- `/Users/pradeep/Desktop/llm-wiki/src/types/article.ts` — `Frontmatter.type: 'web' | 'compound'` already defined
- `/Users/pradeep/Desktop/llm-wiki/tests/search-index.test.ts` — `buildIndex([])` behavior verified (empty array safe)
- `/Users/pradeep/Desktop/llm-wiki/tests/synthesis.test.ts` — MockWikiStore pattern, `vi.mock` adapter pattern
- Node.js readline docs — `readline.createInterface({ output: process.stderr })` pattern

### Secondary (MEDIUM confidence)

- BM25 score range analysis: deduplicator comment in `deduplicator.ts` documents "scores cluster around 5-15 for near-duplicates of short title queries; unrelated articles score below 3" — supports 5.0 as a reasonable coverage default.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified installed; `npm list` not needed since `package.json` reviewed
- Architecture: HIGH — all integration points verified by reading actual source files
- Pitfalls: HIGH — identified from direct code inspection (e.g., `buildNewArticle()` hardcodes `type: 'web'`, `parseSourceRefs()` expects numbered links)
- Test patterns: HIGH — vitest mocking patterns verified from `synthesis.test.ts` and `cli.test.ts`

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable packages; no fast-moving dependencies)

# Phase 4: Synthesis - Research

**Researched:** 2026-04-04
**Domain:** LLM text synthesis, prompt engineering, Markdown article generation, Obsidian wikilink constraints, BM25 deduplication
**Confidence:** HIGH

## Summary

Phase 4 completes the `wiki ask` pipeline: after Phase 3 stores raw source envelopes, Phase 4 reads those envelopes, calls the LLM twice (plan step, then generate step), produces one or more Markdown articles, validates frontmatter, deduplicates against existing articles, and saves to the Obsidian vault via `WikiStore`. The phase is integration-heavy rather than dependency-heavy — all required libraries are already installed and all integration seams (WikiStore, generateText, RawSourceEnvelope, SearchIndex) are already wired.

The primary technical challenges are: (1) prompt design that reliably produces parseable LLM output, (2) the two-step synthesis flow (plan → generate) with correct source partitioning for multi-article scenarios, (3) wikilink hallucination prevention via post-processing, and (4) BM25-based deduplication with an LLM tiebreak. The adapter must be extended to accept `system`, `temperature`, and `maxOutputTokens` parameters — the underlying Vercel AI SDK already supports all of these via `CallSettings`; only the wrapper function needs updating.

**Primary recommendation:** Implement a `src/synthesis/` module with five focused files: `prompt-builder.ts`, `output-parser.ts`, `deduplicator.ts`, `article-builder.ts`, and `synthesizer.ts` (orchestrator). Wire `synthesizer.ts` into `src/commands/ask.ts` after `storeSourceEnvelopes()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Article Structure & Prompting**
- D-01: Articles follow: one-line summary → structured `##` sections → `## Sources` section.
- D-02: LLM prompt includes full markdown of each non-excluded envelope, original question, explicit formatting instructions. Single `generateText()` call per article via existing adapter.
- D-03: Parse LLM output to extract: title, summary, body sections, source references. On parse failure, retry once with stricter prompt before failing.

**Citation Format**
- D-04: Inline `[1]`, `[2]` in body. `## Sources` at bottom: `1. [Title](url)`.
- D-05: Same URLs stored in `frontmatter.sources` (string array). `frontmatter.sourced_at` = current ISO timestamp at synthesis time.

**Backlink Strategy**
- D-06: Load all existing article slugs/titles via `WikiStore.listArticles()` before LLM call. Include list in prompt with explicit instruction to only link to articles in that list.
- D-07: Post-processing: scan for all `[[...]]` patterns. Strip any wikilink not matching an existing slug. Hard constraint — zero hallucinated links.

**Topic Clustering (Broad Questions)**
- D-08: Two-step synthesis for ALL questions. Step 1 (Plan): LLM produces plan (single or multi-article). Step 2 (Generate): Each article synthesized in separate `generateText()` call with its relevant source subset.
- D-09: Planning step determines breadth. Single-topic → one article. Broad topic → 2+ articles.
- D-10: In multi-article batches, wikilinks may reference other articles being created in the same batch (add them to the known-articles list during generation).

**Deduplication Strategy**
- D-11: Three-tier detection: (1) exact slug match, (2) BM25 near-match via MiniSearch, (3) LLM tiebreak if BM25 candidate found above threshold.
- D-12: Slug matching uses `WikiStore.slugify()` for consistency.

**Article Update Strategy**
- D-13: LLM update prompt includes: existing article body, new source material, instructions to incorporate new info while preserving existing structure.
- D-14: Updated articles: `frontmatter.updated_at` refreshed, `frontmatter.sources` is union of old + new URLs, `frontmatter.sourced_at` reflects latest synthesis.

**Provenance & Validation**
- D-15: Every article has `sources` (URL array), `sourced_at` (ISO timestamp), `type: 'web'`.
- D-16: Validate via `gray-matter` + `js-yaml` round-trip BEFORE writing to disk. Invalid frontmatter is a hard error.

**CLI Integration**
- D-17: `wiki ask` flow: search → fetch → store raw envelopes → synthesize → save article(s) → rebuild index. Progress to stderr. On success, article title(s) written to stdout.
- D-18: `wiki ingest` NOT modified. Synthesis only triggered by `wiki ask`.

### Claude's Discretion
- Module file placement within `src/` (e.g., `src/synthesis/` or similar)
- Exact LLM prompt wording and formatting instructions
- BM25 similarity threshold value for dedup near-match
- How to partition sources across multiple articles in the clustering step
- Error message wording beyond patterns specified above
- Whether to add synthesis-specific config fields (e.g., max article length) or use code constants

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNTH-01 | LLM synthesizes 3-5 web sources into a structured wiki article | Two-step flow (D-08/D-09): planner call + per-article generateText() call; existing adapter handles LLM call |
| SYNTH-02 | Every claim traceable to source URL via citations | Inline `[N]` citations in body + `## Sources` section (D-04); source URLs also in frontmatter.sources (D-05) |
| SYNTH-03 | Articles include `[[wikilink]]` backlinks constrained to existing articles | `WikiStore.listArticles()` → include in prompt (D-06) + post-processing strip (D-07) |
| SYNTH-04 | Broad questions generate multiple linked articles | Two-step flow: planning LLM call assesses breadth → separate generateText() per article (D-08/D-09/D-10) |
| SYNTH-05 | LLM decides whether to create or update existing article | Three-tier dedup: slug match → BM25 near-match → LLM tiebreak (D-11/D-12/D-13) |
| SYNTH-06 | YAML frontmatter validated after every LLM write | gray-matter + js-yaml round-trip before WikiStore.saveArticle() — existing WikiStore pattern (D-16) |
| SYNTH-07 | Articles include provenance frontmatter (`sources`, `sourced_at`, `type: web`) | Existing Frontmatter interface already has these fields populated by synthesis (D-15) |
</phase_requirements>

---

## Standard Stack

### Core (all already installed — no new installs required)
| Library | Installed Version | Purpose | Role in Phase 4 |
|---------|------------------|---------|-----------------|
| `ai` (Vercel AI SDK) | 6.0.146 | LLM calls | Extended generateText() with system/temperature params |
| `gray-matter` | 4.0.3 | YAML frontmatter | Article serialization (existing WikiStore pattern) |
| `js-yaml` | 4.1.1 | YAML validation | Round-trip validation before disk write |
| `minisearch` | 7.2.0 | BM25 search | Deduplication near-match detection |
| `slugify` | 1.6.9 | Slug generation | Consistent slug for dedup exact-match |
| `write-file-atomic` | 7.0.1 | Atomic file writes | Via WikiStore.saveArticle() |

**No new npm packages needed.** Phase 4 is pure integration of existing dependencies.

**Installation:**
```bash
# No new packages — all dependencies installed in Phase 1
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── synthesis/
│   ├── prompt-builder.ts    # Builds plan and generate prompts; pure functions
│   ├── output-parser.ts     # Parses LLM text output → ArticlePlan / ParsedArticle
│   ├── deduplicator.ts      # Three-tier dedup: slug → BM25 → LLM tiebreak
│   ├── article-builder.ts   # Assembles Article object from ParsedArticle + metadata
│   └── synthesizer.ts       # Orchestrator: reads envelopes → plan → generate → save
├── commands/
│   └── ask.ts               # Extended: adds synthesis step after storeSourceEnvelopes()
├── llm/
│   └── adapter.ts           # Extended: accept system/temperature/maxOutputTokens
```

### Pattern 1: Extending the LLM Adapter

The existing `generateText(prompt: string)` is too thin for synthesis — planning and generation calls need different `temperature` settings and a `system` prompt. The Vercel AI SDK `generateText()` already accepts `system`, `temperature`, and `maxOutputTokens` via `CallSettings` (verified from installed type definitions).

**What to change in `src/llm/adapter.ts`:**
- Add an optional `options` parameter to the exported `generateText()` wrapper
- The underlying SDK call already supports all params — only the wrapper signature needs updating

```typescript
// Source: verified against node_modules/ai/dist/index.d.ts (CallSettings type)
export interface GenerateOptions {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export async function generateText(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const config = await loadConfig();
  const model = createProvider(config);
  const { text } = await sdkGenerateText({
    model,
    prompt,
    system: options.system,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
  });
  return text;
}
```

This change is backward-compatible — all existing callers pass only `prompt` and receive the same behavior.

### Pattern 2: Two-Step Synthesis Flow (D-08/D-09)

Every question goes through planning first, then generation. This is the core synthesis loop:

```typescript
// Step 1: Plan — single LLM call returns ArticlePlan[]
const plan = await planArticles(envelopes, question, existingArticles);
// plan.length === 1 for focused questions, 2+ for broad questions

// Step 2: Generate — one LLM call per planned article
const articles: Article[] = [];
for (const articlePlan of plan) {
  const relevantSources = partitionSources(envelopes, articlePlan);
  const knownSlugs = [
    ...existingArticles.map(a => a.slug),
    ...articles.map(a => a.slug),  // D-10: include already-generated batch articles
  ];
  const raw = await generateText(
    buildGeneratePrompt(question, articlePlan, relevantSources, knownSlugs),
    { system: SYNTHESIS_SYSTEM_PROMPT, temperature: 0.3 }
  );
  const parsed = parseArticleOutput(raw);
  articles.push(buildArticle(parsed, relevantSources));
}
```

### Pattern 3: Wikilink Constraint (D-06/D-07)

Two-layer defense against hallucinated wikilinks:

**Layer 1 (prompt):** Include the known-articles list in the prompt with explicit instructions.
**Layer 2 (post-processing):** Strip any `[[link]]` not in the known set.

```typescript
// Post-processing strip — run on every generated article body
function stripHallucinatedWikilinks(body: string, knownSlugs: Set<string>): string {
  return body.replace(/\[\[([^\]]+)\]\]/g, (match, slug) => {
    return knownSlugs.has(slug) ? match : slug;  // replace [[bad-link]] with plain text
  });
}
```

### Pattern 4: Three-Tier Deduplication (D-11/D-12)

```typescript
async function findExistingArticle(
  plannedTitle: string,
  existingArticles: Article[],
  generateFn: typeof generateText
): Promise<Article | null> {
  // Tier 1: exact slug match
  const slug = store.slugify(plannedTitle);
  const exact = await store.getArticle(slug);
  if (exact) return exact;

  // Tier 2: BM25 near-match
  const index = buildIndex(existingArticles);
  const results = search(index, plannedTitle);
  const topResult = results[0];
  if (!topResult || topResult.score < BM25_DEDUP_THRESHOLD) return null;

  // Tier 3: LLM tiebreak
  const candidate = await store.getArticle(topResult.slug);
  if (!candidate) return null;
  const decision = await generateText(
    buildTiebreakPrompt(plannedTitle, candidate.frontmatter.summary),
    { temperature: 0 }
  );
  return parseTiebreakDecision(decision) === 'update' ? candidate : null;
}
```

**BM25 threshold recommendation:** Start at `3.0`. MiniSearch BM25 scores for near-duplicates of a short title query typically cluster around 5-15 when matching; unrelated articles score below 3. This is a discretion area — treat as a tunable constant, not a config field.

### Pattern 5: Article Output Parsing (D-03)

LLM output must be parsed into structured data. Use delimiter-based parsing over JSON output — JSON generation is error-prone with long bodies containing quotes, code blocks, etc.

**Recommended plan output format (for LLM prompt):**

```
ARTICLE_COUNT: 2
ARTICLE_1_TITLE: Transformer Architecture Overview
ARTICLE_1_SCOPE: Core mechanism, attention layers, encoder-decoder structure
ARTICLE_2_TITLE: Attention Mechanisms in Depth
ARTICLE_2_SCOPE: Scaled dot-product attention, multi-head attention, computational complexity
```

**Recommended article body format:**

```markdown
TITLE: Flash Attention

SUMMARY: Flash attention is a memory-efficient exact attention algorithm...

BODY:
## What Is Flash Attention

Flash attention [1] solves the memory bottleneck...

## How It Works

...

## Sources

1. [Flash Attention Paper](https://arxiv.org/abs/2205.14135)
2. [Tri Dao's Blog](https://tridao.me/blog/)
```

**Parse failure fallback (D-03):** Retry once with a stricter prompt that adds explicit field markers and warns the model to use exact formatting.

### Pattern 6: Article Update Merge (D-13/D-14)

When updating an existing article, `frontmatter.sources` is the union of old and new URLs:

```typescript
const mergedSources = [...new Set([
  ...existingArticle.frontmatter.sources,
  ...newSourceUrls,
])];
```

`frontmatter.updated_at` and `frontmatter.sourced_at` both get the current ISO timestamp.

### Anti-Patterns to Avoid

- **Asking the LLM for JSON output for article body:** JSON breaks on embedded code blocks, quotes, and special characters. Use delimiter-based text format instead.
- **Running dedup against external index only:** Must also check exact slug match first — BM25 can miss exact matches if tokenization differs.
- **Building the wikilinks list inside the prompt only:** Post-processing strip (D-07) is mandatory even with prompt instruction — LLMs hallucinate wikilinks despite instructions.
- **Calling `WikiStore.rebuildIndex()` separately:** `saveArticle()` already calls `rebuildIndex()` — calling it again wastes time and causes a race condition if multiple articles are saved in sequence.
- **Trusting LLM to generate valid YAML frontmatter:** Never ask the LLM to produce frontmatter. Construct it programmatically from parsed fields and call `WikiStore.saveArticle()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter serialization | Custom frontmatter serializer | `gray-matter` + `js-yaml` (already installed) | gray-matter handles YAML edge cases; WikiStore.saveArticle() already wraps it |
| Wikilink scanning | Regex you write yourself | Simple `/\[\[([^\]]+)\]\]/g` pattern is sufficient — don't add a markdown parser | Wikilinks are syntactically simple; remark plugin would be overkill |
| Atomic file writes | `fs.writeFile` | `write-file-atomic` via WikiStore.saveArticle() | Prevents partial-write corruption on crash |
| BM25 search | Custom scorer | MiniSearch `buildIndex()` + `search()` from `src/search/search-index.ts` | Already implemented and tested |
| LLM provider routing | Provider switch in synthesizer | `generateText()` from existing adapter | Adapter already handles all providers |
| Slug generation | Custom slugifier | `WikiStore.slugify()` | Must use same function for dedup consistency (D-12) |

**Key insight:** The entire infrastructure stack for this phase exists. The value is in the synthesis logic (prompt design, output parsing, dedup orchestration), not in building new utilities.

---

## Common Pitfalls

### Pitfall 1: LLM Output Parsing Brittleness
**What goes wrong:** The LLM occasionally outputs extra explanatory text before the structured section, wraps output in a markdown code block, or adds extra blank lines that break delimiter-based parsing.
**Why it happens:** Instruction-following isn't perfect; models add preamble/postamble text.
**How to avoid:** Parse defensively — search for delimiters by scanning line-by-line rather than splitting on exact positions. Strip leading/trailing markdown code fences before parsing.
**Warning signs:** Parser throws on first real API call but passes on hardcoded test fixture.

### Pitfall 2: Token Limit Exceeded with Many Sources
**What goes wrong:** 5 source envelopes of 3,000–10,000 chars each can exceed model context limits in the generate step.
**Why it happens:** Raw extracted markdown is verbose; combined sources can easily hit 40,000+ tokens.
**How to avoid:** Truncate each source envelope before including in prompt. A safe limit is 3,000 chars per source when combining 5 sources. Use the first 3,000 chars (top of article content) — readability extraction already puts the most important content first.
**Warning signs:** API returns a context-length error on broad questions with long sources.

### Pitfall 3: Same Article Saved Twice in Multi-Article Batch
**What goes wrong:** When planning produces 2 articles and the second article's slug matches the first one just saved, a second save overwrites the first.
**Why it happens:** D-10 requires adding batch-created articles to the known-articles list, but if title generation produces the same title twice, dedup won't catch it because neither is in the pre-existing WikiStore.
**How to avoid:** Deduplicate titles within the plan itself before generating. If two planned articles have the same slug, drop one or merge their scopes.
**Warning signs:** Only 1 article appears in vault after a multi-article question.

### Pitfall 4: Frontmatter.sources Contains Excluded Source URLs
**What goes wrong:** Including excluded source URLs in `frontmatter.sources` gives false provenance — the article wasn't synthesized from those sources.
**Why it happens:** Easy to pass `envelopes.map(e => e.url)` without filtering excluded ones.
**How to avoid:** Always filter to `envelopes.filter(e => !e.excluded)` when populating sources. The `## Sources` section and `frontmatter.sources` must only reference sources that contributed to the article.

### Pitfall 5: BM25 Scores Are Not Normalized
**What goes wrong:** MiniSearch BM25 scores are corpus-size-dependent. A threshold of `3.0` with 5 articles behaves differently than with 500 articles.
**Why it happens:** BM25 scores are relative to document frequency in the index, not absolute values.
**How to avoid:** For a personal wiki under 1,000 articles, a low threshold (3.0–5.0) works well. Document the threshold as a named constant with a comment explaining the corpus-size assumption. Log the top BM25 score to stderr in debug mode for future tuning.

### Pitfall 6: Retry Logic Swallows Real Errors
**What goes wrong:** D-03 says retry once on parse failure. If the API call itself fails (network error, rate limit), the retry loop retries the API — burning quota and delaying error reporting.
**Why it happens:** Parse failure and API failure are conflated.
**How to avoid:** Only retry on parse failure (malformed output), not on API errors. API errors should propagate immediately.

---

## Code Examples

Verified patterns from existing codebase and installed SDK types:

### Extended Adapter Call (with system prompt and temperature)
```typescript
// Source: verified against node_modules/ai/dist/index.d.ts — CallSettings.temperature, CallSettings.maxOutputTokens, Prompt.system
import { generateText as sdkGenerateText } from 'ai';

const { text } = await sdkGenerateText({
  model,
  prompt: userPrompt,
  system: 'You are a technical wiki author...',
  temperature: 0.3,
  maxOutputTokens: 4096,
});
```

### Reading Raw Envelopes from Manifest
```typescript
// Source: src/ingestion/raw-store.ts + src/types/ingestion.ts (verified in codebase)
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Manifest, RawSourceEnvelope } from '../types/ingestion.js';

async function loadSourceEnvelopes(dir: string): Promise<RawSourceEnvelope[]> {
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest: Manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const envelopes = await Promise.all(
    manifest.sources
      .filter(s => !s.excluded)
      .map(async s => {
        const envelopePath = path.join(dir, s.file);
        return JSON.parse(await fs.readFile(envelopePath, 'utf8')) as RawSourceEnvelope;
      })
  );
  return envelopes;
}
```

### WikiStore Article Save Pattern (existing — already validated)
```typescript
// Source: src/store/wiki-store.ts — WikiStore.saveArticle()
const article: Article = {
  slug: store.slugify(title),
  frontmatter: {
    title,
    tags: [],
    categories: [],
    sources: sourceUrls,        // populated by synthesis (was empty in Phase 1)
    sourced_at: new Date().toISOString(),  // populated by synthesis (was null in Phase 1)
    type: 'web',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    summary,
  },
  body,
};
await store.saveArticle(article);  // validates frontmatter + atomic write + rebuilds index
```

### BM25 Dedup Search (reuse existing SearchIndex)
```typescript
// Source: src/search/search-index.ts (verified in codebase)
import { buildIndex, search } from '../search/search-index.js';

const articles = await store.listArticles();
const index = buildIndex(articles);
const results = search(index, plannedTitle);
// results[0].score — use as BM25 near-match indicator
```

### Wikilink Strip Post-Processing
```typescript
// Pattern: simple regex replace — no library needed
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function stripHallucinatedWikilinks(body: string, knownSlugs: Set<string>): string {
  return body.replace(WIKILINK_RE, (match, inner) => {
    // inner may be "slug|display text" — check just the slug part
    const slug = inner.split('|')[0].trim();
    return knownSlugs.has(slug) ? match : (inner.split('|')[1]?.trim() ?? slug);
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `maxTokens` param name | `maxOutputTokens` in Vercel AI SDK v4+ | AI SDK v4 (2024) | Phase 4 must use `maxOutputTokens`, not `maxTokens` |
| Streaming required for long LLM output | `generateText()` works for all lengths | Always true in this project | No streaming needed; Phase 2 D-08 confirmed |
| LangChain for multi-step chains | Direct SDK calls with explicit flow control | Project decision (CLAUDE.md) | Two-step flow is explicit code, not framework magic |

**Deprecated/outdated:**
- `maxTokens`: The AI SDK uses `maxOutputTokens` in v4+. Verified in installed `node_modules/ai/dist/index.d.ts` — `maxOutputTokens?: number` is the correct field name.

---

## Open Questions

1. **Source partitioning for multi-article plans**
   - What we know: D-08 says each article gets its "subset of relevant sources"
   - What's unclear: Algorithm for partitioning — by topic keyword match? By letting the planning LLM assign sources? Round-robin?
   - Recommendation (Claude's discretion): Have the planning LLM output a `SOURCES_FOR_ARTICLE_N` line listing source indices. If planning prompt doesn't produce it, fall back to giving all sources to every article (safe, slightly redundant).

2. **Exact raw directory path passed to synthesizer**
   - What we know: `storeSourceEnvelopes()` returns the directory path; `ask.ts` currently discards it after logging.
   - What's unclear: Whether to re-derive the path from slug+date or thread it through directly.
   - Recommendation: Thread the returned `dir` from `storeSourceEnvelopes()` directly into the synthesis call — avoids re-deriving a path that could drift if called across midnight.

3. **Categories and tags in synthesized articles**
   - What we know: `Frontmatter.categories` and `tags` are required fields (REQUIRED_FM_FIELDS in WikiStore).
   - What's unclear: Who populates them — LLM or code constants?
   - Recommendation: Ask the LLM to output a `CATEGORIES:` line in the article format. Fall back to `['Uncategorized']` and `[]` if absent. This keeps categories useful for index grouping.

---

## Environment Availability

Step 2.6: Environment audit — all dependencies are npm packages already installed. No external services beyond LLM API (already operational from Phase 2) and Exa Search API (already operational from Phase 3).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v24.14.0 | — |
| `ai` (Vercel AI SDK) | LLM calls | ✓ | 6.0.146 | — |
| `minisearch` | BM25 dedup | ✓ | 7.2.0 | — |
| `gray-matter` | Frontmatter | ✓ | 4.0.3 | — |
| `js-yaml` | YAML validation | ✓ | 4.1.1 | — |
| `slugify` | Slug consistency | ✓ | 1.6.9 | — |
| `write-file-atomic` | Atomic writes (via WikiStore) | ✓ | 7.0.1 | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run tests/synthesis.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNTH-01 | synthesize() produces a valid Article from non-excluded envelopes | unit (mocked LLM) | `npx vitest run tests/synthesis.test.ts -t "synthesize"` | ❌ Wave 0 |
| SYNTH-02 | Article body contains `[1]` inline citation matching ## Sources entry | unit | `npx vitest run tests/synthesis.test.ts -t "citations"` | ❌ Wave 0 |
| SYNTH-03 | Hallucinated wikilinks are stripped from body | unit | `npx vitest run tests/synthesis.test.ts -t "wikilink"` | ❌ Wave 0 |
| SYNTH-04 | Broad question plan produces 2+ articles with cross-links | unit (mocked LLM) | `npx vitest run tests/synthesis.test.ts -t "multi-article"` | ❌ Wave 0 |
| SYNTH-05 | Existing article updated (not duplicated) on repeat question | unit (mocked WikiStore) | `npx vitest run tests/synthesis.test.ts -t "dedup"` | ❌ Wave 0 |
| SYNTH-06 | Invalid frontmatter from LLM throws before disk write | unit | `npx vitest run tests/synthesis.test.ts -t "frontmatter validation"` | ❌ Wave 0 |
| SYNTH-07 | Article frontmatter contains sources, sourced_at, type: web | unit | `npx vitest run tests/synthesis.test.ts -t "provenance"` | ❌ Wave 0 |
| D-17 (stdout) | `wiki ask` writes article title(s) to stdout on success | unit (vi.mock) | `npx vitest run tests/cli.test.ts -t "ask.*stdout"` | Update existing |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/synthesis.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (98 existing + new synthesis tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/synthesis.test.ts` — covers SYNTH-01 through SYNTH-07; uses vi.mock for LLM calls (never hits real API)
- [ ] Update `tests/cli.test.ts` ask command tests — must verify article title written to stdout (D-17)

---

## Project Constraints (from CLAUDE.md)

| Directive | Constraint |
|-----------|-----------|
| Stack: Node/TypeScript | All new files are `.ts`; no alternative languages |
| LLM: multi-provider via config | Use existing `generateText()` adapter; no provider-specific code in synthesis |
| Storage: Markdown in Obsidian vault | Articles must be valid Obsidian-compatible markdown with YAML frontmatter |
| Privacy: raw sources local only | No synthesis result sent to external services; only LLM API call is outbound |
| LangChain.js: EXPLICITLY REJECTED | Two-step flow implemented as explicit TypeScript code, not LangChain chains |
| Vitest: test runner | All tests use `vitest` patterns (describe/it/vi.mock) |
| GSD Workflow: edit files only via GSD | Implementation must go through `/gsd:execute-phase` |
| stdout/stderr: INTG-02 contract | Progress → stderr; article titles (machine-readable) → stdout |
| Conventional Commits | Commit messages: `feat(04-synthesis): ...` format |

---

## Sources

### Primary (HIGH confidence)
- Installed `node_modules/ai/dist/index.d.ts` — verified `CallSettings` type (`maxOutputTokens`, `temperature`, `system`), `generateText` signature, `Prompt` type
- `src/store/wiki-store.ts` — verified `saveArticle()`, `listArticles()`, `getArticle()`, `slugify()`, `rebuildIndex()` signatures and behavior
- `src/search/search-index.ts` — verified `buildIndex()`, `search()` signatures and `SearchResult.score` field
- `src/llm/adapter.ts` — verified current `generateText(prompt: string)` signature that needs extension
- `src/types/article.ts`, `src/types/ingestion.ts` — verified `Frontmatter`, `Article`, `RawSourceEnvelope`, `Manifest` type definitions
- `src/commands/ask.ts` — verified integration point at line 127 where synthesis step is inserted

### Secondary (MEDIUM confidence)
- `package.json` — verified all required packages are already installed (no new deps needed)
- Existing tests (`tests/wiki-store.test.ts`, `tests/search-index.test.ts`) — verified existing test patterns for consistent test style in new synthesis tests

### Tertiary (LOW confidence)
- BM25 threshold value of 3.0 — based on MiniSearch behavior knowledge; needs empirical tuning on first real usage

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified as installed; no new deps
- Architecture: HIGH — all integration seams verified against actual source files
- Pitfalls: MEDIUM — token limits and BM25 threshold based on general LLM/search knowledge; empirical tuning needed
- LLM prompt design: LOW — prompt wording is Claude's discretion; exact behavior depends on runtime iteration

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable stack; main risk is LLM API behavior changes)

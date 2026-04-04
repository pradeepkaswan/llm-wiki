# Phase 4: Synthesis - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the LLM synthesis pipeline that turns raw source envelopes (from Phase 3) into structured Obsidian wiki articles. Each article includes inline citations traceable to source URLs, `[[wikilinks]]` constrained to existing articles, provenance frontmatter (`sources`, `sourced_at`, `type: web`), and YAML validation. Broad questions produce multiple linked articles covering distinct sub-concepts. Repeated questions update existing articles instead of creating duplicates. The `wiki ask` command completes its full journey in this phase: question → search → fetch → synthesize → wiki article.

</domain>

<decisions>
## Implementation Decisions

### Article Structure & Prompting
- **D-01:** Synthesized articles follow a consistent structure: one-line summary (used for `frontmatter.summary` and index.md), then structured sections with `##` headers covering distinct aspects of the topic, then a `## Sources` section listing all cited URLs.
- **D-02:** The LLM prompt includes the full markdown content of each non-excluded source envelope, the original question, and explicit formatting instructions. The prompt is a single `generateText()` call through the existing adapter.
- **D-03:** The LLM output is parsed to extract: article title, summary, body sections, and source references. If parsing fails (LLM returns malformed output), retry once with a stricter prompt before failing.

### Citation Format
- **D-04:** Inline numbered references `[1]`, `[2]` appear in the article body where claims are sourced. A `## Sources` section at the bottom maps numbers to full URLs: `1. [Title](url)`.
- **D-05:** The same source URLs are stored in `frontmatter.sources` as a string array (per Phase 1 D-07 schema). `frontmatter.sourced_at` is set to the current ISO timestamp when the article is synthesized.

### Backlink Strategy
- **D-06:** Before calling the LLM, load all existing article slugs and titles via `WikiStore.listArticles()`. Include this list in the prompt with an explicit instruction: "You may link to these existing articles using `[[slug]]` syntax. Do NOT create links to articles not in this list."
- **D-07:** Post-processing validation: after LLM output, scan for all `[[...]]` patterns. Any wikilink not matching an existing article slug is stripped (replaced with plain text). This is a hard constraint — zero hallucinated links.

### Topic Clustering (Broad Questions)
- **D-08:** Two-step synthesis for all questions. Step 1 (Plan): LLM receives the sources and question, outputs a structured plan — either a single article with sections, or multiple articles each with a title and scope. Step 2 (Generate): Each planned article is synthesized in a separate `generateText()` call with its subset of relevant sources.
- **D-09:** The planning step uses a lightweight prompt asking the LLM to assess topic breadth. Single-topic questions (e.g., "What is flash attention?") produce one article. Broad questions (e.g., "Explain transformer architecture") produce 2+ articles with cross-links between them.
- **D-10:** When multiple articles are generated, each article's wikilinks can reference the other articles being created in the same batch (they're added to the known-articles list during generation).

### Deduplication Strategy
- **D-11:** Before synthesis, check for existing articles that cover the same topic. Three-tier detection:
  1. **Exact slug match** — slugify the planned article title, check if `articles/<slug>.md` exists → definite update
  2. **BM25 near-match** — search existing articles using the planned title as query via MiniSearch. If top result scores above threshold → candidate match
  3. **LLM tiebreak** — when a BM25 candidate is found, the LLM receives the existing article's summary and the new sources to decide: update existing or create new
- **D-12:** Slug matching uses the same `slugify()` function from WikiStore to ensure consistency.

### Article Update Strategy
- **D-13:** When updating an existing article, the LLM receives: the existing article body, the new source material, and instructions to produce an updated article that incorporates new information while preserving existing structure and previously sourced content.
- **D-14:** Updated articles get `frontmatter.updated_at` refreshed to the current timestamp. `frontmatter.sources` is merged (union of old + new URLs). `frontmatter.sourced_at` reflects the latest synthesis.

### Provenance & Validation
- **D-15:** Every synthesized article has complete provenance frontmatter: `sources` (URL array), `sourced_at` (ISO timestamp), `type: 'web'`. This is validated by WikiStore's existing frontmatter validation (Phase 1 D-08).
- **D-16:** After the LLM produces article content, validate YAML frontmatter via `gray-matter` + `js-yaml` round-trip (existing WikiStore pattern) BEFORE writing to disk. Invalid frontmatter is a hard error per Phase 1 D-08.

### CLI Integration
- **D-17:** The `wiki ask` command flow becomes: search → fetch → store raw envelopes → synthesize → save article(s) → rebuild index. All progress to stderr. On success, the article title(s) are written to stdout (machine-readable output for Phase 6).
- **D-18:** The `wiki ingest` command flow remains: fetch → store raw envelope. Synthesis is NOT triggered by ingest — the user runs `wiki ask` to synthesize. Ingested URLs can be referenced as sources when a future `wiki ask` covers the same topic.

### Claude's Discretion
- Module file placement within `src/` (e.g., `src/synthesis/` or similar)
- Exact LLM prompt wording and formatting instructions
- BM25 similarity threshold value for deduplication near-match
- How to partition sources across multiple articles in the clustering step
- Error message wording beyond patterns specified above
- Whether to add synthesis-specific config fields (e.g., max article length) or use code constants

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project vision, core value ("knowledge compounds"), constraints
- `.planning/REQUIREMENTS.md` — SYNTH-01 through SYNTH-07 requirements for this phase
- `.planning/ROADMAP.md` — Phase 4 success criteria and dependency chain

### Prior Phases
- `.planning/phases/01-foundation/01-CONTEXT.md` — Frontmatter schema (D-07), WikiStore patterns (D-08, D-09), article file layout (D-04, D-05), stdout/stderr contract (D-02)
- `.planning/phases/02-llm-adapter/02-CONTEXT.md` — generateText() adapter interface (D-07, D-08), config extension patterns, no streaming/structured output yet
- `.planning/phases/03-ingestion/03-CONTEXT.md` — Raw envelope schema (D-02), manifest.json contract (D-03), quality filtering (D-04-D-07)

### Technology Stack
- `CLAUDE.md` Technology Stack section — Vercel AI SDK (`ai`), `gray-matter`, `remark` + `unified`, `minisearch` for BM25

### Existing Code (Phase 4 reads/extends)
- `src/types/article.ts` — `Frontmatter` and `Article` interfaces (sources, sourced_at, type fields)
- `src/types/ingestion.ts` — `RawSourceEnvelope`, `Manifest`, `ManifestEntry` types
- `src/store/wiki-store.ts` — `WikiStore.saveArticle()`, `listArticles()`, `getArticle()`, `rebuildIndex()`, `slugify()`
- `src/llm/adapter.ts` — `generateText(prompt)` and `createProvider(config)`
- `src/ingestion/raw-store.ts` — `storeSourceEnvelopes()`, `RAW_DIR`, manifest reading
- `src/commands/ask.ts` — Current flow stops at raw storage; Phase 4 adds synthesis
- `src/commands/ingest.ts` — Stores raw envelopes; NOT modified in Phase 4
- `src/config/config.ts` — `Config` interface, `loadConfig()`, `DEFAULTS` pattern
- `src/search/search-index.ts` — BM25 search via MiniSearch (reuse for dedup near-match)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WikiStore` (src/store/wiki-store.ts) — `saveArticle()` handles atomic writes, frontmatter validation, and index rebuild. Synthesis calls this as its sink.
- `WikiStore.listArticles()` — Returns all existing articles. Used to build the backlink constraint list for LLM prompts.
- `WikiStore.getArticle(slug)` — Retrieves existing article for update/merge scenarios.
- `WikiStore.slugify(title)` — Consistent slug generation for dedup matching.
- `generateText(prompt)` (src/llm/adapter.ts) — Single prompt → text completion. Synthesis calls this for each article.
- `Manifest` / `RawSourceEnvelope` types (src/types/ingestion.ts) — Phase 4 reads manifest.json to find non-excluded sources.
- `SearchIndex` (src/search/search-index.ts) — BM25 search over articles. Reuse for deduplication near-match detection.
- `slugify` package — Already installed, used throughout for consistent slug generation.

### Established Patterns
- Atomic file writes via `write-file-atomic` through WikiStore
- Frontmatter validation: gray-matter parse + js-yaml round-trip (WikiStore.saveArticle)
- Config extension: add field to Config interface + DEFAULTS + validateConfig()
- stderr for progress, stdout for machine-readable output
- Sequential processing with per-item error handling (ask command pattern)

### Integration Points
- `src/commands/ask.ts:112` — After `storeSourceEnvelopes()`, add synthesis step: read manifest → load sources → LLM synthesize → WikiStore.saveArticle()
- `src/store/wiki-store.ts:42` — `saveArticle()` is the write path for synthesized articles
- `~/.llm-wiki/raw/<date>/<slug>/manifest.json` — Entry point for reading source envelopes
- `src/search/search-index.ts` — BM25 search for dedup near-match detection

</code_context>

<specifics>
## Specific Ideas

- The `ask` command currently ends at line 127 with "Raw sources ready for synthesis. Run Phase 4 to generate wiki article." — Phase 4 replaces this with actual synthesis.
- `generateText()` currently takes a simple string prompt. Phase 4 may need to pass longer prompts (source content can be large). No streaming needed per Phase 2 D-08 — the full response is needed for parsing.
- The existing `SearchIndex` in `src/search/search-index.ts` uses MiniSearch for BM25 — reuse this for dedup near-match detection rather than building a separate search.
- Phase 2 D-02 noted "Phase 4 will know what params it needs" for LLM config — if synthesis needs temperature or max_tokens, add them to config in this phase.
- The frontmatter `sources: []` and `sourced_at: null` placeholders from Phase 1 D-07 are now populated by synthesis.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-synthesis*
*Context gathered: 2026-04-04*

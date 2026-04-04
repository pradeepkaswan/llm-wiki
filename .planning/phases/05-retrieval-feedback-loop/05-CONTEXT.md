# Phase 5: Retrieval + Feedback Loop - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the retrieval and feedback loop that closes the knowledge compounding cycle. The system checks the existing wiki (via BM25) before searching the web, an orchestrator routes between "answer from wiki" and "search web" based on coverage confidence, and Q&A answers generated from wiki articles can be filed back as compound articles. The `wiki ask` command gains a wiki-first flow: question → BM25 check → (wiki answer OR web search+synthesize) → optional feedback filing.

</domain>

<decisions>
## Implementation Decisions

### Coverage Confidence Scoring
- **D-01:** The orchestrator uses the existing BM25 search (`src/search/search-index.ts`) to assess whether the wiki can answer a question. Load all articles via `WikiStore.listArticles()`, build index via `buildIndex()`, and query with the user's question.
- **D-02:** Coverage threshold is a configurable parameter in `~/.llm-wiki/config.json` — add `coverage_threshold` field to the `Config` interface with a sensible default (e.g. 5.0). Per STATE.md: "design as configurable parameter from day one."
- **D-03:** Routing logic: if BM25 top result score >= `coverage_threshold`, route to wiki answer path. If below, route to web search path (existing search → fetch → synthesize flow). The threshold is intentionally tunable — different wikis at different sizes will need different values.
- **D-04:** The orchestrator retrieves the top 3-5 articles above a minimum score for use as context in the wiki answer, per RETR-02.

### Wiki Answer Generation
- **D-05:** Wiki answers use a single `generateText()` call through the existing LLM adapter. The prompt includes the user's question and the full body of the top 3-5 relevant articles as context. A Q&A-specific system prompt instructs the LLM to answer from the provided wiki content only, citing article titles.
- **D-06:** The wiki answer is written to stdout (machine-readable, consistent with Phase 1 D-02 and Phase 4 D-17). Progress/routing decisions go to stderr. This maintains the stdout/stderr contract for Phase 6 OpenClaw skill.
- **D-07:** No streaming — the full response is needed before deciding whether to file it back. Matches Phase 2 D-08.

### Compound Article Structure
- **D-08:** When a Q&A answer is filed back into the wiki, it becomes a standard article with `type: compound` in frontmatter (per LOOP-02). The article follows the same structure as web-sourced articles (summary, sections, sources section) — reuses `WikiStore.saveArticle()` without changes.
- **D-09:** The `sources` field in frontmatter lists the slugs of wiki articles used to generate the answer (prefixed with `wiki://` to distinguish from URLs). `sourced_at` is set to the current ISO timestamp.
- **D-10:** Compound articles go through the same deduplication pipeline as web-sourced articles — if a compound article on the same topic already exists, it gets updated rather than duplicated. Reuses `findExistingArticle()` from `src/synthesis/deduplicator.ts`.

### User Approval UX (Feedback Gating)
- **D-11:** After displaying a wiki-sourced Q&A answer, the system prompts on stderr: "File this answer back into the wiki? [y/N]". Simple stdin readline confirmation per LOOP-03.
- **D-12:** Default is "no" — the user must actively opt in. This prevents low-quality or trivial Q&A answers from polluting the wiki.
- **D-13:** When the user approves, the system uses the LLM to convert the Q&A answer into article format (title, summary, categories, body with proper sections), then saves via `WikiStore.saveArticle()` and rebuilds the index.

### CLI Integration
- **D-14:** Add `--web` flag to `wiki ask` command. When set, skip the wiki check entirely and proceed directly to web search → fetch → synthesize (existing Phase 3/4 flow). This is the escape hatch for when the user knows they want fresh web sources.
- **D-15:** The `wiki ask` command flow becomes: check wiki (BM25) → [if covered: generate answer from wiki → display → prompt for filing] OR [if not covered OR --web: search → fetch → store → synthesize → save]. All progress to stderr, answers/titles to stdout.
- **D-16:** The `wiki search` command remains unchanged — it's a local BM25 search that returns article matches. The orchestrator in `wiki ask` reuses the same search index code but adds the routing logic.

### Claude's Discretion
- Module file placement within `src/` (e.g., `src/retrieval/`, `src/orchestrator/`, or similar)
- Q&A system prompt wording for wiki answer generation
- Q&A-to-article conversion prompt wording
- BM25 default threshold value (5.0 suggested, but may need tuning)
- How to structure the article conversion step (reuse synthesis prompts or create new ones)
- Test structure and mocking approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project vision, core value ("knowledge compounds"), constraints
- `.planning/REQUIREMENTS.md` — RETR-01, RETR-02, RETR-03, LOOP-01, LOOP-02, LOOP-03 requirements for this phase
- `.planning/ROADMAP.md` — Phase 5 success criteria, dependency chain, and phase goal

### Prior Phases
- `.planning/phases/01-foundation/01-CONTEXT.md` — Frontmatter schema (D-07: `type: web | compound`), WikiStore patterns, stdout/stderr contract (D-02), article layout (D-04, D-05)
- `.planning/phases/02-llm-adapter/02-CONTEXT.md` — `generateText()` adapter interface (D-07, D-08), GenerateOptions, config extension pattern
- `.planning/phases/03-ingestion/03-CONTEXT.md` — Raw envelope schema, manifest contract, search provider abstraction
- `.planning/phases/04-synthesis/04-CONTEXT.md` — Synthesis pipeline (plan+generate), deduplication (D-11-D-12), article builder, wikilink sanitizer, citation format (D-04-D-05)

### Technology Stack
- `CLAUDE.md` Technology Stack section — MiniSearch for BM25, Vercel AI SDK, Commander for CLI

### Existing Code (Phase 5 reads/extends)
- `src/search/search-index.ts` — `buildIndex()`, `search()` — BM25 via MiniSearch, reuse for coverage scoring
- `src/store/wiki-store.ts` — `WikiStore.listArticles()`, `getArticle()`, `saveArticle()`, `rebuildIndex()`, `slugify()`
- `src/llm/adapter.ts` — `generateText(prompt, options)` with `GenerateOptions` (system, temperature, maxOutputTokens)
- `src/synthesis/deduplicator.ts` — `findExistingArticle()` — three-tier dedup, reuse for compound articles
- `src/synthesis/article-builder.ts` — `buildNewArticle()`, `buildUpdatedArticle()` — may reuse for compound article building
- `src/synthesis/output-parser.ts` — `parseArticleOutput()` — reuse for parsing LLM article format output
- `src/synthesis/prompt-builder.ts` — Existing prompt templates (may adapt for Q&A-to-article conversion)
- `src/commands/ask.ts` — Current full pipeline; Phase 5 inserts wiki check before existing flow
- `src/config/config.ts` — `Config` interface, `loadConfig()`, `DEFAULTS`, `validateConfig()` — extend with `coverage_threshold`
- `src/types/article.ts` — `Frontmatter` with `type: 'web' | 'compound'` already defined

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildIndex()` + `search()` (src/search/search-index.ts): BM25 search already built with MiniSearch. Searches title, summary, tags, body with boost weighting. Returns scored results. Directly reusable for coverage scoring.
- `findExistingArticle()` (src/synthesis/deduplicator.ts): Three-tier dedup (slug match → BM25 → LLM tiebreak). Reuse for compound article deduplication.
- `WikiStore.saveArticle()`: Handles atomic writes, frontmatter validation, index rebuild. Works for compound articles with no changes — already validates `type: 'compound'`.
- `buildNewArticle()` / `buildUpdatedArticle()` (src/synthesis/article-builder.ts): May be adaptable for compound article construction.
- `parseArticleOutput()` (src/synthesis/output-parser.ts): Parses LLM output into title/summary/categories/body. Reuse for Q&A-to-article conversion output.
- `generateText()` (src/llm/adapter.ts): Ready with system prompt, temperature, maxOutputTokens support.

### Established Patterns
- Config extension: add field to `Config` interface + add to `DEFAULTS` + add validation in `validateConfig()` (done in Phase 2 for llm_provider, Phase 3 for search_provider)
- Sequential processing with per-item error handling (ask command pattern)
- stderr for all progress/status, stdout for machine-readable output only
- Atomic file writes via WikiStore
- LLM calls use `generateText()` with explicit `GenerateOptions`

### Integration Points
- `src/commands/ask.ts` — Insert wiki check BEFORE the search step (line 22). If wiki can answer, skip the entire search→fetch→synthesize flow.
- `src/config/config.ts` — Add `coverage_threshold` to Config interface and DEFAULTS
- `src/types/article.ts` — `type: 'compound'` already supported; no schema changes needed
- `src/store/wiki-store.ts` — `saveArticle()` already validates `type: 'compound'`; no changes needed

</code_context>

<specifics>
## Specific Ideas

- The ask command currently runs search→fetch→synthesize unconditionally. Phase 5 wraps this in an orchestrator: wiki check first, then fall through to existing flow only if wiki coverage is insufficient.
- The `--web` flag provides an explicit escape hatch so users can force web search even when the wiki has coverage. This will also be useful for the Phase 6 `--refresh` feature (INTG-03).
- Compound articles with `wiki://slug` source format in frontmatter maintain the provenance chain: web-sourced articles cite URLs, compound articles cite wiki articles. The knowledge graph is fully traceable.
- BM25 dedup threshold (3.0) in deduplicator is separate from the coverage confidence threshold — they serve different purposes. Coverage threshold is "does the wiki know enough to answer?" while dedup threshold is "is this the same article?"
- STATE.md Blocker: "Orchestrator coverage threshold needs tuning; design as configurable parameter from day one" — addressed by D-02 making it a config param.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-retrieval-feedback-loop*
*Context gathered: 2026-04-04*

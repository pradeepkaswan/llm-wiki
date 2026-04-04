# Phase 8: Multi-Page Ingest + Broad Filing + Graph - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform ingestion from single-article output to wiki-wide knowledge ripple. A single `wiki ask` creates the primary article(s) AND updates 5+ existing related articles with cross-references. Add a `wiki file` command for filing freeform content (comparisons, analyses, connections). Enforce bidirectional backlinks so Obsidian graph view shows full connectivity.

</domain>

<decisions>
## Implementation Decisions

### Ripple Update Strategy
- **D-01:** Ripple updates are a separate module (`src/synthesis/ripple.ts`) called from the ask command AFTER `synthesize()` returns — not integrated into synthesize() itself. This keeps primary synthesis clean and ripple logic independently testable.
- **D-02:** Ripple uses lightweight cross-reference updates, NOT full article rewrites. For each related article, the LLM appends/updates a `## See Also` section with a brief contextual note and `[[wikilink]]` to the new article. This keeps LLM cost manageable (one short call per target vs. full 4096-token rewrites).
- **D-03:** Ripple targets are found via BM25 search: query the search index with the primary article's title + summary, take the top 10 results (excluding the primary article itself), filter to those above a relevance threshold.
- **D-04:** A single LLM call handles all ripple updates: the prompt includes the primary article summary + list of target article titles/summaries, and the LLM returns structured output specifying which targets to update and what cross-reference text to add. This batches 5-15 updates into one call.
- **D-05:** Ripple updates go through `WikiStore.saveArticle()` with `operation: 'update'`, so each gets logged via `appendLog()` automatically. Log entries use operation `update` with description mentioning "ripple from [primary-slug]".
- **D-06:** The ripple module receives the wiki schema (from `readSchema()`) so cross-references follow wiki conventions.

### Broad Filing / `wiki file` Command
- **D-07:** New `wiki file` Commander subcommand accepts freeform text via argument (`wiki file "text..."`) or stdin pipe (`echo "text" | wiki file`). The LLM decides placement: new article, update existing, or split across multiple.
- **D-08:** Filing uses a planning step (single LLM call) that returns structured placement decisions: `[{action: 'create'|'update', slug: string, title: string, reason: string}]`. Then each decision is executed using the existing article-builder and dedup infrastructure.
- **D-09:** Filed content is marked with `type: 'filed'` in frontmatter (new type alongside 'web' and 'compound') to distinguish user-filed knowledge from web-sourced and Q&A-compound articles.
- **D-10:** After filing, ripple updates run on each created/updated article (same as `wiki ask` ripple), so filed content propagates cross-references across the wiki.
- **D-11:** The `wiki file` command reads the schema and passes it to the filing LLM prompt so placement decisions respect wiki conventions.

### Bidirectional Backlinks
- **D-12:** Backlinks are enforced at the body level using a `## See Also` section at the end of articles — NOT frontmatter arrays. Obsidian's graph view parses `[[wikilink]]` from body text; frontmatter arrays are NOT rendered as graph edges without plugins.
- **D-13:** Backlink enforcement is a post-save utility (`src/synthesis/backlink-enforcer.ts`) that runs after every `saveArticle()` in the synthesis/ripple/filing pipelines. It scans the saved article's `[[wikilinks]]`, reads each target article, and ensures the target has a reciprocal `[[source-slug]]` in its `## See Also` section.
- **D-14:** The backlink enforcer uses `WikiStore.getArticle()` to read targets and `WikiStore.saveArticle()` with `operation: 'update'` to write back — centralizing all writes through WikiStore and getting automatic log entries.
- **D-15:** The `## See Also` section is appended or updated (never duplicated). If a `## See Also` section already exists, the enforcer adds missing backlinks to the existing list.
- **D-16:** The wikilink sanitizer (`src/synthesis/wikilink-sanitizer.ts`) continues to strip invalid forward links. The backlink enforcer handles the reverse direction separately — they are complementary, not merged.

### Claude's Discretion
- Ripple relevance threshold for BM25 scoring
- Exact LLM prompt wording for ripple, filing placement, and backlink text
- Whether `wiki file` supports `--dry-run` to preview placement decisions
- Test structure and mocking approach
- Whether to add `type: 'filed'` to the existing Frontmatter union or keep it as `'compound'`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project vision, core value, constraints
- `.planning/REQUIREMENTS.md` — MULTI-01, MULTI-02, LOOP-04, LOOP-05, GRAPH-01, GRAPH-02 for this phase
- `.planning/ROADMAP.md` — Phase 8 success criteria, dependency chain

### Prior Phases
- `.planning/phases/04-synthesis/04-CONTEXT.md` — Synthesis pipeline (plan+generate), dedup, wikilink sanitizer, article-builder
- `.planning/phases/05-retrieval-feedback-loop/05-CONTEXT.md` — Article-filer pattern, compound articles, wiki:// sources
- `.planning/phases/07-schema-activity-log/07-CONTEXT.md` — Schema injection into prompts (D-04/D-05), appendLog centralized (D-12), co-evolution (D-06)

### Existing Code (Phase 8 reads/extends)
- `src/synthesis/synthesizer.ts` — Orchestrator: plan + generate + save loop, schema reading, co-evolution hook
- `src/synthesis/prompt-builder.ts` — buildPlanPrompt(), buildGeneratePrompt(), buildUpdatePrompt() with schema param
- `src/synthesis/article-builder.ts` — buildNewArticle(), buildUpdatedArticle()
- `src/synthesis/deduplicator.ts` — findExistingArticle() — slug + BM25 + LLM tiebreak
- `src/synthesis/wikilink-sanitizer.ts` — sanitizeWikilinks() strips invalid forward links
- `src/store/wiki-store.ts` — WikiStore: saveArticle(), getArticle(), listArticles(), readSchema(), appendLog()
- `src/search/search-index.ts` — buildIndex(), search() — BM25 via MiniSearch
- `src/retrieval/article-filer.ts` — fileAnswerAsArticle() — compound article filing pattern
- `src/commands/ask.ts` — Full pipeline, integration point for ripple step
- `src/index.ts` — Commander entry point for adding `wiki file` command
- `src/types/article.ts` — Frontmatter interface with type field

### Karpathy Reference
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f — Multi-page ingest, filing, knowledge ripple

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildUpdatePrompt()` (prompt-builder.ts): Feeds new sources into existing article — can be adapted for ripple cross-reference updates
- `findExistingArticle()` (deduplicator.ts): Three-tier dedup — reuse for filing placement decisions
- `buildIndex()` + `search()` (search-index.ts): BM25 search for finding ripple targets
- `sanitizeWikilinks()` (wikilink-sanitizer.ts): Forward-link validation — complementary to new backlink enforcer
- `WikiStore.getArticle()` / `saveArticle()`: Read-modify-write cycle for backlink enforcement
- `WikiStore.appendLog()`: Already called from saveArticle() — ripple and backlink updates auto-logged
- Schema injection pattern (Phase 7): All prompt-builder functions accept schema parameter

### Established Patterns
- Sole disk writer: All writes through WikiStore
- Sequential processing with per-item error handling (ask command)
- LLM planning step + execution step (synthesize: plan articles then generate each)
- Config extension: add field + DEFAULTS + validateConfig()
- Commander subcommand registration (index.ts)

### Integration Points
- `src/commands/ask.ts` — Add ripple step after synthesize() returns
- `src/index.ts` — Register `wiki file` command
- `src/commands/file.ts` — New command file for broad filing
- `src/synthesis/ripple.ts` — New module for ripple updates
- `src/synthesis/backlink-enforcer.ts` — New module for bidirectional backlink enforcement
- `src/types/article.ts` — Potentially add 'filed' to Frontmatter type union

</code_context>

<specifics>
## Specific Ideas

- Ripple as a single batched LLM call is key to keeping costs reasonable. Instead of 10 separate calls, one call analyzes all targets and returns structured JSON with per-target update decisions.
- The backlink enforcer should be idempotent — running it twice produces the same result. Check before adding to avoid duplicate entries in See Also sections.
- `wiki file` accepting stdin makes it pipeable: `wiki ask "compare X vs Y" | wiki file` would file the comparison output directly.
- The See Also section is the natural place for both ripple cross-references AND backlinks — they serve the same purpose (connecting articles) and should be merged into a single section per article.

</specifics>

<deferred>
## Deferred Ideas

- Full article rewrites during ripple (expensive, save for later when cost is less of a concern)
- Automatic ripple on `wiki ingest <url>` (currently only `wiki ask` triggers ripple)
- Graph visualization command (`wiki graph`) — Obsidian handles this natively
- Semantic similarity for ripple targets (vector embeddings) — BM25 is sufficient at personal scale

</deferred>

---

*Phase: 08-multi-page-ingest-broad-filing-graph*
*Context gathered: 2026-04-05*

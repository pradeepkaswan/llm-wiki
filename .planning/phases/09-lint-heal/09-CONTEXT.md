# Phase 9: Lint + Heal - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `wiki lint` and `wiki heal` commands that maintain wiki health. Lint scans for structural issues (orphans, stale articles, missing concepts, missing cross-references) and semantic issues (contradictions via LLM). Heal auto-fixes what it can and flags contradictions for human review. Both commands log to log.md.

</domain>

<decisions>
## Implementation Decisions

### Lint Engine Architecture
- **D-01:** The lint engine is a standalone module (`src/lint/linter.ts`) that reads all articles via `WikiStore.listArticles()` and performs check-by-check analysis. Structural checks are purely local (no LLM); contradiction detection uses a single LLM call.
- **D-02:** Lint check categories: `orphan` (no inbound wikilinks), `stale` (sourced_at older than freshness_days), `missing-concept` (mentioned in wikilinks but no article exists), `missing-cross-ref` (BM25-similar articles not linked to each other), `contradiction` (LLM-detected semantic conflicts between articles).
- **D-03:** Orphan detection builds a reverse-link map from all article bodies using `WIKILINK_RE`. An article is orphan if no other article links to it via `[[slug]]`. index.md and schema.md are excluded.
- **D-04:** Staleness check reuses `isArticleStale()` from ask.ts and `freshness_days` from config — same logic as `--refresh`.
- **D-05:** Missing concepts: extract all `[[wikilinks]]` from all articles, compare against known article slugs. Any wikilink target without a corresponding article is a missing concept.
- **D-06:** Missing cross-references: for each article, BM25 search with its title. If high-scoring matches are not already linked (neither in body wikilinks nor See Also), flag as missing cross-reference.
- **D-07:** Contradiction detection: batch article summaries to the LLM and ask it to identify conflicting claims. One LLM call for the entire wiki (or chunked for large wikis).

### Lint Finding Data Model
- **D-08:** Each finding is a typed object: `{ category, severity, affected: string[], suggestedFix: string }`. Categories map to severity defaults: contradictions → error, orphans/stale → warning, missing-concept/missing-cross-ref → info.
- **D-09:** `wiki lint` outputs structured JSON array to stdout and a human-readable summary to stderr — following the established stdout/stderr convention.
- **D-10:** A `LintReport` type wraps the findings array with metadata: total counts per category, wiki health score (percentage of articles with no findings).

### Heal Command
- **D-11:** `wiki heal` runs lint internally (lint-then-fix single pass), not from a pre-computed findings file. This is simpler and ensures the heal always works on fresh data.
- **D-12:** Heal routing by category:
  - `missing-concept`: Create stub article via LLM (title, summary, body with "This concept is referenced in [[source-articles]]") using the synthesis pipeline
  - `missing-cross-ref`: Add cross-reference via `upsertSeeAlsoEntry()` from see-also.ts
  - `stale`: Re-fetch via the `--refresh` code path (search → fetch → synthesize → update)
  - `orphan`: Add backlinks from the most relevant article (BM25 top match) via `upsertSeeAlsoEntry()`
  - `contradiction`: Output to stderr for human review — NOT auto-fixed
- **D-13:** Heal writes exclusively through `WikiStore.saveArticle()`, which auto-logs via `appendLog()`. Both `wiki lint` and `wiki heal` also log their own invocation to log.md.
- **D-14:** Heal runs ripple updates and backlink enforcement after each article modification, reusing the Phase 8 infrastructure.

### CLI Integration
- **D-15:** `wiki lint` and `wiki heal` are new Commander subcommands registered in index.ts.
- **D-16:** `wiki lint` accepts optional `--category <type>` flag to filter to a specific check (e.g., `wiki lint --category stale`).
- **D-17:** `wiki heal` accepts optional `--dry-run` flag that shows what would be fixed without making changes.
- **D-18:** Both commands read the schema and pass it to any LLM calls for consistency.

### Claude's Discretion
- BM25 threshold for missing cross-reference detection
- LLM prompt wording for contradiction detection
- Whether to add a wiki health score to index.md
- Exact stub article template for missing concepts
- Test structure and mocking approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project vision, core value, constraints
- `.planning/REQUIREMENTS.md` — LINT-01, LINT-02, LINT-03 for this phase
- `.planning/ROADMAP.md` — Phase 9 success criteria

### Prior Phases
- `.planning/phases/06-openclaw-skill/06-CONTEXT.md` — --refresh flag, freshness_days, isArticleStale()
- `.planning/phases/07-schema-activity-log/07-CONTEXT.md` — appendLog(), schema reading
- `.planning/phases/08-multi-page-ingest-broad-filing-graph/08-CONTEXT.md` — See Also utility, ripple, backlink enforcer

### Existing Code (Phase 9 reads/reuses)
- `src/store/wiki-store.ts` — WikiStore: listArticles(), getArticle(), saveArticle(), readSchema(), appendLog()
- `src/synthesis/backlink-enforcer.ts` — WIKILINK_RE regex, wikilink extraction pattern
- `src/synthesis/see-also.ts` — upsertSeeAlsoEntry() for cross-reference fixes
- `src/synthesis/ripple.ts` — rippleUpdates() for post-heal propagation
- `src/commands/ask.ts` — isArticleStale(), --refresh code path
- `src/search/search-index.ts` — buildIndex(), search() for cross-ref detection
- `src/config/config.ts` — Config with freshness_days
- `src/llm/adapter.ts` — generateText() for contradiction detection
- `src/index.ts` — Commander entry point for new commands

### Karpathy Reference
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f — Lint as core workflow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WIKILINK_RE` (backlink-enforcer.ts): Extract all [[wikilinks]] from article bodies
- `isArticleStale()` (ask.ts): Check sourced_at against freshness_days
- `upsertSeeAlsoEntry()` (see-also.ts): Idempotent cross-reference management
- `buildIndex()` + `search()` (search-index.ts): BM25 for missing cross-ref detection
- `rippleUpdates()` (ripple.ts): Post-heal knowledge propagation
- `enforceBacklinks()` (backlink-enforcer.ts): Post-heal bidirectional link repair
- `generateText()` (adapter.ts): LLM call for contradiction detection
- `WikiStore.appendLog()`: Automatic logging for all heal mutations

### Established Patterns
- Sole disk writer through WikiStore
- stdout for JSON, stderr for human-readable
- Commander subcommand registration
- Sequential processing with per-item error handling

### Integration Points
- `src/lint/linter.ts` — New module for all lint checks
- `src/lint/healer.ts` — New module for fix routing
- `src/commands/lint.ts` — New CLI command
- `src/commands/heal.ts` — New CLI command
- `src/index.ts` — Register both commands

</code_context>

<specifics>
## Specific Ideas

- The lint engine should be fast for structural checks (purely local, no LLM) and only use LLM for contradiction detection. This makes `wiki lint` cheap to run frequently.
- Heal's `--dry-run` flag is critical for trust — users should be able to preview fixes before applying them.
- Missing concept stubs should be clearly marked as auto-generated (e.g., "This article was auto-generated by wiki heal. Expand it by running wiki ask.") so users know to flesh them out.
- Contradiction detection batches all article summaries into one prompt, not one call per pair — keeps cost O(1) per lint run.

</specifics>

<deferred>
## Deferred Ideas

- Scheduled/automatic lint on a cron (lint on every Nth wiki ask)
- Lint results persisted to a findings.json for historical tracking
- Custom lint rules defined in schema.md
- Quality scoring of individual articles (beyond binary pass/fail)

</deferred>

---

*Phase: 09-lint-heal*
*Context gathered: 2026-04-05*

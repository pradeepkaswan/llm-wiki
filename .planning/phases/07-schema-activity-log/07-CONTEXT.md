# Phase 7: Schema + Activity Log - Context

**Gathered:** 2026-04-05 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the third layer of Karpathy's architecture: a self-describing schema file (`schema.md`) at the vault root that teaches the LLM wiki conventions (page types, frontmatter rules, category taxonomy, wikilink style), plus an append-only activity log (`log.md`) that records every wiki mutation chronologically. The schema is injected into LLM prompts before synthesis; the log is centralized through WikiStore.

</domain>

<decisions>
## Implementation Decisions

### Schema File Location and Format
- **D-01:** `schema.md` lives at the vault root (`<vault_path>/schema.md`), NOT inside `articles/`. This keeps it distinct from wiki articles — it won't appear in `listArticles()`, BM25 search, dedup, or the index.md TOC.
- **D-02:** `schema.md` is a human-readable Markdown file with structured sections: Page Types (web, compound, comparison, concept), Frontmatter Conventions (required/optional fields per type), Category Taxonomy (current categories with descriptions), and Wikilink Style (naming patterns, link formatting rules).
- **D-03:** WikiStore gets a `readSchema()` method that reads `<vault_path>/schema.md` and returns its content as a string. Returns a sensible default if the file doesn't exist yet (first-run bootstrap).

### Schema Injection Into LLM Prompts
- **D-04:** Schema content is injected into prompt-builder functions (`buildPlanPrompt`, `buildGeneratePrompt`, `buildUpdatePrompt`, `buildFilingPrompt`) as an additional context section in the user prompt — analogous to the existing WIKILINKS constraint section. NOT injected as a system prompt.
- **D-05:** The schema string is passed as a parameter to prompt-builder functions. Callers (synthesizer, article-filer) read the schema once via `WikiStore.readSchema()` and pass it through.

### Schema Co-Evolution
- **D-06:** Schema co-evolves deterministically — when synthesis produces articles with categories not present in the schema taxonomy, the new categories are appended to the taxonomy section automatically. No LLM call for schema updates; no user confirmation gate.
- **D-07:** Schema updates go through WikiStore (new `updateSchema()` method) to maintain the sole-disk-writer invariant and to trigger a log entry.
- **D-08:** Initial `schema.md` is bootstrapped on first `wiki ask` if it doesn't exist — seeded from the existing frontmatter conventions in `src/types/article.ts` and the current category set from `listArticles()`.

### Activity Log
- **D-09:** `log.md` lives at the vault root (`<vault_path>/log.md`), same level as `schema.md`. NOT inside `articles/`.
- **D-10:** Log entries follow the format: `## [YYYY-MM-DD HH:MM] operation | description` — parseable by grep/regex, human-readable in Obsidian.
- **D-11:** Log operations include: `ingest`, `create`, `update`, `index`, `schema`, `lint`, `heal`, `query` — covering all current and planned wiki mutations.
- **D-12:** Log appends are centralized in WikiStore via a new `appendLog(operation, description)` method. Every `saveArticle()` and `rebuildIndex()` call triggers a log append. This guarantees no mutation goes unlogged.
- **D-13:** Use `fs.appendFile()` for log writes — safe for single-process CLI use. No file-locking library needed since `wiki` CLI is single-process (Commander serializes commands).

### Claude's Discretion
- Exact initial schema.md template content and section ordering
- Log entry description wording
- Whether to add a `wiki log` CLI command (read-only, displays recent log entries)
- Test structure and mocking approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project vision, core value, constraints
- `.planning/REQUIREMENTS.md` — SCHEMA-01, SCHEMA-02, LOG-01, LOG-02 requirements for this phase
- `.planning/ROADMAP.md` — Phase 7 success criteria, dependency chain

### Prior Phases
- `.planning/phases/01-foundation/01-CONTEXT.md` — WikiStore patterns (D-04/D-09), frontmatter schema (D-07/D-08), vault path config (D-06)
- `.planning/phases/04-synthesis/04-CONTEXT.md` — Synthesis pipeline (plan+generate), prompt-builder patterns, article-builder
- `.planning/phases/05-retrieval-feedback-loop/05-CONTEXT.md` — Article-filer prompt (buildFilingPrompt), compound articles

### Existing Code (Phase 7 reads/extends)
- `src/store/wiki-store.ts` — WikiStore class: saveArticle(), rebuildIndex(), listArticles(), vaultPath, articlesDir — extend with readSchema(), updateSchema(), appendLog()
- `src/synthesis/prompt-builder.ts` — buildPlanPrompt(), buildGeneratePrompt(), buildUpdatePrompt() — extend with schema parameter
- `src/retrieval/article-filer.ts` — buildFilingPrompt() — extend with schema parameter
- `src/synthesis/synthesizer.ts` — Orchestrator: calls prompt-builder then generateText() — pass schema through
- `src/config/config.ts` — Config with vault_path
- `src/types/article.ts` — Frontmatter interface (source of truth for schema bootstrap)

### Karpathy Reference
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f — Three-layer architecture (raw, wiki, schema), log.md concept

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WikiStore` (src/store/wiki-store.ts): Sole disk writer with `vaultPath` property. Already writes `index.md` to `articles/`. Natural home for `schema.md` and `log.md` at vault root.
- `prompt-builder.ts` functions: Already accept article manifest (wikilinks list) as a parameter. Adding a schema parameter follows the same pattern.
- `Frontmatter` interface (src/types/article.ts): Defines the canonical schema for article metadata. Bootstrap source for initial `schema.md`.
- `rebuildIndex()`: Already called after every saveArticle(). Log append can follow the same hook pattern.

### Established Patterns
- Sole disk writer: All file I/O goes through WikiStore
- Config extension: Add field to Config interface + DEFAULTS + validateConfig()
- Prompt-builder parameterization: Functions accept context data, concatenate into prompt strings
- stderr for progress, stdout for machine-readable data

### Integration Points
- `src/store/wiki-store.ts` — Add readSchema(), updateSchema(), appendLog() methods
- `src/synthesis/prompt-builder.ts` — Add schema parameter to all build* functions
- `src/retrieval/article-filer.ts` — Add schema parameter to buildFilingPrompt()
- `src/synthesis/synthesizer.ts` — Read schema, pass to prompt-builder, check categories post-synthesis
- `src/commands/ask.ts` — Schema bootstrap on first run if missing

</code_context>

<specifics>
## Specific Ideas

- Schema bootstrap: On first `wiki ask`, if `schema.md` doesn't exist, generate it from the Frontmatter interface + current categories found in `listArticles()`. This means existing wikis get a schema automatically.
- Log is strictly append-only — never truncated or rewritten. Keeps it reliable as an audit trail.
- Schema co-evolution is deterministic for now (just add new categories). Phase 9 (Lint) can later validate whether the taxonomy needs pruning or reorganization.
- The schema should include explicit instructions for the LLM: "When writing articles, follow these conventions..." — this is the key insight from Karpathy's CLAUDE.md concept.

</specifics>

<deferred>
## Deferred Ideas

- LLM-driven schema curation (asking the LLM to reorganize/clean the taxonomy) — future enhancement after Lint phase
- `wiki schema` CLI command to view/edit schema interactively — not in Phase 7 scope
- Schema versioning or changelog — overkill for personal wiki

</deferred>

---

*Phase: 07-schema-activity-log*
*Context gathered: 2026-04-05*

# Requirements: LLM Wiki

**Defined:** 2026-04-03
**Core Value:** Every question you ask makes the wiki smarter — the knowledge compounds automatically.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: User can ask a natural language question via CLI (`wiki ask "How does X work?"`)
- [x] **FOUND-02**: Articles are written as Obsidian-compatible markdown with valid YAML frontmatter
- [x] **FOUND-03**: Auto-maintained index file updates whenever articles are added or modified
- [x] **FOUND-04**: LLM provider is configurable via config file (Claude, OpenAI, Ollama)
- [x] **FOUND-05**: Project config stored at `~/.llm-wiki/config.json` with sensible defaults

### Ingestion

- [x] **INGEST-01**: System searches the web via Exa API (neural search) to find sources for a question
- [x] **INGEST-02**: System fetches web pages and extracts article body as clean markdown
- [x] **INGEST-03**: Raw unprocessed sources are preserved in `~/.llm-wiki/raw/` with metadata
- [x] **INGEST-04**: Search provider is configurable (Exa default, extensible to Brave/Tavily)
- [x] **INGEST-05**: User can ingest a specific URL directly (`wiki ingest <url>`) — supports web pages, PDFs, arxiv papers

### Synthesis

- [x] **SYNTH-01**: LLM synthesizes 3-5 web sources into a structured wiki article
- [x] **SYNTH-02**: Every claim in an article is traceable to a source URL via citations
- [x] **SYNTH-03**: Articles include `[[wikilink]]` backlinks to related existing articles (constrained to existing article manifest)
- [x] **SYNTH-04**: Broad questions generate multiple linked articles (topic clustering)
- [x] **SYNTH-05**: LLM decides whether to create a new article or update an existing one (deduplication)
- [x] **SYNTH-06**: YAML frontmatter is validated after every LLM write (prevents silent corruption)
- [x] **SYNTH-07**: Articles include provenance tracking in frontmatter (`sources`, `sourced_at`, `type: web|compound`)

### Retrieval

- [x] **RETR-01**: User can query the existing wiki before the system searches the web
- [x] **RETR-02**: System uses local index (BM25) to find 3-5 relevant articles per query
- [x] **RETR-03**: Orchestrator decides "answer from wiki" vs "search web" based on coverage confidence

### Feedback Loop

- [x] **LOOP-01**: Q&A answers against the wiki are filed back as new or updated articles
- [x] **LOOP-02**: Compound articles are marked with `type: compound` in frontmatter (distinguishable from web-sourced)
- [x] **LOOP-03**: Feedback loop is gated — user can approve/skip filing answer back into wiki

### Integration

- [x] **INTG-01**: OpenClaw skill allows querying the wiki from any OpenClaw-connected interface (Telegram, Claude Code, etc.)
- [x] **INTG-02**: CLI outputs are non-TTY safe (clean stdout, proper exit codes) for programmatic use
- [x] **INTG-03**: Article freshness tracked via `sourced_at` frontmatter + `--refresh` flag to update stale articles

### Schema Layer (Karpathy Layer 3)

- [ ] **SCHEMA-01**: Wiki schema file (`schema.md`) in the vault defines conventions, page types, frontmatter rules, naming patterns, and LLM maintenance instructions — co-evolved with usage
- [ ] **SCHEMA-02**: LLM reads schema.md before every synthesis/ingest operation and follows its conventions (page structure, category taxonomy, wikilink style)

### Multi-Page Ingest

- [ ] **MULTI-01**: A single source ingestion touches 10-15 existing wiki pages — not just creates one article. Ingesting "flash attention" should also update the transformer page, attention mechanisms page, training optimization page, etc.
- [ ] **MULTI-02**: After synthesizing the primary article, the LLM identifies existing articles that should cross-reference or incorporate findings from the new source, and updates them

### Activity Log

- [ ] **LOG-01**: `log.md` in the vault is an append-only chronological record of all wiki operations — ingests, queries, article creates/updates, lint runs — with parseable timestamps and operation types
- [ ] **LOG-02**: Every wiki mutation (article create, update, index rebuild) appends a log entry with format `## [YYYY-MM-DD HH:MM] operation | description`

### Lint + Heal (promoted from v2)

- [ ] **LINT-01**: `wiki lint` command scans the wiki for contradictions between articles, orphan pages (no inbound links), missing cross-references, stale claims (old `sourced_at`), and concepts mentioned but lacking their own page
- [ ] **LINT-02**: Lint results are structured and actionable — each finding has a category, severity, affected articles, and suggested fix
- [ ] **LINT-03**: `wiki heal` command auto-fixes lint findings — creates missing pages, adds missing cross-references, flags contradictions for human review, updates stale content via `--refresh`

### Broad Filing

- [ ] **LOOP-04**: Not just Q&A answers — comparisons, analyses, discovered connections, and any valuable LLM output can be filed back into the wiki as durable artifacts
- [ ] **LOOP-05**: `wiki file` command takes freeform text (piped or argument) and the LLM decides where it belongs in the wiki — new page, update to existing page, or split across multiple pages

### Obsidian Graph Integrity

- [ ] **GRAPH-01**: Backlinks are bidirectional — when article A links to B, article B is updated to include a backlink to A (ensures Obsidian graph view shows full connectivity)
- [ ] **GRAPH-02**: `wiki ask` and `wiki ingest` verify and repair bidirectional links after every write operation

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Quality

- **QUAL-01**: Source quality filtering (detect paywalls, empty pages, low-quality results)

### Integration

- **INTG-04**: Obsidian plugin for in-vault questioning
- **INTG-05**: Web UI / chat interface

### Advanced

- **ADV-01**: Fine-tune LLM on wiki data (knowledge in weights, not just context)
- **ADV-02**: Drag-and-drop file ingestion (local files into pipeline)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web UI / chat interface | CLI-first for v1; deferred to v2 |
| Obsidian plugin | Deferred to future milestone |
| Drag-and-drop file ingestion | URL ingestion supported in v1; local file drag-and-drop deferred to v2 |
| Social / sharing features | Personal tool, local-only |
| Real-time streaming in CLI | Progress indicator sufficient; streaming adds complexity |
| Auto-discovery crawling | Creates noise without a question driving it |
| Fine-tuning LLM on wiki | Explicitly deferred per Karpathy's "Looking Ahead" |
| Complex query language | Natural language is the interface |
| Vector embeddings / semantic search | BM25 sufficient at personal scale (<1000 articles); LLM handles semantic matching |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 2 | Complete |
| FOUND-05 | Phase 2 | Complete |
| INGEST-01 | Phase 3 | Complete |
| INGEST-02 | Phase 3 | Complete |
| INGEST-03 | Phase 3 | Complete |
| INGEST-04 | Phase 3 | Complete |
| INGEST-05 | Phase 3 | Complete |
| SYNTH-01 | Phase 4 | Complete |
| SYNTH-02 | Phase 4 | Complete |
| SYNTH-03 | Phase 4 | Complete |
| SYNTH-04 | Phase 4 | Complete |
| SYNTH-05 | Phase 4 | Complete |
| SYNTH-06 | Phase 4 | Complete |
| SYNTH-07 | Phase 4 | Complete |
| RETR-01 | Phase 5 | Complete |
| RETR-02 | Phase 5 | Complete |
| RETR-03 | Phase 5 | Complete |
| LOOP-01 | Phase 5 | Complete |
| LOOP-02 | Phase 5 | Complete |
| LOOP-03 | Phase 5 | Complete |
| INTG-01 | Phase 6 | Complete |
| INTG-02 | Phase 1 | Complete |
| INTG-03 | Phase 6 | Complete |
| SCHEMA-01 | Phase 7 | Pending |
| SCHEMA-02 | Phase 7 | Pending |
| MULTI-01 | Phase 8 | Pending |
| MULTI-02 | Phase 8 | Pending |
| LOG-01 | Phase 7 | Pending |
| LOG-02 | Phase 7 | Pending |
| LINT-01 | Phase 9 | Pending |
| LINT-02 | Phase 9 | Pending |
| LINT-03 | Phase 9 | Pending |
| LOOP-04 | Phase 8 | Pending |
| LOOP-05 | Phase 8 | Pending |
| GRAPH-01 | Phase 8 | Pending |
| GRAPH-02 | Phase 8 | Pending |

**Coverage:**
- v1 requirements (Phases 1-6): 26 total, 26 complete
- v1.1 requirements (Phases 7-9, Karpathy alignment): 12 total, 0 complete
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-05 — added Karpathy-aligned requirements (schema, multi-page, log, lint, broad filing, graph integrity)*

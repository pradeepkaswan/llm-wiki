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

- [ ] **INGEST-01**: System searches the web via Exa API (neural search) to find sources for a question
- [ ] **INGEST-02**: System fetches web pages and extracts article body as clean markdown
- [ ] **INGEST-03**: Raw unprocessed sources are preserved in `~/.llm-wiki/raw/` with metadata
- [ ] **INGEST-04**: Search provider is configurable (Exa default, extensible to Brave/Tavily)
- [ ] **INGEST-05**: User can ingest a specific URL directly (`wiki ingest <url>`) — supports web pages, PDFs, arxiv papers

### Synthesis

- [ ] **SYNTH-01**: LLM synthesizes 3-5 web sources into a structured wiki article
- [ ] **SYNTH-02**: Every claim in an article is traceable to a source URL via citations
- [ ] **SYNTH-03**: Articles include `[[wikilink]]` backlinks to related existing articles (constrained to existing article manifest)
- [ ] **SYNTH-04**: Broad questions generate multiple linked articles (topic clustering)
- [ ] **SYNTH-05**: LLM decides whether to create a new article or update an existing one (deduplication)
- [ ] **SYNTH-06**: YAML frontmatter is validated after every LLM write (prevents silent corruption)
- [ ] **SYNTH-07**: Articles include provenance tracking in frontmatter (`sources`, `sourced_at`, `type: web|compound`)

### Retrieval

- [ ] **RETR-01**: User can query the existing wiki before the system searches the web
- [ ] **RETR-02**: System uses local index (BM25) to find 3-5 relevant articles per query
- [ ] **RETR-03**: Orchestrator decides "answer from wiki" vs "search web" based on coverage confidence

### Feedback Loop

- [ ] **LOOP-01**: Q&A answers against the wiki are filed back as new or updated articles
- [ ] **LOOP-02**: Compound articles are marked with `type: compound` in frontmatter (distinguishable from web-sourced)
- [ ] **LOOP-03**: Feedback loop is gated — user can approve/skip filing answer back into wiki

### Integration

- [ ] **INTG-01**: OpenClaw skill allows querying the wiki from any OpenClaw-connected interface (Telegram, Claude Code, etc.)
- [x] **INTG-02**: CLI outputs are non-TTY safe (clean stdout, proper exit codes) for programmatic use
- [ ] **INTG-03**: Article freshness tracked via `sourced_at` frontmatter + `--refresh` flag to update stale articles

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Quality

- **QUAL-01**: Source quality filtering (detect paywalls, empty pages, low-quality results)
- **QUAL-02**: Lint + Heal automation (find inconsistencies, impute missing info, suggest new articles)

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
| INGEST-01 | Phase 3 | Pending |
| INGEST-02 | Phase 3 | Pending |
| INGEST-03 | Phase 3 | Pending |
| INGEST-04 | Phase 3 | Pending |
| INGEST-05 | Phase 3 | Pending |
| SYNTH-01 | Phase 4 | Pending |
| SYNTH-02 | Phase 4 | Pending |
| SYNTH-03 | Phase 4 | Pending |
| SYNTH-04 | Phase 4 | Pending |
| SYNTH-05 | Phase 4 | Pending |
| SYNTH-06 | Phase 4 | Pending |
| SYNTH-07 | Phase 4 | Pending |
| RETR-01 | Phase 5 | Pending |
| RETR-02 | Phase 5 | Pending |
| RETR-03 | Phase 5 | Pending |
| LOOP-01 | Phase 5 | Pending |
| LOOP-02 | Phase 5 | Pending |
| LOOP-03 | Phase 5 | Pending |
| INTG-01 | Phase 6 | Pending |
| INTG-02 | Phase 1 | Complete |
| INTG-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after roadmap creation*

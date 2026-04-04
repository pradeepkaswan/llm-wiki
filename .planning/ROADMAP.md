# Roadmap: LLM Wiki

## Overview

Six phases build the compounding knowledge engine layer by layer. Foundation first — working file store and CLI skeleton with zero network or LLM dependencies. Then the LLM abstraction and config system, so every subsequent phase builds against a stable interface rather than a specific provider. Then ingestion (web search to raw files), then synthesis (raw files to wiki articles). Phase 5 closes the loop: BM25 retrieval, orchestrator routing, and the feedback mechanism that files Q&A answers back into the wiki — the core differentiator. Phase 6 wraps the stable CLI as an OpenClaw skill, a thin layer with no new logic.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Wiki Store, CLI skeleton, and non-TTY-safe stdout/stderr separation (completed 2026-04-04)
- [x] **Phase 2: LLM Adapter** - Multi-provider LLM abstraction and config system (completed 2026-04-04)
- [x] **Phase 3: Ingestion** - Web search, HTML extraction, raw source storage, URL ingestion (completed 2026-04-04)
- [ ] **Phase 4: Synthesis** - LLM article generation, citations, backlinks, dedup, provenance
- [ ] **Phase 5: Retrieval + Feedback Loop** - BM25 search, orchestrator routing, Q&A filing
- [ ] **Phase 6: OpenClaw Skill** - Integration wrapper for Telegram/Claude Code access + freshness refresh

## Phase Details

### Phase 1: Foundation
**Goal**: A working wiki on disk — user can create, view, and search Obsidian-compatible articles without any LLM or network dependency
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, INTG-02
**Success Criteria** (what must be TRUE):
  1. User can run `wiki ask "..."` and get a usage response (command is wired, routing works)
  2. A markdown article written to the vault appears correctly in Obsidian with valid frontmatter, tags, and wikilinks
  3. The `index.md` file in the vault updates automatically whenever an article is added or modified
  4. All CLI progress output goes to stderr; stdout carries only machine-readable content, enabling piping and scripting without noise
**Plans**: 3 plans
**UI hint**: no

Plans:
- [x] 01-01-PLAN.md — Project scaffold: package.json, tsconfig, vitest, shared types, config module
- [x] 01-02-PLAN.md — WikiStore: sole disk writer with frontmatter validation and auto index rebuild
- [x] 01-03-PLAN.md — CLI wiring: Commander entry point, all 4 commands, BM25 search, stdout/stderr enforcement

### Phase 2: LLM Adapter
**Goal**: Any LLM call in the project routes through a single interface — switching providers is a config file change, not a code change
**Depends on**: Phase 1
**Requirements**: FOUND-04, FOUND-05
**Success Criteria** (what must be TRUE):
  1. User can set `provider: claude | openai | ollama` in `~/.llm-wiki/config.json` and the system uses that provider without code changes
  2. The same prompt sent through the adapter returns a coherent completion from Claude, OpenAI, and Ollama (tested via integration test)
  3. Missing or invalid config produces a clear error message with remediation instructions, not a stack trace
**Plans**: 1 plan
**UI hint**: no

Plans:
- [x] 02-01-PLAN.md — Config extension (LLM fields + validation) and multi-provider adapter (generateText + provider factory)

### Phase 3: Ingestion
**Goal**: The system can find web sources for any question and store them as raw JSON envelopes on disk — no LLM involved, fully auditable
**Depends on**: Phase 2
**Requirements**: INGEST-01, INGEST-02, INGEST-03, INGEST-04, INGEST-05
**Success Criteria** (what must be TRUE):
  1. Running `wiki ask "How does X work?"` produces 3-5 raw JSON source envelopes at `~/.llm-wiki/raw/<date>/<slug>/` before any synthesis begins
  2. Each raw envelope contains clean extracted markdown (not raw HTML), source URL, and fetch timestamp
  3. A paywalled or near-empty page is detected and excluded — synthesis never receives garbage content
  4. Running `wiki ingest <url>` stores that specific URL as a raw source envelope, ready for synthesis
  5. Search provider can be switched from Exa to an alternative in config without touching source code
**Plans**: 3 plans
**UI hint**: no

Plans:
- [x] 03-01-PLAN.md — Install deps, ingestion types, config extension (search_provider), SearchProvider interface + Exa implementation
- [x] 03-02-PLAN.md — Content extraction pipeline (HTML/PDF), quality filter, raw source envelope storage
- [x] 03-03-PLAN.md — Wire ask and ingest commands to full ingestion pipeline

### Phase 4: Synthesis
**Goal**: Raw sources become structured wiki articles in the Obsidian vault — with citations, backlinks to real articles, deduplication, and provenance frontmatter baked in before the feedback loop exists
**Depends on**: Phase 3
**Requirements**: SYNTH-01, SYNTH-02, SYNTH-03, SYNTH-04, SYNTH-05, SYNTH-06, SYNTH-07
**Success Criteria** (what must be TRUE):
  1. After `wiki ask "How does X work?"`, a valid `.md` article appears in the vault's `articles/` directory with a summary, structured sections, and inline citations to source URLs
  2. Every `[[wikilink]]` in a generated article points to an existing article title — no hallucinated links, no dead stubs
  3. Asking the same question a second time updates the existing article rather than creating a duplicate
  4. A broad question (e.g. "Explain transformer architecture") generates 2+ linked articles covering distinct sub-concepts
  5. Every article's YAML frontmatter includes `sources`, `sourced_at`, and `type: web` — readable by `js-yaml` without error
**Plans**: TBD
**UI hint**: no

### Phase 5: Retrieval + Feedback Loop
**Goal**: The wiki answers its own questions — the system checks local knowledge before fetching the web, and Q&A answers compound back into the wiki as durable artifacts
**Depends on**: Phase 4
**Requirements**: RETR-01, RETR-02, RETR-03, LOOP-01, LOOP-02, LOOP-03
**Success Criteria** (what must be TRUE):
  1. Asking a question already covered by the wiki returns an answer sourced from existing articles without triggering a web search
  2. Asking the same question twice — first run fetches web and writes an article, second run answers from the wiki
  3. After a Q&A answer is generated, the user is prompted to approve filing it back into the wiki; answering yes creates or updates an article marked `type: compound`
  4. The orchestrator correctly routes between "answer from wiki" and "search web" based on coverage confidence, with the threshold configurable in `~/.llm-wiki/config.json`
**Plans**: TBD
**UI hint**: no

### Phase 6: OpenClaw Skill
**Goal**: The wiki is accessible from any OpenClaw-connected interface (Telegram, Claude Code) with no new logic — the CLI is the implementation, the skill is a thin wrapper
**Depends on**: Phase 5
**Requirements**: INTG-01, INTG-03
**Success Criteria** (what must be TRUE):
  1. A user can invoke `wiki ask` and `wiki search` from within a Claude Code session via the registered OpenClaw skill
  2. Running `wiki ask "..." --refresh` re-fetches web sources for an existing article when its `sourced_at` date is stale, rather than answering from cached content
  3. The skill can be installed globally (`npm install -g`) and invoked as a subprocess with clean stdout (no spinner or TTY escape codes)
**Plans**: TBD
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete    | 2026-04-04 |
| 2. LLM Adapter | 1/1 | Complete   | 2026-04-04 |
| 3. Ingestion | 3/3 | Complete   | 2026-04-04 |
| 4. Synthesis | 0/TBD | Not started | - |
| 5. Retrieval + Feedback Loop | 0/TBD | Not started | - |
| 6. OpenClaw Skill | 0/TBD | Not started | - |

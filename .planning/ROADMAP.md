# Roadmap: LLM Wiki

## Overview

Nine phases build the compounding knowledge engine. Phases 1-6 (v1.0, complete) deliver the core pipeline: foundation, LLM adapter, ingestion, synthesis, retrieval feedback loop, and OpenClaw skill. Phases 7-9 (v1.1, Karpathy alignment) close the gap with Karpathy's full LLM wiki vision: a schema layer that teaches the LLM wiki conventions, multi-page ingest that ripples knowledge across 10-15 existing articles per source, an activity log, lint+heal for wiki health, broad filing of any valuable output, and bidirectional backlinks for Obsidian graph integrity.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Wiki Store, CLI skeleton, and non-TTY-safe stdout/stderr separation (completed 2026-04-04)
- [x] **Phase 2: LLM Adapter** - Multi-provider LLM abstraction and config system (completed 2026-04-04)
- [x] **Phase 3: Ingestion** - Web search, HTML extraction, raw source storage, URL ingestion (completed 2026-04-04)
- [x] **Phase 4: Synthesis** - LLM article generation, citations, backlinks, dedup, provenance (completed 2026-04-04)
- [x] **Phase 5: Retrieval + Feedback Loop** - BM25 search, orchestrator routing, Q&A filing (completed 2026-04-04)
- [x] **Phase 6: OpenClaw Skill** - Integration wrapper for Telegram/Claude Code access + freshness refresh (completed 2026-04-05)
- [ ] **Phase 7: Schema + Activity Log** - Wiki schema file (LLM maintenance instructions) and append-only log.md
- [ ] **Phase 8: Multi-Page Ingest + Broad Filing + Graph** - Ripple updates across 10-15 pages per source, file any output, bidirectional backlinks
- [ ] **Phase 9: Lint + Heal** - Wiki health checks (contradictions, orphans, stale claims, missing pages) and auto-fix

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
**Plans**: 3 plans
**UI hint**: no

Plans:
- [x] 04-01-PLAN.md — Extend LLM adapter (GenerateOptions), synthesis types, prompt-builder, output-parser
- [x] 04-02-PLAN.md — Deduplicator (slug + BM25 + LLM tiebreak), article-builder, wikilink sanitizer
- [x] 04-03-PLAN.md — Synthesizer orchestrator and ask command CLI wiring

### Phase 5: Retrieval + Feedback Loop
**Goal**: The wiki answers its own questions — the system checks local knowledge before fetching the web, and Q&A answers compound back into the wiki as durable artifacts
**Depends on**: Phase 4
**Requirements**: RETR-01, RETR-02, RETR-03, LOOP-01, LOOP-02, LOOP-03
**Success Criteria** (what must be TRUE):
  1. Asking a question already covered by the wiki returns an answer sourced from existing articles without triggering a web search
  2. Asking the same question twice — first run fetches web and writes an article, second run answers from the wiki
  3. After a Q&A answer is generated, the user is prompted to approve filing it back into the wiki; answering yes creates or updates an article marked `type: compound`
  4. The orchestrator correctly routes between "answer from wiki" and "search web" based on coverage confidence, with the threshold configurable in `~/.llm-wiki/config.json`
**Plans**: 3 plans
**UI hint**: no

Plans:
- [x] 05-01-PLAN.md — Config extension (coverage_threshold), coverage assessment engine, wiki answer generator
- [x] 05-02-PLAN.md — Compound article filing pipeline (Q&A-to-article conversion, dedup, wiki:// sources)
- [x] 05-03-PLAN.md — CLI wiring: ask command wiki-first flow, --web flag, readline confirmation, tests

### Phase 6: OpenClaw Skill
**Goal**: The wiki is accessible from any OpenClaw-connected interface (Telegram, Claude Code) with no new logic — the CLI is the implementation, the skill is a thin wrapper
**Depends on**: Phase 5
**Requirements**: INTG-01, INTG-03
**Success Criteria** (what must be TRUE):
  1. A user can invoke `wiki ask` and `wiki search` from within a Claude Code session via the registered OpenClaw skill
  2. Running `wiki ask "..." --refresh` re-fetches web sources for an existing article when its `sourced_at` date is stale, rather than answering from cached content
  3. The skill can be installed globally (`npm install -g`) and invoked as a subprocess with clean stdout (no spinner or TTY escape codes)
**Plans**: 2 plans
**UI hint**: no

Plans:
- [x] 06-01-PLAN.md — Config extension (freshness_days), --refresh flag, non-TTY guard, tests
- [x] 06-02-PLAN.md — OpenClaw SKILL.md creation, npm packaging (prepare, files), human verification

### Phase 7: Schema + Activity Log
**Goal**: The wiki has a self-describing schema file that teaches the LLM how to maintain it, and a chronological log of every operation — establishing the "three-layer architecture" from Karpathy's design
**Depends on**: Phase 6
**Requirements**: SCHEMA-01, SCHEMA-02, LOG-01, LOG-02
**Success Criteria** (what must be TRUE):
  1. A `schema.md` file exists in the vault root, defining page types, frontmatter conventions, category taxonomy, and wikilink style — the LLM reads it before every synthesis operation
  2. The schema co-evolves: running `wiki ask` for a topic not covered by existing categories prompts the LLM to propose a schema update
  3. A `log.md` file in the vault appends a timestamped entry for every wiki mutation (article create, update, index rebuild, lint run)
  4. `log.md` entries follow a parseable format: `## [YYYY-MM-DD HH:MM] operation | description`
**Plans**: 2 plans
**UI hint**: no

Plans:
- [x] 07-01-PLAN.md — WikiStore extension (readSchema, updateSchema, appendLog) and schema template module
- [x] 07-02-PLAN.md — Prompt-builder schema injection, synthesizer wiring, schema bootstrap, co-evolution

### Phase 8: Multi-Page Ingest + Broad Filing + Graph
**Goal**: A single source ripples knowledge across the entire wiki — not just one article. Any valuable LLM output (comparisons, analyses, connections) can be filed back. Backlinks are bidirectional for Obsidian graph view.
**Depends on**: Phase 7
**Requirements**: MULTI-01, MULTI-02, LOOP-04, LOOP-05, GRAPH-01, GRAPH-02
**Success Criteria** (what must be TRUE):
  1. Running `wiki ask "flash attention"` creates/updates the primary article AND updates 5+ existing related articles (e.g., transformer, attention mechanisms, training optimization) with cross-references and new findings
  2. Running `wiki file "Flash attention is faster than standard attention because..."` files the content into the appropriate existing article(s) or creates new ones — the LLM decides placement
  3. After any article write, every `[[wikilink]]` target has a reciprocal backlink to the source article — Obsidian graph view shows full bidirectional connectivity
  4. `log.md` records all ripple updates (not just the primary article)
**Plans**: 3 plans
**UI hint**: no

Plans:
- [x] 08-01-PLAN.md — Ripple module, backlink enforcer, See Also utility, Frontmatter type extension
- [x] 08-02-PLAN.md — Ask command integration: wire ripple + backlink enforcement after synthesis
- [x] 08-03-PLAN.md — Wiki file command: broad filing with LLM placement, ripple, backlinks

### Phase 9: Lint + Heal
**Goal**: The wiki maintains its own health — finding contradictions, orphan pages, stale claims, and missing concepts, then auto-fixing what it can
**Depends on**: Phase 8
**Requirements**: LINT-01, LINT-02, LINT-03
**Success Criteria** (what must be TRUE):
  1. Running `wiki lint` produces a structured report of contradictions between articles, orphan pages (no inbound links), concepts mentioned but lacking their own page, stale articles (old `sourced_at`), and missing cross-references
  2. Each lint finding has a category, severity, affected articles, and a concrete suggested fix
  3. Running `wiki heal` auto-fixes findings: creates missing concept pages, adds missing cross-references, re-fetches stale articles via `--refresh`, flags contradictions for human review
  4. Lint + heal append to `log.md` like any other wiki operation
**Plans**: TBD
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete    | 2026-04-04 |
| 2. LLM Adapter | 1/1 | Complete   | 2026-04-04 |
| 3. Ingestion | 3/3 | Complete   | 2026-04-04 |
| 4. Synthesis | 3/3 | Complete   | 2026-04-04 |
| 5. Retrieval + Feedback Loop | 3/3 | Complete   | 2026-04-04 |
| 6. OpenClaw Skill | 2/2 | Complete   | 2026-04-05 |
| 7. Schema + Activity Log | 0/2 | Not started | - |
| 8. Multi-Page Ingest + Broad Filing + Graph | 0/3 | Not started | - |
| 9. Lint + Heal | 0/TBD | Not started | - |

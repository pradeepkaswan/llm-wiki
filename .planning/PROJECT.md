# LLM Wiki

## What This Is

A personal knowledge engine that turns questions into a growing wiki. You ask a question, the system searches the web, fetches sources, and an LLM synthesizes everything into organized Markdown articles in your Obsidian vault — with backlinks, concept categories, and an auto-maintained index. Every answer compounds the wiki. Inspired by Andrej Karpathy's "How LLMs Turn Raw Research Into a Living Knowledge Base."

## Core Value

Every question you ask makes the wiki smarter — the knowledge compounds automatically.

## Requirements

### Validated

- [x] Configurable LLM provider (Claude, OpenAI, Ollama) — Validated in Phase 2: LLM Adapter
- [x] Raw web sources stored as-is before processing — Validated in Phase 3: Ingestion
- [x] LLM synthesizes sources into structured .md wiki articles — Validated in Phase 4: Synthesis
- [x] Articles include summaries, backlinks, and concept categories — Validated in Phase 4: Synthesis
- [x] Broad topic questions build connected knowledge clusters (multiple linked articles) — Validated in Phase 4: Synthesis
- [x] Q&A against existing wiki content (no re-searching if wiki knows it) — Validated in Phase 5: Retrieval + Feedback Loop
- [x] Answers from Q&A filed back into wiki as knowledge compounds — Validated in Phase 5: Retrieval + Feedback Loop
- [x] Claude Code skill for using the wiki from within Claude Code sessions — Validated in Phase 6: OpenClaw Skill

### Active

- [ ] Wiki articles stored in existing Obsidian vault (Pradeep's Vault)
- [ ] Auto-maintained index of all wiki articles

### Out of Scope

- Obsidian plugin — deferred to future milestone
- Web UI / chat interface — CLI-first
- Manual source ingestion (drag-and-drop files) — question-driven only for v1
- Domain-specific source prioritization — domain-agnostic search
- Fine-tuning LLM on wiki data — future goal per Karpathy's "Looking Ahead"
- Lint + Heal automation — future milestone (auto-finding inconsistencies, imputing missing info)

## Context

- User already has an Obsidian vault at `~/Desktop/Pradeep's Vault/` with a few notes
- User is a software engineer comfortable with Next.js, FastAPI, and TypeScript
- Inspired by Karpathy's diagram showing a 5-step pipeline: Sources → raw/ → Wiki → Q&A Agent → Output
- The key insight is the feedback loop: Q&A answers get filed back into the wiki
- Web search is the primary source collection mechanism (not manual file collection)
- Node/TypeScript chosen for natural CLI tool + Claude Code skill integration

## Constraints

- **Stack**: Node/TypeScript — aligns with CLI tooling and Claude Code skill ecosystem
- **Storage**: Markdown files in Obsidian vault — must be valid Obsidian-compatible markdown
- **LLM**: Must support multiple providers via configuration (Claude API, OpenAI API, Ollama)
- **Search**: Needs a web search mechanism (API-based — Brave, Exa, or similar)
- **Privacy**: Raw sources and wiki live locally on disk, not in the cloud

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript/Node stack | Natural fit for CLI tools and Claude Code skills | — Pending |
| Obsidian vault as wiki target | User already uses Obsidian, articles appear automatically | — Pending |
| Question-driven ingestion | Matches user's mental model (ask → learn → wiki grows) | — Pending |
| Configurable LLM providers | Flexibility between quality, cost, and privacy | — Pending |
| CLI as primary interface | Fastest to build, natural for developer workflow | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-05 after Phase 6 completion — all v1 milestone phases complete*

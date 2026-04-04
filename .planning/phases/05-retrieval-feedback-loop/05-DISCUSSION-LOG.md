# Phase 5: Retrieval + Feedback Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 05-retrieval-feedback-loop
**Areas discussed:** Coverage Confidence Scoring, Wiki Answer Generation, Compound Article Structure, User Approval UX & CLI Flags
**Mode:** Auto (--auto flag — all options auto-selected as recommended defaults)

---

## Coverage Confidence Scoring

| Option | Description | Selected |
|--------|-------------|----------|
| BM25 threshold + config param | Use existing BM25 index, configurable threshold in config.json | ✓ |
| Multi-signal approach | BM25 + article count + freshness — more accurate but complex | |
| LLM confidence check | Ask LLM "can you answer?" — most accurate but expensive per query | |

**User's choice:** [auto] BM25 threshold + config param (recommended default)
**Notes:** Reuses existing `buildIndex()`/`search()` from search-index.ts. STATE.md explicitly flagged this as "design as configurable parameter from day one." Default threshold ~5.0, tunable per wiki size.

---

## Wiki Answer Generation

| Option | Description | Selected |
|--------|-------------|----------|
| Single generateText() with articles as context | One LLM call, Q&A system prompt, top 3-5 articles as context | ✓ |
| Multi-step summarize-then-synthesize | Summarize each article first, then synthesize answer from summaries | |

**User's choice:** [auto] Single generateText() with articles as context (recommended default)
**Notes:** Simplest approach, reuses existing adapter pattern. No streaming needed (Phase 2 D-08). Q&A prompt instructs LLM to answer from provided wiki content only.

---

## Compound Article Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Same structure as web articles, type: compound | Standard article format, wiki:// source refs, reuse saveArticle() | ✓ |
| Q&A format with question heading | Question as title, answer as body — visually distinct from web articles | |

**User's choice:** [auto] Same structure as web articles, type: compound (recommended default)
**Notes:** Reuses WikiStore.saveArticle() without changes. Distinguishable via frontmatter `type: compound`. Sources use `wiki://slug` prefix to differentiate from URLs.

---

## User Approval UX & CLI Flags

| Option | Description | Selected |
|--------|-------------|----------|
| stderr prompt y/N + --web flag | Simple readline confirmation for filing, --web flag to force web search | ✓ |
| Auto-file with --no-file opt-out | File by default, flag to skip — more aggressive compounding | |
| Preview article before asking | Show article preview, then ask — more informed but slower | |

**User's choice:** [auto] stderr prompt y/N + --web flag (recommended default)
**Notes:** Default "no" prevents low-quality Q&A from polluting wiki. --web flag provides escape hatch for forcing web search. Simple and non-intrusive.

---

## Claude's Discretion

- Module file placement within src/
- Q&A system prompt wording
- Q&A-to-article conversion prompt wording
- BM25 default threshold value (5.0 suggested)
- Test structure and mocking approach

## Deferred Ideas

None — discussion stayed within phase scope

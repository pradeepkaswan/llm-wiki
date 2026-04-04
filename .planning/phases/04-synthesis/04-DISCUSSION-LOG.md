# Phase 4: Synthesis - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 04-synthesis
**Areas discussed:** Article structure, Citation format, Backlink constraint, Topic clustering, Deduplication strategy, Update strategy
**Mode:** auto (all defaults selected)

---

## Article Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Summary + sections + sources | One-line summary, structured `##` sections, `## Sources` at bottom | ✓ |
| Flat prose | Single continuous body with no section headers | |
| Q&A format | Article structured as question/answer pairs | |

**User's choice:** [auto] Summary + structured sections + sources section (recommended default)
**Notes:** Matches Obsidian reading patterns. Summary populates frontmatter.summary for index.md.

---

## Citation Format

| Option | Description | Selected |
|--------|-------------|----------|
| Inline numbered refs + Sources section | `[1]` in body, numbered list at bottom | ✓ |
| Footnote-style | Obsidian footnote syntax `[^1]` | |
| Inline URLs | Direct URL links in body text | |

**User's choice:** [auto] Inline numbered refs [1][2] with Sources section at bottom (recommended default)
**Notes:** Clean standard markdown. URLs also stored in frontmatter.sources array for programmatic access.

---

## Backlink Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| LLM prompt + post-process validation | Feed article list to LLM, strip hallucinated links after | ✓ |
| Post-process only | Let LLM write freely, replace all wikilinks with validated ones | |
| LLM-only (no validation) | Trust LLM to follow instructions | |

**User's choice:** [auto] Feed article manifest to LLM + post-process validation (recommended default)
**Notes:** Belt-and-suspenders approach. LLM gets the list to produce good links, post-processing enforces the constraint. Zero hallucinated links.

---

## Topic Clustering

| Option | Description | Selected |
|--------|-------------|----------|
| Two-step (plan then generate) | LLM plans article split, then generates each separately | ✓ |
| Single-pass with split heuristic | One LLM call, code splits by headers if too long | |
| Always single article | Ignore SYNTH-04, one article per question | |

**User's choice:** [auto] Two-step: LLM plans subtopics, then generates each article (recommended default)
**Notes:** Plan step gives explicit control over when/how to split. Fulfills SYNTH-04 requirement for broad questions.

---

## Deduplication Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Slug match + BM25 near-match + LLM tiebreak | Three-tier: exact slug, then BM25 search, then LLM decides | ✓ |
| Slug match only | Simple exact title match via slugify | |
| LLM-only dedup | Ask LLM to compare titles/summaries | |

**User's choice:** [auto] Slug match first, then BM25 near-match, LLM final decision (recommended default)
**Notes:** Slug catches exact repeats (cheap). BM25 catches near-matches. LLM makes nuanced merge/create decisions.

---

## Update Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Intelligent merge (old + new → updated) | LLM receives existing article + new sources, produces merged result | ✓ |
| Full rewrite | Ignore existing article, synthesize fresh from all sources combined | |
| Append-only | Add new sections to existing article without rewriting | |

**User's choice:** [auto] LLM receives old content + new sources, produces intelligent merge (recommended default)
**Notes:** Preserves existing structure and content while incorporating new information. frontmatter.sources becomes union of old + new.

---

## Claude's Discretion

- Module file placement within `src/`
- Exact LLM prompt wording and formatting instructions
- BM25 similarity threshold for deduplication
- Source partitioning across multiple articles
- Error message wording
- Whether to add synthesis-specific config fields

## Deferred Ideas

None — discussion stayed within phase scope

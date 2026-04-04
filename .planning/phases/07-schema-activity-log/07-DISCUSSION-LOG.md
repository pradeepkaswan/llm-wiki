# Phase 7: Schema + Activity Log - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-05
**Phase:** 07-schema-activity-log
**Mode:** assumptions (--auto)
**Areas analyzed:** Schema File Location, Schema Injection, Schema Co-Evolution, Activity Log

## Assumptions Presented

### Schema File Location and Format
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| schema.md at vault root, not inside articles/ | Confident | wiki-store.ts articlesDir pattern, listArticles() filtering |
| Markdown format with structured sections | Confident | LLM prompts consume raw text, consistent with prompt-builder pattern |

### Schema Injection Into LLM Prompts
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Injected as user prompt section, not system prompt | Likely | prompt-builder.ts pattern, WIKILINKS section precedent |

### Schema Co-Evolution
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Deterministic taxonomy expansion (no LLM call) | Unclear | Requirement says "LLM proposes" but non-TTY guard blocks confirmation |

### Activity Log
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Centralized in WikiStore via appendLog() method | Likely | Sole disk writer invariant, saveArticle()/rebuildIndex() hooks |
| fs.appendFile() without locking | Likely | Single-process CLI, no concurrent writes |

## Auto-Resolved

- Schema co-evolution: auto-selected "deterministic taxonomy expansion" — simpler, avoids non-TTY issues. LLM-driven curation deferred.

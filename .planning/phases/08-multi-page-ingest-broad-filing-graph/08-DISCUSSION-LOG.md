# Phase 8: Multi-Page Ingest + Broad Filing + Graph - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-05
**Phase:** 08-multi-page-ingest-broad-filing-graph
**Mode:** assumptions (--auto)
**Areas analyzed:** Ripple Strategy, Broad Filing, Bidirectional Backlinks, LLM Cost

## Assumptions Presented

### Ripple Update Strategy
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Separate ripple module after synthesize() | Likely | synthesizer.ts loop pattern, testability |
| Lightweight cross-reference updates (not full rewrites) | Likely | Cost concern with 5-15 targets per ask |

### Broad Filing
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| New pipeline with LLM planning step for placement | Likely | article-filer.ts pattern, synthesize plan+generate pattern |

### Bidirectional Backlinks
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Body-level See Also section (not frontmatter) | Unclear | Obsidian graph reads [[wikilinks]] from body |

### LLM Cost
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Single batched LLM call for all ripple targets | Likely | Cost mitigation for 5-15 updates |

## Auto-Resolved

- Ripple: auto-selected "separate module" — cleaner separation, independently testable
- Broad filing: auto-selected "new pipeline with planning step" — mirrors synthesize() pattern
- Backlinks: auto-selected "body-level See Also" — Obsidian graph reads body wikilinks, not frontmatter
- LLM cost: auto-selected "lightweight ripple with batched call" — keeps cost manageable at scale

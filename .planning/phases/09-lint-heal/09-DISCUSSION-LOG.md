# Phase 9: Lint + Heal - Discussion Log (Assumptions Mode)

> **Audit trail only.**

**Date:** 2026-04-05
**Phase:** 09-lint-heal
**Mode:** assumptions (--auto)
**Areas analyzed:** Lint Architecture, Finding Data Model, Heal Strategy, Orphan Detection

## Auto-Resolved

- Lint architecture: structural checks locally + LLM for contradictions only — balanced cost/accuracy
- Heal strategy: lint-then-fix single pass (not piped from pre-computed file) — simpler
- Orphan detection: body-level wikilinks only (not frontmatter sources) — matches Obsidian graph

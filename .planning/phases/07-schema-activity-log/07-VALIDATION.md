---
phase: 7
slug: schema-activity-log
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 07-01-01 | 01 | 1 | SCHEMA-01, LOG-01 | unit | `npx vitest run tests/wiki-store.test.ts` | ⬜ pending |
| 07-01-02 | 01 | 1 | SCHEMA-02 | unit | `npx vitest run tests/synthesis.test.ts` | ⬜ pending |
| 07-02-01 | 02 | 2 | SCHEMA-02 | unit | `npx vitest run tests/synthesis.test.ts` | ⬜ pending |
| 07-02-02 | 02 | 2 | LOG-01, LOG-02 | integration | `npx vitest run tests/cli.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — vitest is installed and configured from Phase 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| schema.md visible in Obsidian vault | SCHEMA-01 | Requires Obsidian UI | Open vault, verify schema.md appears at root |
| log.md readable in Obsidian | LOG-01 | Requires Obsidian UI | Open vault, verify log.md shows chronological entries |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

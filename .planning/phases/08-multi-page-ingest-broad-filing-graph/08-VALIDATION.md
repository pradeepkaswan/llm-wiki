---
phase: 8
slug: multi-page-ingest-broad-filing-graph
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 8 — Validation Strategy

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
| 08-01-01 | 01 | 1 | MULTI-01, MULTI-02 | unit | `npx vitest run tests/ripple.test.ts` | ⬜ pending |
| 08-01-02 | 01 | 1 | GRAPH-01, GRAPH-02 | unit | `npx vitest run tests/backlink-enforcer.test.ts` | ⬜ pending |
| 08-02-01 | 02 | 2 | MULTI-01, GRAPH-02 | integration | `npx vitest run tests/cli.test.ts` | ⬜ pending |
| 08-02-02 | 02 | 2 | LOOP-04, LOOP-05 | unit | `npx vitest run tests/file-command.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — vitest is installed and configured from Phase 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Obsidian graph shows bidirectional edges | GRAPH-01 | Requires Obsidian UI | Open vault, check graph view for reciprocal links |
| Rippled articles readable in Obsidian | MULTI-02 | Requires Obsidian UI | Open vault, navigate to updated articles |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

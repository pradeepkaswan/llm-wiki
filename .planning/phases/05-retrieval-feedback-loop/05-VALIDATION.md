---
phase: 5
slug: retrieval-feedback-loop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/retrieval.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/retrieval.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | RETR-01 | unit | `npx vitest run tests/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | RETR-02 | unit | `npx vitest run tests/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | RETR-03 | unit | `npx vitest run tests/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | LOOP-01 | unit | `npx vitest run tests/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | LOOP-02 | unit | `npx vitest run tests/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 1 | LOOP-03 | unit | `npx vitest run tests/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | D-06 | unit | `npx vitest run tests/cli.test.ts` | ✅ (extend) | ⬜ pending |
| 05-03-02 | 03 | 2 | D-14 | unit | `npx vitest run tests/cli.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-03 | 03 | 2 | D-15 | unit | `npx vitest run tests/cli.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/retrieval.test.ts` — stubs for RETR-01, RETR-02, RETR-03, LOOP-01, LOOP-02, LOOP-03
- [ ] Mock pattern: class-based `MockWikiStore` (same as `synthesis.test.ts`)
- [ ] Mock `generateText` via `vi.mock('../src/llm/adapter.js', ...)` (same pattern as `synthesis.test.ts`)

*Existing infrastructure covers framework needs — no new install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive y/N prompt | LOOP-03 | Requires stdin input | Run `wiki ask "question"` with wiki coverage, verify prompt appears on stderr, type y/N |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

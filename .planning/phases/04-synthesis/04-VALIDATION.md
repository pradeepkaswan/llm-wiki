---
phase: 4
slug: synthesis
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npx vitest run tests/synthesis.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/synthesis.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | SYNTH-01 | unit (mocked LLM) | `npx vitest run tests/synthesis.test.ts -t "synthesize"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | SYNTH-02 | unit | `npx vitest run tests/synthesis.test.ts -t "citations"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | SYNTH-03 | unit | `npx vitest run tests/synthesis.test.ts -t "wikilink"` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | SYNTH-06 | unit | `npx vitest run tests/synthesis.test.ts -t "frontmatter validation"` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | SYNTH-07 | unit | `npx vitest run tests/synthesis.test.ts -t "provenance"` | ❌ W0 | ��� pending |
| 04-02-01 | 02 | 2 | SYNTH-04 | unit (mocked LLM) | `npx vitest run tests/synthesis.test.ts -t "multi-article"` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | SYNTH-05 | unit (mocked WikiStore) | `npx vitest run tests/synthesis.test.ts -t "dedup"` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 3 | D-17 | unit (vi.mock) | `npx vitest run tests/cli.test.ts -t "ask.*stdout"` | Update existing | �� pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/synthesis.test.ts` — stubs for SYNTH-01 through SYNTH-07; uses vi.mock for LLM calls
- [ ] Update `tests/cli.test.ts` — ask command tests must verify article title written to stdout (D-17)

*Existing test infrastructure (vitest, vitest.config.ts) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM output quality | SYNTH-01 | Prompt effectiveness requires human judgment | Run `wiki ask "What is flash attention?"` and review article structure |
| Obsidian rendering | SYNTH-06 | Obsidian-specific rendering not automatable | Open generated article in Obsidian, verify frontmatter, wikilinks, and formatting |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---
phase: 6
slug: openclaw-skill
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 6 — Validation Strategy

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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | INTG-03 | — | N/A | unit | `npx vitest run tests/config.test.ts` | TBD | ⬜ pending |
| 06-01-02 | 01 | 1 | INTG-03 | — | Non-TTY auto-decline | unit | `npx vitest run tests/ask.test.ts` | TBD | ⬜ pending |
| 06-02-01 | 02 | 2 | INTG-01 | — | N/A | integration | `npm install -g . && wiki ask --help` | TBD | ⬜ pending |
| 06-02-02 | 02 | 2 | INTG-01 | — | N/A | manual | Verify SKILL.md in skills/ directory | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — vitest is installed and configured from Phase 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SKILL.md teaches OpenClaw agent to use wiki commands | INTG-01 | Requires OpenClaw runtime environment | Install skill, invoke from Claude Code session |
| Global `npm install -g` produces working `wiki` binary | INTG-01 | Requires clean npm install environment | Run `npm install -g .` in fresh terminal, verify `wiki --help` works |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

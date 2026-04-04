---
phase: 06-openclaw-skill
plan: "02"
subsystem: skill-manifest, npm-packaging
tags: [openclaw, skill, npm, packaging, global-install]
dependency_graph:
  requires: [06-01]
  provides: [openclaw-skill-manifest, npm-global-install]
  affects: [skills/llm-wiki/SKILL.md, package.json]
tech_stack:
  added: []
  patterns: [openclaw-skill-format, npm-lifecycle-scripts, files-field]
key_files:
  created:
    - skills/llm-wiki/SKILL.md
  modified:
    - package.json
decisions:
  - "SKILL.md metadata field uses single-line JSON per OpenClaw parser requirement"
  - "prepare + prepublishOnly dual-script approach covers both local install and registry publish paths"
  - "files field includes dist/, skills/, package.json — prevents dev artifacts from shipping"
  - "All four commands (ask, search, list, ingest) documented in SKILL.md per discretion note in plan"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_modified: 2
requirements: [INTG-01]
---

# Phase 6 Plan 02: OpenClaw SKILL.md and npm Packaging Summary

**One-liner:** OpenClaw SKILL.md with subprocess invocation instructions for all four commands plus npm prepare/files packaging for global install via npm install -g.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create OpenClaw SKILL.md | 29d70dc | skills/llm-wiki/SKILL.md |
| 2 | Configure npm packaging for global install | f8d3e84 | package.json |
| 3 | Verify global install and skill availability | auto-approved | — |

## What Was Built

### Task 1: OpenClaw SKILL.md

Created `skills/llm-wiki/SKILL.md` at the project root in the `skills/llm-wiki/` directory (OpenClaw workspace skill path #1 — highest priority). The file has YAML frontmatter with all required OpenClaw fields:

- `name: llm-wiki`
- `description: Query and grow a local Obsidian wiki from natural language questions`
- `version: 1.0.0`
- `metadata: {"openclaw":{"requires":{"bins":["wiki"]}}}` — single-line JSON as required by OpenClaw parser; `bins: ["wiki"]` causes OpenClaw to skip this skill if the `wiki` binary is not on PATH

The markdown body documents all four commands with explicit stdout/stderr parsing instructions:
- `wiki ask "<question>"` — wiki-first with web fallback; `--web` and `--refresh` flags documented
- `wiki search "<query>"` — JSON array output to stdout
- `wiki list` — JSON array of all articles to stdout
- `wiki ingest <url>` — synthesizes URL into wiki; article title to stdout

Parsing section explicitly states: "Never parse stderr — it is for human display only." This leverages the stdout/stderr contract enforced since Phase 1 D-02.

### Task 2: npm Packaging

Two changes to `package.json`:

1. **Scripts addition**: Added `"prepare": "npm run build"` and `"prepublishOnly": "npm run build"` to the scripts block.
   - `prepare` runs on `npm install -g .` (local source installs) — compiles TypeScript before `bin` entry resolves
   - `prepublishOnly` runs before `npm publish` — ensures dist/ is fresh before pack

2. **Files field**: Added `"files": ["dist/", "skills/", "package.json"]` to limit published package contents. Prevents .planning/, tests/, src/, and dev artifacts from shipping to the npm registry. Registry installs (`npm install -g llm-wiki`) receive pre-built dist/ — the `prepare` script does NOT run on registry installs.

`dist/index.js` shebang (`#!/usr/bin/env node`) verified as present — required for global CLI execution per D-13.

### Task 3: Human Verification (Auto-approved)

Auto-approved checkpoint. Automated verification confirmed:
- `skills/llm-wiki/SKILL.md` exists with valid OpenClaw frontmatter
- `package.json` scripts.prepare == "npm run build", scripts.prepublishOnly == "npm run build"
- `package.json` files includes "dist/", "skills/", "package.json"
- Full test suite: 262 tests passed (unchanged from Plan 01)
- `dist/index.js` line 1: `#!/usr/bin/env node`

## Test Results

- Full suite: **262 tests passed** (unchanged — no new test code in this plan)
- Package.json validation: PASS (automated node -e check)
- SKILL.md file existence and frontmatter checks: all PASS

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The SKILL.md is a complete, fully-wired skill manifest. The package.json changes are complete configuration — no placeholders or TODOs.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. SKILL.md is a static file read by OpenClaw at load time — no runtime user input accepted. Threats T-06-04, T-06-05, T-06-06 all accepted per plan's threat model with no mitigations required.

## Self-Check

Files exist:
- skills/llm-wiki/SKILL.md: FOUND
- package.json: FOUND (modified)

Commits exist:
- 29d70dc (Task 1): FOUND
- f8d3e84 (Task 2): FOUND

## Self-Check: PASSED

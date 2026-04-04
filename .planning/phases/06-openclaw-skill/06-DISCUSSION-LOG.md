# Phase 6: OpenClaw Skill - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-04-04
**Phase:** 06-openclaw-skill
**Mode:** assumptions (--auto)
**Areas analyzed:** Article Freshness, readline/Non-TTY, OpenClaw Skill Integration, npm Packaging

## Assumptions Presented

### Article Freshness / `--refresh` Flag
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `--refresh` checks `sourced_at` age against configurable `freshness_days`, then delegates to existing `--web` code path | Likely | src/commands/ask.ts, src/config/config.ts, src/synthesis/deduplicator.ts |
| Staleness threshold is configurable (not hardcoded) following established config extension pattern | Likely | src/config/config.ts DEFAULTS pattern, Phase 5 D-02 precedent |

### readline / Non-TTY Subprocess Compatibility
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| confirmFiling() must auto-decline when process.stdin.isTTY is false | Confident | src/commands/ask.ts lines 17-28, readline bound to process.stdin |

### OpenClaw Skill Integration
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Skill is a SKILL.md file with YAML frontmatter + Markdown instructions for subprocess CLI invocation | Confident (after research) | OpenClaw docs, ROADMAP "thin wrapper with no new logic" |
| No MCP server needed — OpenClaw's native skill system is sufficient | Likely | OpenClaw docs show MCP is complementary, not required |

### npm Packaging Readiness
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Needs prepare script for `npm install -g` to work | Confident | package.json has bin entry but no prepare script |
| Needs files field to limit published content | Confident | No files field, npm pack would include everything |

## Corrections Made

No corrections — all assumptions confirmed (--auto mode).

## Auto-Resolved

- Article Freshness: auto-selected "reuse `--web` path with staleness check + configurable `freshness_days`" (recommended default)
- Staleness threshold: auto-selected "configurable via `freshness_days` in config" (follows established pattern)

## External Research

- **OpenClaw platform identity**: Confirmed real platform (not placeholder) — self-hosted AI assistant with SKILL.md-based skill system (Source: docs.openclaw.ai, github.com/openclaw/openclaw)
- **Skill format**: YAML frontmatter + Markdown instructions, subprocess invocation of CLI commands (Source: docs.openclaw.ai/tools/skills)
- **Registration**: ClawHub CLI (`npm i -g clawhub`) for marketplace, or local `~/.openclaw/skills/` directory (Source: docs.openclaw.ai/tools/skills)
- **MCP relationship**: OpenClaw supports MCP as complementary protocol, but skills are its own system — SKILL.md is the right target for Phase 6 (Source: docs.openclaw.ai/cli/mcp)

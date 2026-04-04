# Phase 6: OpenClaw Skill - Context

**Gathered:** 2026-04-04 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Wrap the stable CLI as an OpenClaw skill so the wiki is accessible from any OpenClaw-connected interface (Telegram, Claude Code, etc.) with no new business logic. The CLI is the implementation; the skill is a thin SKILL.md wrapper. The only new CLI logic is the `--refresh` flag for article freshness (INTG-03) and non-TTY subprocess compatibility.

</domain>

<decisions>
## Implementation Decisions

### OpenClaw Skill Format
- **D-01:** The skill is a `SKILL.md` file with YAML frontmatter declaring `bins: [wiki]` and Markdown instructions teaching the OpenClaw agent how to invoke `wiki ask`, `wiki search`, `wiki ingest`, and `wiki list` as subprocess commands. This follows the standard OpenClaw skill format (YAML frontmatter + numbered instruction steps).
- **D-02:** The skill lives in a `skills/llm-wiki/` directory at the project root. It can also be installed globally via ClawHub or by placing it in `~/.openclaw/skills/`.
- **D-03:** The skill instructions parse stdout (machine-readable data) and ignore stderr (progress/status). This leverages the stdout/stderr contract enforced since Phase 1 D-02.
- **D-04:** No MCP server needed — OpenClaw's native skill system uses subprocess invocation, which is exactly what the codebase was designed for. MCP is a future enhancement path, not Phase 6 scope.

### Article Freshness / `--refresh` Flag
- **D-05:** Add `--refresh` flag to `wiki ask` command. When set: (1) check if existing wiki articles for the topic have a `sourced_at` date older than `freshness_days`, (2) if stale, re-run the web search-fetch-synthesize flow (reusing the existing `--web` code path), (3) the deduplication layer updates the existing article rather than creating a duplicate.
- **D-06:** Add `freshness_days` to the `Config` interface with a sensible default (e.g., 30 days). Follows the established config extension pattern: add field to Config type, add to DEFAULTS, add validation in validateConfig(). This mirrors `coverage_threshold` from Phase 5 D-02.
- **D-07:** When `--refresh` is used and no existing article is found (nothing to refresh), fall through to the normal web search flow — `--refresh` degrades gracefully to `--web` behavior.
- **D-08:** Staleness check uses the `sourced_at` ISO timestamp from article frontmatter, compared against `Date.now() - (freshness_days * 86400000)`.

### Non-TTY Subprocess Compatibility
- **D-09:** The `confirmFiling()` readline prompt in `wiki ask` must auto-decline (default "no") when `process.stdin.isTTY` is false. This prevents the CLI from hanging when invoked as a subprocess by OpenClaw or any non-interactive caller.
- **D-10:** No other interactive prompts exist in the codebase — readline in `confirmFiling()` is the only TTY-dependent code path. All other output already goes to stderr via `process.stderr.write()`.

### npm Packaging for Global Install
- **D-11:** Add a `"prepare": "npm run build"` script to package.json so that `npm install -g .` and `npm install -g llm-wiki` (from registry) both compile TypeScript before the `bin` entry resolves.
- **D-12:** Add a `"files"` field to package.json listing `dist/`, `skills/`, and `package.json` to limit what gets published. Prevents dev artifacts, tests, and .planning/ from shipping.
- **D-13:** Verify the `dist/index.js` has the `#!/usr/bin/env node` shebang for global CLI execution.

### Claude's Discretion
- SKILL.md instruction wording and step ordering
- Default value for `freshness_days` (30 suggested, may adjust)
- Whether to include `wiki list` and `wiki ingest` in the skill or just `wiki ask` and `wiki search`
- Test structure and approach for --refresh and non-TTY behavior
- README updates or skill documentation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project vision, core value, constraints
- `.planning/REQUIREMENTS.md` — INTG-01 (OpenClaw skill), INTG-02 (non-TTY safe, already complete), INTG-03 (article freshness + --refresh)
- `.planning/ROADMAP.md` — Phase 6 success criteria, dependency chain

### Prior Phases
- `.planning/phases/01-foundation/01-CONTEXT.md` — stdout/stderr contract (D-02), CLI invocation as `wiki` (D-03), frontmatter schema (D-07 including `sourced_at`, `type`)
- `.planning/phases/05-retrieval-feedback-loop/05-CONTEXT.md` — `--web` flag (D-14), wiki-first flow (D-15), readline confirmFiling (D-11-D-13), wiki answer stdout (D-06)

### Existing Code (Phase 6 reads/extends)
- `src/commands/ask.ts` — Full pipeline with wiki-first flow, --web flag, confirmFiling() readline prompt
- `src/config/config.ts` — Config interface, loadConfig(), DEFAULTS, validateConfig() — extend with freshness_days
- `src/types/article.ts` — Frontmatter with `sourced_at` (ISO string), `type: 'web' | 'compound'`
- `src/index.ts` — Commander entry point, configureOutput stderr redirect
- `src/synthesis/deduplicator.ts` — findExistingArticle() — handles "same topic exists" by updating
- `src/synthesis/article-builder.ts` — buildUpdatedArticle() refreshes sourced_at on updates
- `package.json` — bin field, scripts, dependencies

### OpenClaw Skill System
- OpenClaw Docs: https://docs.openclaw.ai/tools/skills — SKILL.md format spec, frontmatter schema, installation paths
- ClawHub: https://clawhub.ai — Skill registry/marketplace for distribution

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `configureOutput()` in `src/index.ts` (lines 10-17): All Commander output already redirected to stderr. No changes needed for subprocess compatibility.
- `--web` flag in `src/commands/ask.ts`: Already bypasses wiki check and runs full search-fetch-synthesize flow. `--refresh` reuses this path after staleness check.
- `findExistingArticle()` in `src/synthesis/deduplicator.ts`: Three-tier dedup ensures `--refresh` updates existing articles rather than creating duplicates.
- `buildUpdatedArticle()` in `src/synthesis/article-builder.ts`: Already refreshes `sourced_at` and merges sources on article updates.
- Config extension pattern in `src/config/config.ts`: DEFAULTS object, validateConfig(), Config interface — established in Phase 2 and extended in Phase 3 and Phase 5.

### Established Patterns
- Config extension: add field to Config interface + DEFAULTS + validateConfig() (done 3 times already)
- stderr for progress, stdout for machine-readable data only (all 4 commands)
- Sequential processing with per-item error handling (ask command)
- Atomic file writes via WikiStore

### Integration Points
- `src/commands/ask.ts` — Add `--refresh` flag option, add staleness check before wiki-first flow, add isTTY guard on confirmFiling()
- `src/config/config.ts` — Add `freshness_days` to Config interface and DEFAULTS
- `package.json` — Add prepare script, files field
- `skills/llm-wiki/SKILL.md` — New file (skill manifest + instructions)

</code_context>

<specifics>
## Specific Ideas

- The `--refresh` flag and `--web` flag serve different purposes: `--web` always skips wiki and searches the web; `--refresh` checks if existing articles are stale and only re-fetches if they are. When nothing is stale or no articles exist, `--refresh` degrades gracefully.
- The non-TTY guard on confirmFiling() is critical — without it, the entire OpenClaw skill breaks for wiki-answered questions because readline hangs waiting for input that will never come.
- The SKILL.md should include clear output format instructions so the OpenClaw agent knows to parse stdout for article titles and answers, and to ignore stderr progress output.
- Distribution path: `npm install -g llm-wiki` puts `wiki` on PATH, then the SKILL.md teaches OpenClaw how to use it. Two separate install steps, clearly documented.

</specifics>

<deferred>
## Deferred Ideas

- MCP server implementation — future enhancement path beyond the SKILL.md approach
- Obsidian plugin integration — explicitly out of scope per PROJECT.md
- Auto-refresh on schedule (cron-style freshness checking) — could be a future skill enhancement

</deferred>

---

*Phase: 06-openclaw-skill*
*Context gathered: 2026-04-04*

# Phase 6: OpenClaw Skill - Research

**Researched:** 2026-04-04
**Domain:** OpenClaw skill authoring, npm CLI packaging for global install, Node.js TTY detection, article freshness logic
**Confidence:** HIGH (all code changes are within the existing codebase; skill format researched via official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The skill is a `SKILL.md` file with YAML frontmatter declaring `bins: [wiki]` and Markdown instructions teaching the OpenClaw agent how to invoke `wiki ask`, `wiki search`, `wiki ingest`, and `wiki list` as subprocess commands. This follows the standard OpenClaw skill format (YAML frontmatter + numbered instruction steps).
- **D-02:** The skill lives in a `skills/llm-wiki/` directory at the project root. It can also be installed globally via ClawHub or by placing it in `~/.openclaw/skills/`.
- **D-03:** The skill instructions parse stdout (machine-readable data) and ignore stderr (progress/status). This leverages the stdout/stderr contract enforced since Phase 1 D-02.
- **D-04:** No MCP server needed — OpenClaw's native skill system uses subprocess invocation, which is exactly what the codebase was designed for. MCP is a future enhancement path, not Phase 6 scope.
- **D-05:** Add `--refresh` flag to `wiki ask` command. When set: (1) check if existing wiki articles for the topic have a `sourced_at` date older than `freshness_days`, (2) if stale, re-run the web search-fetch-synthesize flow (reusing the existing `--web` code path), (3) the deduplication layer updates the existing article rather than creating a duplicate.
- **D-06:** Add `freshness_days` to the `Config` interface with a sensible default (e.g., 30 days). Follows the established config extension pattern: add field to Config type, add to DEFAULTS, add validation in validateConfig(). This mirrors `coverage_threshold` from Phase 5 D-02.
- **D-07:** When `--refresh` is used and no existing article is found (nothing to refresh), fall through to the normal web search flow — `--refresh` degrades gracefully to `--web` behavior.
- **D-08:** Staleness check uses the `sourced_at` ISO timestamp from article frontmatter, compared against `Date.now() - (freshness_days * 86400000)`.
- **D-09:** The `confirmFiling()` readline prompt in `wiki ask` must auto-decline (default "no") when `process.stdin.isTTY` is false. This prevents the CLI from hanging when invoked as a subprocess by OpenClaw or any non-interactive caller.
- **D-10:** No other interactive prompts exist in the codebase — readline in `confirmFiling()` is the only TTY-dependent code path. All other output already goes to stderr via `process.stderr.write()`.
- **D-11:** Add a `"prepare": "npm run build"` script to package.json so that `npm install -g .` and `npm install -g llm-wiki` (from registry) both compile TypeScript before the `bin` entry resolves.
- **D-12:** Add a `"files"` field to package.json listing `dist/`, `skills/`, and `package.json` to limit what gets published. Prevents dev artifacts, tests, and .planning/ from shipping.
- **D-13:** Verify the `dist/index.js` has the `#!/usr/bin/env node` shebang for global CLI execution.

### Claude's Discretion
- SKILL.md instruction wording and step ordering
- Default value for `freshness_days` (30 suggested, may adjust)
- Whether to include `wiki list` and `wiki ingest` in the skill or just `wiki ask` and `wiki search`
- Test structure and approach for --refresh and non-TTY behavior
- README updates or skill documentation

### Deferred Ideas (OUT OF SCOPE)
- MCP server implementation
- Obsidian plugin integration
- Auto-refresh on schedule (cron-style freshness checking)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTG-01 | OpenClaw skill allows querying the wiki from any OpenClaw-connected interface (Telegram, Claude Code, etc.) | SKILL.md format researched; subprocess invocation pattern confirmed; stdout/stderr contract already enforced in codebase |
| INTG-03 | Article freshness tracked via `sourced_at` frontmatter + `--refresh` flag to update stale articles | `sourced_at` ISO field exists in `Frontmatter` type; `--web` code path is the reuse target; config extension pattern is established |
</phase_requirements>

---

## Summary

Phase 6 is a thin integration and packaging phase. The codebase already satisfies most prerequisites: stdout goes to `process.stdout`, progress goes to `process.stderr`, article titles are written to stdout, and the deduplication layer already handles article updates. There are four distinct work items:

1. **SKILL.md** — A new file in `skills/llm-wiki/SKILL.md` with YAML frontmatter and numbered subprocess invocation instructions. The skill system is instruction-based; it teaches the OpenClaw agent which commands to run and how to parse stdout.

2. **`--refresh` flag** — Added to `wiki ask`, it checks `sourced_at` against `freshness_days` and re-runs the web flow if stale. The `--web` code path is the implementation; `--refresh` is a conditional gate that decides whether to invoke it.

3. **Non-TTY guard** — A single two-line change to `confirmFiling()` in `ask.ts`: if `!process.stdin.isTTY`, resolve `false` immediately rather than creating a readline interface. Without this, the subprocess invocation from OpenClaw hangs indefinitely.

4. **npm packaging** — Add `"prepare"`, `"prepublishOnly"`, and `"files"` to `package.json`. The `dist/index.js` shebang already exists (verified in codebase).

**Primary recommendation:** Implement in task order: (1) non-TTY guard first (highest risk of breaking existing behavior), (2) `freshness_days` config extension + `--refresh` flag, (3) SKILL.md, (4) npm packaging fields.

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `commander` | 14.0.3 | CLI option parsing for `--refresh` flag | Already the CLI framework; `.option('--refresh')` follows established pattern |
| `readline` (Node built-in) | built-in | Existing `confirmFiling()` uses it | Already in use; TTY guard is a 2-line addition |
| npm lifecycle scripts | npm 11.x | `prepare` / `prepublishOnly` hooks | Official npm packaging mechanism |

### No New Dependencies
Phase 6 adds zero new npm dependencies. All logic reuses existing infrastructure.

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure
```
skills/
└── llm-wiki/
    └── SKILL.md          # OpenClaw skill manifest + instructions
src/
└── commands/
    └── ask.ts            # Add --refresh flag and isTTY guard
src/
└── config/
    └── config.ts         # Add freshness_days to Config + DEFAULTS + validateConfig()
package.json              # Add prepare, prepublishOnly, files
```

### Pattern 1: OpenClaw SKILL.md Format

**What:** A Markdown file with YAML frontmatter that declares the skill's metadata and instructions for the agent.

**When to use:** Registering any CLI tool with OpenClaw so it can be invoked as a subprocess.

**SKILL.md structure (from official OpenClaw docs):**

```yaml
---
name: llm-wiki
description: Query and grow a local Obsidian wiki via natural language questions
version: 1.0.0
metadata: {"openclaw":{"requires":{"bins":["wiki"]}}}
---

## Overview

llm-wiki turns questions into wiki articles. ...

## Commands

### Step 1 — Ask a question (wiki-first, web fallback)

Run: `wiki ask "<question>"`

stdout: article title(s), one per line (machine-readable)
stderr: progress messages (ignore these)

...
```

Key frontmatter fields [VERIFIED: https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md]:
- `name` — required, lowercase, URL-safe
- `description` — required, short summary
- `version` — required, semver
- `metadata` — single-line JSON; `openclaw.requires.bins` lists required binaries

The `requires.bins: ["wiki"]` field causes OpenClaw to skip this skill at load time if `wiki` is not on PATH. This is the correct way to declare a binary dependency [VERIFIED: official clawhub skill-format.md].

**Installation paths** (precedence order, highest first) [VERIFIED: https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md]:
1. `<workspace>/skills`
2. `<workspace>/.agents/skills`
3. `~/.agents/skills`
4. `~/.openclaw/skills`
5. Bundled skills

The `skills/llm-wiki/SKILL.md` at project root satisfies path #1, meaning when the user opens a Claude Code session in the `llm-wiki` directory, the skill is automatically available.

### Pattern 2: Config Extension (established pattern, used 3x already)

**What:** Adding a new optional field to the `Config` interface follows a strict three-step pattern:

```typescript
// Step 1: Add to interface
export interface Config {
  // ... existing fields ...
  freshness_days: number;
}

// Step 2: Add to DEFAULTS
export const DEFAULTS: Config = {
  // ... existing defaults ...
  freshness_days: 30,
};

// Step 3: Add validation in validateConfig()
if (typeof config.freshness_days !== 'number' || config.freshness_days <= 0) {
  throw new Error('freshness_days must be a positive number in ~/.llm-wiki/config.json.');
}
```

[VERIFIED: src/config/config.ts — pattern confirmed from coverage_threshold addition in Phase 5]

**Critical:** Adding `freshness_days` to the `Config` interface will cause TypeScript errors in ALL existing test fixtures that construct `Config` objects via `validateConfig({...})` inline — unless `freshness_days` gets a default via `DEFAULTS` spread in `loadConfig()` (which it already does for all fields). However, the test fixtures construct `Config` objects directly, bypassing `loadConfig()`. The pattern is to add `freshness_days` to existing test fixtures, or make the field optional in the interface.

See: Pitfall #1 below.

### Pattern 3: `--refresh` Flag Logic Flow

**What:** `--refresh` is a conditional gate, not a new code path. It checks staleness, then delegates to the existing `--web` flow.

```typescript
// In ask.ts action handler:
.option('--refresh', 're-fetch sources for stale articles (older than freshness_days)')
.action(async (question: string, options: { web?: boolean; refresh?: boolean }) => {
  const config = await loadConfig();
  const store = new WikiStore(config.vault_path);

  // --refresh: check staleness of existing article
  if (options.refresh && !options.web) {
    const articles = await store.listArticles();
    const relevantArticle = /* find matching article by slug or BM25 */;
    const isStale = isArticleStale(relevantArticle, config.freshness_days);
    if (!isStale) {
      // Article is fresh — answer from wiki as normal
      // Fall through to wiki check (skip web)
    } else {
      // Article is stale — force web search
      options.web = true; // mutate options to trigger web path
    }
  }

  // Existing wiki-first flow continues unchanged...
```

[ASSUMED] — The exact staleness-check implementation and where to splice it into the existing `if (!options.web)` block are discretionary. The CONTEXT.md decisions define the behavior but not the precise code structure.

### Pattern 4: Non-TTY Guard on readline

**What:** Check `process.stdin.isTTY` before creating readline interface. If falsy, resolve immediately with `false`.

```typescript
async function confirmFiling(): Promise<boolean> {
  // Non-TTY guard (D-09): auto-decline when invoked as subprocess
  if (!process.stdin.isTTY) {
    return false;
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question('File this answer back into the wiki? [y/N] ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}
```

[VERIFIED: nodejs.org/api/tty.html — `process.stdin.isTTY` is `true` in TTY context, `undefined` (falsy) in subprocess/piped context]

Note: The Node.js docs recommend checking `process.stdout.isTTY` as the primary method for TTY detection, but `process.stdin.isTTY` is the correct check here because `confirmFiling()` reads from stdin. Both are `undefined` (falsy) in non-TTY contexts.

### Pattern 5: npm Packaging for Global Install

**What:** Two-script approach covering all installation paths.

```json
{
  "scripts": {
    "build": "tsc",
    "prepare": "npm run build",
    "prepublishOnly": "npm run build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "files": [
    "dist/",
    "skills/",
    "package.json"
  ]
}
```

**CRITICAL — `prepare` vs `prepublishOnly` behavior** [MEDIUM confidence — see Pitfall #2]:

| Script | Runs on `npm install -g .` (from source) | Runs on `npm install -g llm-wiki` (from registry) | Runs on `npm publish` |
|--------|-------------------------------------------|----------------------------------------------------|----------------------|
| `prepare` | YES | NO | YES |
| `prepublishOnly` | NO | NO | YES (before pack) |

This means:
- `npm install -g .` (local dev install): `prepare` runs, TypeScript compiles, `wiki` works.
- `npm install -g llm-wiki` (registry install): `prepare` does NOT run. The published package MUST include pre-built `dist/`. This is why `dist/` in the `files` field is mandatory.
- `npm publish`: `prepublishOnly` runs first (builds dist/), then pack includes `dist/`.

The correct model: **always publish pre-built dist/, never rely on prepare running during registry installs.**

### Anti-Patterns to Avoid

- **Calling `readline.createInterface()` before the TTY check:** Creates the interface (allocates resources) then tries to close it immediately. Check isTTY before any readline creation.
- **Using `options.web = true` mutation if TypeScript strict mode rejects it:** Instead, use a local variable `const forceWeb = options.web || shouldRefresh`.
- **Omitting `dist/` from `files`:** If `dist/` is not in `files`, registry installs get source-only — `wiki` command does not exist.
- **`freshness_days` validation rejecting 0:** Zero means "always refresh" — could be valid. Use `> 0` only if that's the intended semantics. The CONTEXT.md implies "positive" so `<= 0` should throw.
- **Multi-line YAML values in SKILL.md frontmatter:** The OpenClaw frontmatter parser requires `metadata` to be a single-line JSON string [VERIFIED: clawhub skill-format.md].

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Staleness date arithmetic | Custom date diff | `Date.now() - (freshness_days * 86400000)` | One-liner per D-08; no library needed |
| TTY detection | os/terminal inspection | `process.stdin.isTTY` (Node built-in) | Standard Node.js API, already reliable |
| CLI binary skip logic | Custom skill loader | `requires.bins` in SKILL.md metadata | OpenClaw's native dependency gate |
| Subprocess output routing | Manual fd piping | Existing stdout/stderr contract | Already enforced since Phase 1 D-02 |

---

## Common Pitfalls

### Pitfall 1: Config Interface Change Breaks Existing Test Fixtures

**What goes wrong:** Adding `freshness_days` to the `Config` interface causes TypeScript compile errors in every test that constructs a `Config` object inline — because the object literal no longer satisfies the interface. This affects `tests/config.test.ts` (8 instances), `tests/cli.test.ts` (8 instances), `tests/retrieval.test.ts` (3 instances), `tests/debug-cli.test.ts` (1 instance).

**Why it happens:** Existing `loadConfig()` mock objects in test fixtures are hardcoded without `freshness_days`. TypeScript strict mode rejects incomplete objects against the full `Config` interface.

**How to avoid:** Two strategies:
1. Add `freshness_days: 30` to every test fixture that constructs a `Config` object. (Correct but tedious — 20+ instances across 4 files.)
2. Make `freshness_days` optional in the `Config` interface (`freshness_days?: number`) with the default applied in `loadConfig()` via the DEFAULTS spread. This is the same pattern used for `llm_model` and `llm_base_url` which are optional.

Strategy 2 is recommended: `freshness_days?: number` in the interface, `freshness_days: 30` in DEFAULTS. `validateConfig()` checks `config.freshness_days !== undefined` before validating the number type. This avoids touching 20+ test fixtures.

[VERIFIED: src/config/config.ts — `llm_model?: string` and `llm_base_url?: string` are already optional in the interface, demonstrating the pattern is established]

**Warning signs:** `tsc` output containing "Property 'freshness_days' is missing in type '...' but required in type 'Config'".

### Pitfall 2: `prepare` Does NOT Run on `npm install -g <package>` from Registry

**What goes wrong:** Assuming `"prepare": "npm run build"` ensures the TypeScript is compiled for all installation paths. Users who `npm install -g llm-wiki` from the registry get a package without `dist/`, and `wiki` produces "Cannot find module" errors.

**Why it happens:** npm only runs `prepare` for: (1) local installs without a package name argument, (2) git-sourced dependencies, and (3) `npm publish`. It does NOT run `prepare` when installing a specific named package from the registry globally. [MEDIUM confidence — npm docs CSS rendering prevented direct verification; confirmed via multiple secondary sources]

**How to avoid:** Always include pre-built `dist/` in the published package via:
- `"files": ["dist/", "skills/"]` in package.json (ensures dist is packed)
- `"prepublishOnly": "npm run build"` ensures dist is built before every `npm publish`

**Warning signs:** `npm pack --dry-run` does not list any files from `dist/`.

### Pitfall 3: `confirmFiling()` Readline Hangs Forever in Subprocess

**What goes wrong:** OpenClaw invokes `wiki ask "question"` as a subprocess with no stdin attached. `readline.createInterface({ input: process.stdin })` blocks waiting for input that never arrives. The skill call never returns.

**Why it happens:** readline in non-TTY mode treats stdin as a stream with no EOF signal unless stdin is explicitly closed by the caller. OpenClaw subprocess invocation does not supply stdin input.

**How to avoid:** The non-TTY guard (D-09) is the fix — check `!process.stdin.isTTY` before creating readline. Return `false` immediately.

**Warning signs:** `wiki ask "question"` hangs when stdin is piped from `/dev/null` (test via `echo "" | wiki ask "test"`).

### Pitfall 4: `--refresh` Without Stale Articles Triggers Unnecessary Web Search

**What goes wrong:** If `--refresh` always forces web search regardless of article age, it defeats the purpose of the freshness check and causes unnecessary API calls.

**Why it happens:** Implementing `--refresh` as a simple alias for `--web` rather than a conditional gate.

**How to avoid:** The freshness check must come before the web path decision. Only set `forceWeb = true` when an article exists AND `sourced_at` is stale. If no matching article exists OR the article is fresh, fall through to the normal wiki-first flow.

### Pitfall 5: `sourced_at: null` for Older Articles

**What goes wrong:** The `Frontmatter` type defines `sourced_at: string | null`. Compound articles and older articles may have `sourced_at: null`. The staleness check must handle null without throwing.

**Why it happens:** Phase 1 defined `sourced_at` as nullable; compound articles generated by the feedback loop may legitimately have `sourced_at: null`.

**How to avoid:** Treat `sourced_at === null` as "always stale" (or "never stale" — pick a semantic and document it). Recommended: treat null as stale, so `--refresh` will always re-fetch articles that lack a source date.

[VERIFIED: src/types/article.ts line 4 — `sourced_at: string | null`]

---

## Code Examples

### Staleness Check Helper

```typescript
// Source: D-08 in CONTEXT.md + verified Frontmatter type
function isArticleStale(article: Article, freshnessDays: number): boolean {
  const { sourced_at } = article.frontmatter;
  if (sourced_at === null) return true; // null = always stale
  const stalenessMs = freshnessDays * 86400000;
  return Date.now() - new Date(sourced_at).getTime() > stalenessMs;
}
```

### Config Interface Extension (recommended optional approach)

```typescript
// Source: established pattern from src/config/config.ts
export interface Config {
  vault_path: string;
  llm_provider: LlmProvider;
  llm_model?: string;
  llm_base_url?: string;
  search_provider: SearchProvider;
  coverage_threshold: number;
  freshness_days?: number;   // NEW: optional, default 30
}

export const DEFAULTS: Config = {
  vault_path: path.join(os.homedir(), 'Desktop', "Pradeep's Vault"),
  llm_provider: 'claude',
  llm_base_url: 'http://localhost:11434',
  search_provider: 'exa',
  coverage_threshold: 5.0,
  freshness_days: 30,        // NEW
};

// In validateConfig():
if (config.freshness_days !== undefined &&
    (typeof config.freshness_days !== 'number' || config.freshness_days <= 0)) {
  throw new Error('freshness_days must be a positive number in ~/.llm-wiki/config.json.');
}
```

### Non-TTY Guard in confirmFiling()

```typescript
// Source: Node.js TTY docs + D-09
async function confirmFiling(): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;  // Non-interactive context — auto-decline
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question('File this answer back into the wiki? [y/N] ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}
```

### SKILL.md Template

```markdown
---
name: llm-wiki
description: Query and grow a local Obsidian wiki from natural language questions
version: 1.0.0
metadata: {"openclaw":{"requires":{"bins":["wiki"]}}}
---

## Overview

llm-wiki is a personal knowledge engine. Every question you ask either
retrieves an existing wiki answer or searches the web and synthesizes a
new article.

**stdout** — machine-readable output (article titles, search results, answers)
**stderr** — progress and status messages (ignore these)

## Commands

### Ask a question

Run: `wiki ask "<question>"`

- If the wiki has relevant articles, answers from them and outputs the answer to stdout.
- If the wiki is insufficient, searches the web and writes new articles. Outputs article title(s) to stdout.

Run with `--web` to always search the web regardless of wiki state.
Run with `--refresh` to re-fetch stale articles (older than configured freshness_days).

### Search the wiki

Run: `wiki search "<query>"`

Outputs a JSON array of matching articles to stdout. Each entry has `slug`, `title`, `summary`, and `score` fields.

### List all articles

Run: `wiki list`

Outputs a JSON array of all articles with `slug`, `title`, `categories`, and `updated_at`.

### Ingest a URL

Run: `wiki ingest <url>`

Fetches and synthesizes the URL into the wiki. No stdout output on success.

## Parsing Output

- `wiki ask`: Read stdout for the answer text (wiki path) or article titles (web path).
- `wiki search`: Parse stdout as JSON.
- `wiki list`: Parse stdout as JSON.
- All stderr output is for human display only — do not parse it.
```

[ASSUMED] — Exact wording is discretionary per CONTEXT.md Claude's Discretion section.

### package.json Changes

```json
{
  "scripts": {
    "build": "tsc",
    "prepare": "npm run build",
    "prepublishOnly": "npm run build",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "files": [
    "dist/",
    "skills/",
    "package.json"
  ]
}
```

[ASSUMED] — The `prepare` + `prepublishOnly` dual-script approach is recommended based on npm lifecycle behavior, but the exact strategy is one of the implementation decisions the planner can lock.

---

## Runtime State Inventory

> Not applicable — Phase 6 adds new files and extends existing CLI flags. No rename, rebrand, or data migration is involved.

None — verified by inspection. The `skills/` directory does not yet exist. The config addition (`freshness_days`) is additive and backward-compatible (new optional field with default). No stored data needs migration.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All CLI execution | YES | v24.14.0 | — |
| npm | Package lifecycle scripts | YES | 11.9.0 | — |
| `wiki` binary (via `npm run build` + dist/) | OpenClaw skill testing | Conditionally | dist/index.js exists | `npm run build` first |
| OpenClaw agent | End-to-end skill testing | UNKNOWN | — | Manual subprocess test |

**Missing dependencies with no fallback:**
- OpenClaw agent is not available in the dev environment. End-to-end skill verification must be done by manual subprocess test (e.g., `echo "" | wiki ask "test question"` to simulate non-TTY).

**Missing dependencies with fallback:**
- `wiki` binary: `dist/index.js` exists with shebang. Running `npm run build && npm install -g .` produces the global `wiki` binary for testing. No fallback needed — it works today.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | vitest.config.ts (or package.json vitest section) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (251 tests, 11 seconds) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTG-01 | SKILL.md exists at `skills/llm-wiki/SKILL.md` with valid frontmatter | smoke | `test -f skills/llm-wiki/SKILL.md` | ❌ Wave 0 |
| INTG-01 | `wiki` binary invoked as subprocess writes answer to stdout, nothing to stdin | integration | `tests/cli.test.ts::non-TTY subprocess` | ❌ Wave 0 |
| INTG-03 | `--refresh` flag recognized by `wiki ask` | unit | `tests/cli.test.ts::ask --refresh` | ❌ Wave 0 |
| INTG-03 | `--refresh` skips web when article is fresh | unit | `tests/cli.test.ts::ask --refresh fresh article` | ❌ Wave 0 |
| INTG-03 | `--refresh` triggers web when article is stale | unit | `tests/cli.test.ts::ask --refresh stale article` | ❌ Wave 0 |
| INTG-03 | `--refresh` with no matching article degrades to web (D-07) | unit | `tests/cli.test.ts::ask --refresh no article` | ❌ Wave 0 |
| INTG-03 | `freshness_days` defaults to 30 in DEFAULTS | unit | `tests/config.test.ts::freshness_days default` | ❌ Wave 0 |
| INTG-03 | `validateConfig` rejects `freshness_days <= 0` | unit | `tests/config.test.ts::freshness_days validation` | ❌ Wave 0 |
| D-09 | `confirmFiling()` returns false when `process.stdin.isTTY` is false | unit | `tests/cli.test.ts::confirmFiling non-TTY` | ❌ Wave 0 |
| D-13 | `dist/index.js` has `#!/usr/bin/env node` shebang | smoke | Already verified — exists in codebase | ✅ |

### Non-TTY Test Pattern

The existing test suite already mocks `readline` as a namespace (per Phase 5 pattern). The non-TTY test simply needs to set `process.stdin.isTTY = undefined` (or mock it as falsy) before calling `askCommand.parseAsync`:

```typescript
// In test setup:
Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
// After test:
Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
```

[ASSUMED] — vitest allows property mutation on `process.stdin` in test context; verified approach from similar Node.js testing patterns.

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (all 251 + new tests) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/cli.test.ts` — extend with `--refresh` and non-TTY describe blocks
- [ ] `tests/config.test.ts` — extend with `freshness_days` default and validation tests
- [ ] `skills/llm-wiki/SKILL.md` — the file itself (new, Wave 0 task)
- [ ] `skills/llm-wiki/` directory (must be created)

*(No new test files needed — extend existing test files following established patterns)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth added in Phase 6 |
| V3 Session Management | No | Stateless CLI |
| V4 Access Control | No | No new access paths |
| V5 Input Validation | Yes (partial) | `freshness_days` validated in `validateConfig()` — same pattern as `coverage_threshold` |
| V6 Cryptography | No | No crypto in Phase 6 |

### Known Threat Patterns for {subprocess invocation}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SKILL.md `bins` field injection | Tampering | `metadata` is a static JSON string in SKILL.md — no user input accepted |
| `freshness_days` type confusion | Tampering | `validateConfig()` enforces `typeof === 'number'` |
| Subprocess stdout capture by malicious caller | Information Disclosure | stdout already contains only machine-readable data (article titles, search results) — no secrets exposed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `prepare` does NOT run on `npm install -g <package>` from registry (only on `npm install -g .`) | Architecture Patterns / Pitfall 2 | If wrong, `files` field for `dist/` is still correct but the dual-script approach is over-engineering |
| A2 | SKILL.md exact wording and instruction step ordering | Code Examples | Low risk — discretionary per CONTEXT.md |
| A3 | `freshness_days` should be optional in the `Config` interface (not required) to avoid test fixture breakage | Architecture Patterns / Pitfall 1 | If the planner chooses required, ~20 test fixture call sites need updating |
| A4 | vitest allows `Object.defineProperty` mutation of `process.stdin.isTTY` in tests | Validation Architecture | If wrong, need alternative: wrap isTTY check in an injectable function |
| A5 | `sourced_at: null` should be treated as always-stale (not always-fresh) | Code Examples | If wrong, `--refresh` would never re-fetch compound articles |

---

## Open Questions

1. **Should `--refresh` also work on compound articles (`type: 'compound'`)?**
   - What we know: `sourced_at` for compound articles is set by `fileAnswerAsArticle` and is not null.
   - What's unclear: Whether refreshing a compound article (Q&A synthesis) by re-running web search makes semantic sense.
   - Recommendation: Treat compound articles as always-fresh for `--refresh` (skip them). Only re-fetch `type: 'web'` articles.

2. **Which articles does the staleness check apply to — all wiki articles or just the most relevant one?**
   - What we know: D-05 says "check if existing wiki articles for the topic". The topic → article mapping uses the same assessCoverage/BM25 path.
   - What's unclear: Whether to run BM25 search to find matching articles for the staleness check, or use a simpler slug-based lookup.
   - Recommendation: Use a single BM25-style lookup to find the most relevant existing article for the question, check that one. If stale, force web. If fresh or not found, fall through to normal flow.

3. **`npm install -g .` vs `npm link` for local testing — which should the plan use?**
   - What we know: Both work. `npm install -g .` is more faithful to the registry install experience. `npm link` is faster for iteration.
   - What's unclear: Which approach the user prefers for the development verification step.
   - Recommendation: Plan should use `npm run build && npm install -g .` as the canonical local verification step.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prepublish` (ran on both install and publish) | `prepare` + `prepublishOnly` (separate concerns) | npm 4.0.0 | Use `prepare` for local build, `prepublishOnly` for publish gate |
| Custom OpenClaw plugins (code-based) | SKILL.md instruction files (prose + YAML) | OpenClaw v2 | No code deployment needed — write instructions, not plugins |
| Manual readline in subprocess | `process.stdin.isTTY` guard | Node.js v6+ | Standard pattern for CLI subprocess compatibility |

**Deprecated/outdated:**
- `prepublish` lifecycle: runs unexpectedly during local installs; replaced by `prepare` + `prepublishOnly` since npm 4.

---

## Sources

### Primary (HIGH confidence)
- `src/commands/ask.ts` — Full pipeline; `confirmFiling()` implementation verified
- `src/config/config.ts` — Config interface, DEFAULTS, validateConfig() — config extension pattern confirmed
- `src/types/article.ts` — `sourced_at: string | null` type confirmed
- `dist/index.js` line 1 — `#!/usr/bin/env node` shebang verified
- `package.json` — current scripts, bin field, no `prepare`/`files` fields present
- `tests/cli.test.ts` — test fixture patterns; readline mock pattern confirmed
- https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md — SKILL.md frontmatter schema, `bins` field, single-line JSON metadata requirement
- https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md — Skill installation paths, subprocess invocation model
- https://nodejs.org/api/tty.html — `process.stdin.isTTY` behavior in TTY vs non-TTY contexts

### Secondary (MEDIUM confidence)
- npm scripts lifecycle docs (via archive mirror) — `prepare` runs on local install, not on `npm install -g <pkg>` from registry
- https://courses.cs.washington.edu/courses/cse481v/21sp/projects/team1/node-v14.17.0-linux-x64/lib/node_modules/npm/docs/public/using-npm/scripts/ — lifecycle table confirming `prepare` behavior
- WebSearch (multiple sources) — `prepublishOnly` is the correct publish-only lifecycle hook

### Tertiary (LOW confidence)
- A4 (vitest isTTY mutation in tests) — inferred from similar patterns; not directly verified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all reuses existing infrastructure
- Architecture: HIGH — code patterns verified against actual source files
- SKILL.md format: MEDIUM — official docs fetched but some rendering issues; cross-verified with two OpenClaw docs sources
- npm lifecycle: MEDIUM — npm docs CSS rendered poorly; confirmed via archive mirror and multiple secondary sources
- Pitfalls: HIGH — Pitfall 1 and 3 verified in codebase; Pitfall 2 confirmed by multiple sources

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (npm lifecycle is stable; OpenClaw skill format may evolve)

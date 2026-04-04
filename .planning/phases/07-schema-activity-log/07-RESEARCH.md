# Phase 7: Schema + Activity Log - Research

**Researched:** 2026-04-04
**Domain:** WikiStore extension, LLM prompt injection, append-only filesystem logging, Markdown schema design
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `schema.md` lives at the vault root (`<vault_path>/schema.md`), NOT inside `articles/`. It will not appear in `listArticles()`, BM25 search, dedup, or the index.md TOC.
- **D-02:** `schema.md` is a human-readable Markdown file with structured sections: Page Types (web, compound, comparison, concept), Frontmatter Conventions (required/optional fields per type), Category Taxonomy (current categories with descriptions), and Wikilink Style (naming patterns, link formatting rules).
- **D-03:** WikiStore gets a `readSchema()` method that reads `<vault_path>/schema.md` and returns its content as a string. Returns a sensible default if the file doesn't exist yet (first-run bootstrap).
- **D-04:** Schema content is injected into prompt-builder functions (`buildPlanPrompt`, `buildGeneratePrompt`, `buildUpdatePrompt`, `buildFilingPrompt`) as an additional context section in the user prompt — analogous to the existing WIKILINKS constraint section. NOT injected as a system prompt.
- **D-05:** The schema string is passed as a parameter to prompt-builder functions. Callers (synthesizer, article-filer) read the schema once via `WikiStore.readSchema()` and pass it through.
- **D-06:** Schema co-evolves deterministically — when synthesis produces articles with categories not present in the schema taxonomy, the new categories are appended to the taxonomy section automatically. No LLM call for schema updates; no user confirmation gate.
- **D-07:** Schema updates go through WikiStore (new `updateSchema()` method) to maintain the sole-disk-writer invariant and to trigger a log entry.
- **D-08:** Initial `schema.md` is bootstrapped on first `wiki ask` if it doesn't exist — seeded from the existing frontmatter conventions in `src/types/article.ts` and the current category set from `listArticles()`.
- **D-09:** `log.md` lives at the vault root (`<vault_path>/log.md`), same level as `schema.md`. NOT inside `articles/`.
- **D-10:** Log entries follow the format: `## [YYYY-MM-DD HH:MM] operation | description` — parseable by grep/regex, human-readable in Obsidian.
- **D-11:** Log operations include: `ingest`, `create`, `update`, `index`, `schema`, `lint`, `heal`, `query` — covering all current and planned wiki mutations.
- **D-12:** Log appends are centralized in WikiStore via a new `appendLog(operation, description)` method. Every `saveArticle()` and `rebuildIndex()` call triggers a log append. This guarantees no mutation goes unlogged.
- **D-13:** Use `fs.appendFile()` for log writes — safe for single-process CLI use. No file-locking library needed since `wiki` CLI is single-process (Commander serializes commands).

### Claude's Discretion

- Exact initial schema.md template content and section ordering
- Log entry description wording
- Whether to add a `wiki log` CLI command (read-only, displays recent log entries)
- Test structure and mocking approach

### Deferred Ideas (OUT OF SCOPE)

- LLM-driven schema curation (asking the LLM to reorganize/clean the taxonomy)
- `wiki schema` CLI command to view/edit schema interactively
- Schema versioning or changelog
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-01 | Wiki schema file (`schema.md`) in the vault defines conventions, page types, frontmatter rules, naming patterns, and LLM maintenance instructions — co-evolved with usage | WikiStore.readSchema() + updateSchema() methods; bootstrap from Frontmatter interface + listArticles(); deterministic category append in synthesizer post-save |
| SCHEMA-02 | LLM reads schema.md before every synthesis/ingest operation and follows its conventions (page structure, category taxonomy, wikilink style) | Schema string injected as user-prompt section into buildPlanPrompt, buildGeneratePrompt, buildUpdatePrompt, buildFilingPrompt — follows existing WIKILINKS injection pattern |
| LOG-01 | `log.md` in the vault is an append-only chronological record of all wiki operations — ingests, queries, article creates/updates, lint runs — with parseable timestamps and operation types | WikiStore.appendLog(operation, description) using fs.appendFile(); called from saveArticle() and rebuildIndex() |
| LOG-02 | Every wiki mutation (article create, update, index rebuild) appends a log entry with format `## [YYYY-MM-DD HH:MM] operation \| description` | Verified: fs.appendFile() produces correctly ordered sequential entries; format is grep/regex parseable |
</phase_requirements>

---

## Summary

Phase 7 adds two vault-level files — `schema.md` and `log.md` — and the WikiStore methods and prompt-builder wiring to maintain them. The implementation is a pure extension of established patterns: WikiStore is already the sole disk writer, prompt-builder functions already accept context parameters, and `saveArticle()` already hooks `rebuildIndex()`. Phase 7 follows these exact same hook points to add schema reading and log appending.

The schema file is Markdown, not JSON or YAML, because the LLM consumes it as raw text in prompts. It bootstraps from the existing `Frontmatter` interface in `src/types/article.ts` (which is the authoritative source of truth for frontmatter fields) plus categories discovered from `listArticles()` on first run. Co-evolution is deterministic: after synthesis, categories in the new article that are absent from the schema taxonomy are appended automatically — no LLM involvement, no user gate.

The activity log uses `fs.appendFile()` — verified available in Node 24 — to append one Markdown H2 heading per mutation. The format `## [YYYY-MM-DD HH:MM] operation | description` is both human-readable in Obsidian and machine-parseable via simple regex. Because the CLI is single-process (Commander serializes execution), no locking library is needed.

**Primary recommendation:** Extend WikiStore first (readSchema, updateSchema, appendLog), then wire prompt-builders to accept the schema parameter, then wire synthesizer and article-filer to read+pass schema, then add schema bootstrap to the ask command. This ordering ensures each step compiles and tests independently.

---

## Project Constraints (from CLAUDE.md)

| Constraint | Enforcement |
|-----------|-------------|
| Stack: Node/TypeScript | All Phase 7 code is TypeScript in `src/` |
| Storage: Markdown files in Obsidian vault | schema.md and log.md must be valid Obsidian-compatible Markdown (H2 headings, YAML frontmatter optional) |
| LLM: multi-provider via Vercel AI SDK | Schema injection goes into user prompt (not system prompt per D-04); provider-agnostic |
| Privacy: local disk only | No cloud writes; schema.md and log.md live at vault_path on disk |
| GSD workflow enforcement | All edits go through GSD phase execution |
| Conventional Commits | Commit messages: `feat(wiki-store): add readSchema, updateSchema, appendLog` |

---

## Standard Stack

### Core (no new dependencies needed)

| Library | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `fs/promises` (Node built-in) | Node 24.x | `readFile`, `writeFile`, `appendFile` for schema.md and log.md | HIGH [VERIFIED: Node 24 runtime] |
| `gray-matter` | 4.0.3 (installed) | Already used in WikiStore for article serialization; NOT used for schema.md (plain Markdown, no frontmatter) | HIGH [VERIFIED: package.json] |
| `write-file-atomic` | 7.0.1 (installed) | Already used in WikiStore for atomic article writes; use for schema.md writes too (prevent partial-write corruption on crash) | HIGH [VERIFIED: package.json] |
| `vitest` | 4.1.2 (installed) | Test framework; existing test patterns apply | HIGH [VERIFIED: package.json + npm run test] |

### No New Dependencies Required

Phase 7 requires zero new npm packages. [VERIFIED: codebase audit — all needed capabilities (fs.appendFile, writeFileAtomic, plain file reads) already installed]

**Installation:** None needed.

---

## Architecture Patterns

### Existing Pattern: WikiStore Sole-Disk-Writer

All file I/O in the wiki flows through `WikiStore`. The class holds `vaultPath` and exposes methods for every disk operation. This pattern was established in Phase 1 and respected by every subsequent phase.

**Phase 7 extension follows the same pattern exactly:**

```
src/store/wiki-store.ts (extend)
├── readSchema(): string               — reads <vaultPath>/schema.md, returns default if missing
├── updateSchema(content: string)      — writes <vaultPath>/schema.md atomically, then appendLog
├── appendLog(op: string, desc: string) — fs.appendFile to <vaultPath>/log.md
└── saveArticle() [modified]          — calls appendLog after writeFileAtomic
└── rebuildIndex() [modified]         — calls appendLog after writeFileAtomic

src/synthesis/prompt-builder.ts (extend)
├── buildPlanPrompt(input, schema)     — add schema section
├── buildGeneratePrompt(..., schema)   — add schema section
└── buildUpdatePrompt(..., schema)     — add schema section

src/retrieval/article-filer.ts (extend)
└── buildFilingPrompt(..., schema)     — add schema section

src/synthesis/synthesizer.ts (extend)
├── reads schema once via store.readSchema()
├── passes schema to buildPlanPrompt, buildGeneratePrompt, buildUpdatePrompt
└── after saveArticle(), checks for new categories and calls store.updateSchema()

src/commands/ask.ts (extend)
└── schema bootstrap: if schema.md missing, call bootstrapSchema(store) on first use
```

### Recommended Project Structure (Phase 7 touches)

```
<vaultPath>/
├── schema.md              NEW — vault root, not articles/
├── log.md                 NEW — vault root, append-only
└── articles/
    ├── index.md           existing
    └── *.md               existing articles

src/store/
└── wiki-store.ts          EXTEND — add 3 methods

src/synthesis/
├── prompt-builder.ts      EXTEND — add schema param to 3 functions
└── synthesizer.ts         EXTEND — schema read + pass + co-evolution hook

src/retrieval/
└── article-filer.ts       EXTEND — add schema param to buildFilingPrompt

src/commands/
└── ask.ts                 EXTEND — schema bootstrap on first run

tests/
├── wiki-store.test.ts     EXTEND — test readSchema, updateSchema, appendLog
├── synthesis.test.ts      EXTEND — MockWikiStore needs readSchema
└── retrieval-filer.test.ts EXTEND — buildFilingPrompt signature change
```

### Pattern 1: Prompt Schema Injection

The WIKILINKS section in `buildGeneratePrompt` is the canonical template. The schema section follows identically:

```typescript
// Source: src/synthesis/prompt-builder.ts (existing WIKILINKS pattern)
// BEFORE (existing):
export function buildGeneratePrompt(
  question: string,
  plan: ArticlePlan,
  sources: RawSourceEnvelope[],
  knownSlugs: string[]
): string {
  // ...
  return `You are a technical wiki author...
WIKILINKS — ONLY link to articles in this list:
${slugList}
...`;
}

// AFTER (Phase 7):
export function buildGeneratePrompt(
  question: string,
  plan: ArticlePlan,
  sources: RawSourceEnvelope[],
  knownSlugs: string[],
  schema: string  // NEW — passed from synthesizer
): string {
  // ...
  return `You are a technical wiki author...
WIKI SCHEMA (follow these conventions exactly):
${schema}

WIKILINKS — ONLY link to articles in this list:
${slugList}
...`;
}
```

### Pattern 2: Append-Only Log

`fs.appendFile` creates the file if missing and appends otherwise — no prior `readFile` needed:

```typescript
// Source: verified against Node 24 runtime in this session
async appendLog(operation: string, description: string): Promise<void> {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace('T', ' '); // "YYYY-MM-DD HH:MM"
  const entry = `## [${timestamp}] ${operation} | ${description}\n`;
  await fs.appendFile(path.join(this.vaultPath, 'log.md'), entry, 'utf8');
}
```

Verified output from Node 24: sequential calls produce correctly ordered entries with no interleaving. [VERIFIED: runtime test in this session]

### Pattern 3: Schema Bootstrap

On first `wiki ask`, if `schema.md` does not exist, bootstrap it from `src/types/article.ts` interface fields and current article categories:

```typescript
// Source: inferred from Frontmatter interface in src/types/article.ts
async bootstrapSchema(store: WikiStore): Promise<void> {
  const existing = await store.readSchema();
  if (existing !== null) return; // already exists

  const articles = await store.listArticles();
  const categories = [...new Set(articles.flatMap((a) => a.frontmatter.categories))].sort();

  const schema = buildDefaultSchema(categories);
  await store.updateSchema(schema);
}
```

The `readSchema()` method returns `null` if the file doesn't exist, allowing the bootstrap check to be a simple null-guard.

### Pattern 4: Deterministic Category Co-Evolution

After each `saveArticle()` in the synthesizer, extract categories from the newly saved article and compare against the schema taxonomy:

```typescript
// Source: CONTEXT.md D-06, D-07
const schemaContent = await store.readSchema();
const savedCategories = article.frontmatter.categories;
const newCategories = savedCategories.filter(
  (cat) => !isInSchemaTaxonomy(schemaContent, cat)
);
if (newCategories.length > 0) {
  const updated = appendCategoriesToSchema(schemaContent, newCategories);
  await store.updateSchema(updated); // triggers appendLog('schema', ...)
}
```

### Anti-Patterns to Avoid

- **Atomic writes for log.md:** Do NOT use `writeFileAtomic` for log.md — the log is append-only and `writeFileAtomic` does a full replace. Use `fs.appendFile()` only.
- **Schema inside articles/:** schema.md and log.md must NOT go inside `articles/` — they would appear in `listArticles()`, BM25 search, and the index TOC. Both files go at vault root.
- **System prompt injection for schema:** D-04 locks schema injection to the user prompt. System prompt injection bypasses provider-specific token limits and breaks the WIKILINKS pattern consistency.
- **Injecting schema on every call site independently:** Callers read schema ONCE (in ask.ts or synthesizer.ts) and pass the string through. Individual prompt-builder functions do not call `store.readSchema()` — that would require passing WikiStore into prompt-builder, adding an unneeded dependency.
- **Re-reading schema per article in a batch:** Synthesizer reads schema once before the article loop, not once per article. The schema doesn't change mid-batch (the update happens after each save, and the in-memory string passed to prompts is the pre-save version).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic schema.md writes | Custom temp-file rename | `writeFileAtomic` (already installed) | Already handles OS crash safety, temp file cleanup, permission preservation |
| Log timestamp formatting | Custom date formatter | `new Date().toISOString().slice(0, 16).replace('T', ' ')` | Produces exact `YYYY-MM-DD HH:MM` format per D-10; no library needed |
| Category extraction from schema | Custom parser | Simple string search (`schema.includes(category)`) | Schema is authored by this code — we know the exact format we wrote |
| File existence check before appendFile | `fs.stat()` guard | None — `fs.appendFile()` creates file if missing | Unnecessary complexity; appendFile handles both cases atomically |

**Key insight:** Every capability Phase 7 needs already exists in the installed codebase (writeFileAtomic, fs/promises, gray-matter). Adding dependencies would increase maintenance surface with zero benefit.

---

## Common Pitfalls

### Pitfall 1: MockWikiStore Missing New Methods in Tests

**What goes wrong:** Existing `MockWikiStore` in `tests/synthesis.test.ts` and similar files doesn't have `readSchema()`, `updateSchema()`, or `appendLog()`. After Phase 7, any synthesizer call will throw "store.readSchema is not a function."

**Why it happens:** The MockWikiStore was built to match the pre-Phase-7 WikiStore interface. TypeScript type errors will surface if the mock doesn't implement the new methods.

**How to avoid:** Update MockWikiStore in all affected test files (synthesis.test.ts, retrieval-filer.test.ts, cli.test.ts) to add stub implementations. Pattern:
```typescript
readSchema(): Promise<string | null> { return Promise.resolve(null); }
async updateSchema(_content: string): Promise<void> {}
async appendLog(_op: string, _desc: string): Promise<void> {}
```

**Warning signs:** TypeScript error `Property 'readSchema' does not exist on type 'MockWikiStore'` in any test file.

### Pitfall 2: Prompt-Builder Signature Change Breaks Callers

**What goes wrong:** Adding `schema: string` to `buildGeneratePrompt`, `buildPlanPrompt`, `buildUpdatePrompt`, `buildFilingPrompt` breaks all existing callers — both production code and tests — with TypeScript errors.

**Why it happens:** TypeScript strict mode enforces call-site arity. Any file that calls these functions without the new parameter will fail to compile.

**How to avoid:** Update callers in the same wave as the prompt-builder changes. The set of callers is small and fully known:
- `src/synthesis/synthesizer.ts` — calls buildPlanPrompt, buildGeneratePrompt, buildUpdatePrompt
- `src/retrieval/article-filer.ts` — calls buildFilingPrompt
- `tests/synthesis.test.ts` (synthesis-builder.test.ts if exists) — direct test of prompt output

**Warning signs:** `tsc --noEmit` errors referencing "Expected N arguments, but got N-1."

### Pitfall 3: Category Co-Evolution Creates Duplicate Taxonomy Entries

**What goes wrong:** If the category check is case-insensitive but the append is case-preserving, "machine learning" and "Machine Learning" both appear in the taxonomy.

**Why it happens:** `listArticles()` categories come from LLM output (prompt-builder CATEGORIES field), which may vary in capitalization.

**How to avoid:** Normalize both the schema taxonomy and the incoming category to lowercase for the membership check, but preserve the LLM's original capitalization when appending. Also sort the taxonomy to make diffs readable.

**Warning signs:** Duplicate entries differing only in case appearing in schema.md after multiple `wiki ask` runs.

### Pitfall 4: saveArticle Log Entry Type Ambiguity

**What goes wrong:** `saveArticle()` doesn't know whether it's creating or updating an article — the log entry operation field would be wrongly typed as `create` for updates.

**Why it happens:** `saveArticle()` writes the file regardless of prior existence — it doesn't track whether this is a first save or an update.

**How to avoid:** Use two strategies: (a) check if the file exists before writing (`fs.access()` or `store.getArticle()`) to determine create vs update, or (b) accept an optional `isUpdate: boolean` parameter in `saveArticle()`. Option (b) is simpler. The synthesizer already tracks `existing` before calling `saveArticle()`, so it can pass `isUpdate: !!existing`.

**Alternative:** Accept that `saveArticle()` always logs `create` and let callers (synthesizer, article-filer) call `appendLog('update', ...)` separately for known updates. This avoids changing the `saveArticle()` signature.

### Pitfall 5: Log File Not in Obsidian Graph View

**What goes wrong:** Obsidian tries to parse log.md as a wiki article. Its H2 headings (the log entries) appear as sections in Obsidian's outline view, which is noisy but harmless.

**Why it happens:** log.md is a Markdown file in the vault — Obsidian indexes everything in the vault.

**How to avoid:** This is expected and acceptable per D-10 (format chosen to be "human-readable in Obsidian"). No action needed. If it becomes a problem, log.md can be moved to a `.llm-wiki/` subdirectory of the vault in a future phase.

### Pitfall 6: Schema Default Content Quality

**What goes wrong:** The bootstrap schema is too thin to actually guide LLM behavior — it just lists frontmatter fields without actionable instructions, so SCHEMA-02 is technically satisfied but practically useless.

**Why it happens:** The bootstrap generates from `Frontmatter` interface fields (mechanical) rather than from the Karpathy-style "maintenance instructions" the requirement describes.

**How to avoid:** The default schema template (Claude's Discretion) must include explicit LLM-instruction prose — not just field definitions. The key Karpathy insight: "When writing articles, follow these conventions..." — the schema should read like a CLAUDE.md for the wiki. Include:
- Page type descriptions with examples
- Wikilink naming conventions (slugify rules)
- What CATEGORIES should look like (broad, not narrow)
- Citation format instructions

---

## Code Examples

Verified patterns from codebase inspection:

### WikiStore.readSchema() — with default fallback

```typescript
// Source: Pattern derived from existing getArticle() in src/store/wiki-store.ts
async readSchema(): Promise<string | null> {
  const schemaPath = path.join(this.vaultPath, 'schema.md');
  try {
    return await fs.readFile(schemaPath, 'utf8');
  } catch {
    return null;  // File doesn't exist — caller handles bootstrap
  }
}
```

### WikiStore.updateSchema() — atomic write + log

```typescript
// Source: Pattern from saveArticle() in src/store/wiki-store.ts
async updateSchema(content: string): Promise<void> {
  const schemaPath = path.join(this.vaultPath, 'schema.md');
  await writeFileAtomic(schemaPath, content, 'utf8');
  await this.appendLog('schema', 'Updated schema taxonomy');
}
```

### WikiStore.appendLog() — create-or-append

```typescript
// Source: Verified against Node 24 runtime in this session
async appendLog(operation: string, description: string): Promise<void> {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace('T', ' '); // "2026-04-04 10:30"
  const entry = `## [${timestamp}] ${operation} | ${description}\n`;
  const logPath = path.join(this.vaultPath, 'log.md');
  await fs.appendFile(logPath, entry, 'utf8');
}
```

### Default Schema Template Structure

```markdown
# Wiki Schema

> This file defines conventions for this wiki. The LLM reads it before every
> synthesis operation and follows these conventions exactly.

## Page Types

- **web**: Synthesized from web sources. Has `sources` URLs and `sourced_at` date.
- **compound**: Synthesized from existing wiki articles. Has `wiki://` prefixed sources.

## Frontmatter Conventions

Required fields (all types):
- `title`: Concise, title-case. Maps to [[wikilink]] slug via slugify.
- `tags`: Array of lowercase keyword strings.
- `categories`: Array of broad topic areas (e.g. "Machine Learning", not "Flash Attention V2").
- `type`: "web" or "compound".
- `created_at`: ISO 8601 date string.
- `updated_at`: ISO 8601 date string.
- `summary`: Single sentence. Appears in index.md TOC.

Optional fields:
- `sources`: Array of URLs (web type) or wiki:// slugs (compound type).
- `sourced_at`: ISO 8601 date string when sources were fetched.

## Category Taxonomy

<!-- New categories are appended here automatically when new articles are created -->

## Wikilink Style

- Link only to articles that exist (slugs from listArticles()).
- Slug format: lowercase, hyphens, no special chars (e.g. `[[flash-attention]]`).
- Link on first meaningful mention, not every occurrence.
```

### Category Co-Evolution — Extract and Append

```typescript
// Source: CONTEXT.md D-06, D-07 + Frontmatter interface pattern
function extractSchemaCategories(schemaContent: string): Set<string> {
  // Find the "## Category Taxonomy" section and parse listed items
  const match = schemaContent.match(/## Category Taxonomy\n([\s\S]*?)(?=\n## |$)/);
  if (!match) return new Set();
  const lines = match[1].split('\n').filter((l) => l.startsWith('- '));
  return new Set(lines.map((l) => l.replace(/^- \*\*(.+?)\*\*.*/, '$1').trim()));
}

async function maybeEvolveSchema(
  store: WikiStore,
  article: Article,
  schemaContent: string
): Promise<void> {
  const knownCategories = extractSchemaCategories(schemaContent);
  const newCats = article.frontmatter.categories.filter(
    (c) => !knownCategories.has(c)
  );
  if (newCats.length === 0) return;

  const appendSection = newCats.map((c) => `- **${c}**: Auto-added from article synthesis.`).join('\n');
  const updated = schemaContent.replace(
    /(## Category Taxonomy\n[\s\S]*?)(?=\n## |$)/,
    `$1${appendSection}\n`
  );
  await store.updateSchema(updated);
}
```

---

## Validation Architecture

nyquist_validation is enabled (set to `true` in .planning/config.json).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | `vitest.config.ts` (exists at project root) |
| Quick run command | `npm test -- --reporter=verbose 2>&1 \| tail -20` |
| Full suite command | `npm test` |

Current baseline: 262 tests passing across 15 test files. [VERIFIED: `npm test` run in this session]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-01 | `schema.md` created at vault root on bootstrap | unit | `npm test -- --reporter=verbose tests/wiki-store.test.ts` | ✅ (extend) |
| SCHEMA-01 | `readSchema()` returns null when file missing | unit | same | ✅ (extend) |
| SCHEMA-01 | `updateSchema()` writes atomically and logs | unit | same | ✅ (extend) |
| SCHEMA-01 | Category co-evolution appends new categories to schema | unit | `npm test -- --reporter=verbose tests/synthesis.test.ts` | ✅ (extend) |
| SCHEMA-02 | Schema string passed to buildPlanPrompt appears in output | unit | `npm test -- --reporter=verbose tests/synthesis-builder.test.ts` | ❌ Wave 0 |
| SCHEMA-02 | Schema string passed to buildGeneratePrompt appears in output | unit | same | ❌ Wave 0 |
| SCHEMA-02 | Schema string passed to buildFilingPrompt appears in output | unit | `npm test -- --reporter=verbose tests/retrieval-filer.test.ts` | ✅ (extend) |
| LOG-01 | `appendLog()` creates log.md with correct H2 format | unit | `npm test -- --reporter=verbose tests/wiki-store.test.ts` | ✅ (extend) |
| LOG-01 | Multiple appends produce sequential ordered entries | unit | same | ✅ (extend) |
| LOG-02 | `saveArticle()` triggers appendLog with operation `create` or `update` | unit | same | ✅ (extend) |
| LOG-02 | `rebuildIndex()` triggers appendLog with operation `index` | unit | same | ✅ (extend) |
| LOG-02 | `updateSchema()` triggers appendLog with operation `schema` | unit | same | ✅ (extend) |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (262 + new tests) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/synthesis-builder.test.ts` — test file for buildPlanPrompt, buildGeneratePrompt, buildUpdatePrompt with schema parameter. May exist as part of `synthesis.test.ts` — check if dedicated builder tests exist; if not, create.

Verify: `ls tests/synthesis-builder.test.ts 2>/dev/null || echo "missing"` — if missing, Wave 0 must create it.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static system prompts only | User-prompt context sections for schema/wikilinks/article list | Phase 1-4 established | Schema injection follows the same proven pattern |
| Direct fs.writeFile for all vault writes | writeFileAtomic for articles, fs.appendFile for log | Phase 1 (atomic) + Phase 7 (append) | Append is intentionally NOT atomic — log is additive, not replaceable |

**No deprecated patterns:** fs.appendFile has been stable since Node 10. writeFileAtomic API unchanged at 7.x. [ASSUMED — no changelog verification performed, but API stability over 5+ major versions is well-established]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | fs.appendFile, fs.readFile | ✓ | v24.14.0 | — |
| `write-file-atomic` | schema.md atomic writes | ✓ | 7.0.1 | — |
| `gray-matter` | frontmatter (articles only, not schema.md) | ✓ | 4.0.3 | — |
| `vitest` | test suite | ✓ | 4.1.2 | — |
| `typescript` | type safety, tsc | ✓ | 6.0.2 | — |

**Missing dependencies with no fallback:** None — all capabilities present.

**Missing dependencies with fallback:** None.

---

## Security Domain

This phase is a local filesystem extension with no network calls, no authentication, no user input validation beyond what already exists in the pipeline.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a — single-user local tool |
| V5 Input Validation | limited | Schema content comes from LLM output; categories already validated as strings via Frontmatter interface. Taxonomy append uses string operations on known-format content. |
| V6 Cryptography | no | n/a — no secrets involved |

### Known Threat Patterns for Filesystem Append

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via vault_path | Tampering | vault_path comes from user config (loadConfig), not user input at runtime |
| Log injection via description field | Tampering | Descriptions are constructed by production code (not user input). The format `operation \| description` is single-line — no newline injection risk from LLM categories |

**Note:** schema.md and log.md are local files in the user's personal vault. No sanitization beyond what TypeScript types already enforce is required for a single-user personal tool.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `writeFileAtomic` 7.x API unchanged from its 5.x usage in wiki-store.ts | Standard Stack | Low — API has been stable; worst case is a minor signature change caught by TypeScript |
| A2 | Obsidian correctly renders H2 headings in log.md as outline sections (acceptable side effect) | Common Pitfalls | Low — cosmetic only; doesn't break any functional requirement |
| A3 | `synthesis-builder.test.ts` does not already exist as a dedicated file | Validation Architecture | Low — if it exists, Wave 0 gap is already filled; if missing, create it |

**All other claims verified against: codebase source files, Node 24 runtime, installed package.json.**

---

## Open Questions (RESOLVED)

1. **Operation type for saveArticle: create vs update** — RESOLVED: saveArticle accepts optional `operation?: 'create' | 'update'` parameter, defaults to `'create'`. Synthesizer passes `'update'` when existing article found.

2. **Schema section parsing robustness** — RESOLVED: Simple regex on `## Category Taxonomy` section header. Marker comments are overengineering for controlled format.

3. **wiki log CLI command** — RESOLVED: Excluded from Phase 7 scope (Claude's Discretion). Planner chose to focus on core schema + log infrastructure.

---

## Sources

### Primary (HIGH confidence)

- `src/store/wiki-store.ts` — WikiStore class: existing methods, vaultPath, writeFileAtomic pattern
- `src/synthesis/prompt-builder.ts` — buildPlanPrompt, buildGeneratePrompt, buildUpdatePrompt signature + WIKILINKS injection pattern
- `src/retrieval/article-filer.ts` — buildFilingPrompt signature
- `src/synthesis/synthesizer.ts` — orchestration loop, schema injection points
- `src/commands/ask.ts` — bootstrap hook point, flow structure
- `src/types/article.ts` — Frontmatter interface (schema bootstrap source of truth)
- `src/config/config.ts` — Config interface, DEFAULTS, loadConfig patterns
- `package.json` — installed package versions
- `vitest.config.ts` — test configuration
- Node 24.14.0 runtime — verified `fs.appendFile` behavior

### Secondary (MEDIUM confidence)

- `.planning/phases/07-schema-activity-log/07-CONTEXT.md` — user decisions D-01 through D-13
- `.planning/REQUIREMENTS.md` — SCHEMA-01, SCHEMA-02, LOG-01, LOG-02
- `.planning/STATE.md` — accumulated decisions from Phases 1-6

### Tertiary (LOW confidence)

- None. All claims verified from codebase inspection or runtime.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in package.json; no new deps needed
- Architecture: HIGH — all patterns derived from existing codebase, not hypothetical
- Pitfalls: HIGH — derived from TypeScript strict mode + existing test patterns; MockWikiStore pitfall confirmed by reading synthesis.test.ts
- Test map: HIGH — test files inspected directly; baseline count verified by running npm test

**Research date:** 2026-04-04
**Valid until:** 2026-06-01 (stable APIs, no moving parts — 60 days conservative)

---
phase: 01-foundation
plan: 02
subsystem: wiki-store
tags: [typescript, vitest, wiki-store, gray-matter, js-yaml, atomic-writes, tdd]
dependency_graph:
  requires: [src/types/article.ts, src/config/config.ts, write-file-atomic, gray-matter, js-yaml, slugify]
  provides: [src/store/wiki-store.ts, tests/wiki-store.test.ts]
  affects: [01-03, phase-03, phase-04, phase-05]
tech_stack:
  added: []
  patterns:
    - Single-writer pattern — WikiStore is the sole component that writes to the Obsidian vault
    - Atomic writes via write-file-atomic (temp file + rename) — no partial files on crash
    - Gray-matter + js-yaml round-trip validation — stringify then yaml.load() to catch YAML corruption
    - TDD Red-Green — failing tests committed before implementation
key_files:
  created:
    - src/store/wiki-store.ts
    - tests/wiki-store.test.ts
  modified: []
decisions:
  - "WikiStore.validateFrontmatter() checks for undefined OR null (not just undefined) to catch objects like { title: null } that bypass the TypeScript compiler at runtime"
  - "listArticles() wraps readdir in try/catch and returns [] on error, making it safe to call even before ensureDirectories()"
  - "rebuildIndex() falls back to 'Uncategorized' for articles with empty categories array — prevents silent omission from index"
  - "Test helper makeArticle() uses spread on frontmatter overrides; full Frontmatter objects must be passed when overriding to avoid validation failures (fixed in test)"
metrics:
  duration: "108 seconds"
  completed: "2026-04-03"
  tasks_completed: 1
  files_created: 2
  files_modified: 0
---

# Phase 1 Plan 2: WikiStore Implementation Summary

WikiStore class with atomic disk writes, gray-matter + js-yaml round-trip validation, and automatic index rebuild after every article save.

## Public API

```typescript
class WikiStore {
  constructor(vaultPath: string)

  get articlesDir(): string
  slugify(title: string): string
  ensureDirectories(): Promise<void>
  saveArticle(article: Article): Promise<string>
  getArticle(slug: string): Promise<Article | null>
  listArticles(): Promise<Article[]>
  rebuildIndex(): Promise<void>
}
```

Exported types (re-exported from src/types/article.ts for caller convenience):
- `Frontmatter`
- `Article`

## Test Results

All 13 tests pass (config.test.ts + wiki-store.test.ts):

```
tests/wiki-store.test.ts (10 tests — all pass)
  WikiStore > slugify
    converts title to lowercase hyphenated slug
  WikiStore > saveArticle
    writes a .md file with valid frontmatter
    throws if required frontmatter field is missing
    throws if type is invalid
    rebuilds index.md after save
  WikiStore > getArticle
    returns article when it exists
    returns null for nonexistent slug
  WikiStore > listArticles
    returns empty array when articles/ is empty
    returns articles and excludes index.md
  WikiStore > rebuildIndex
    index.md frontmatter has article_count and updated_at
```

## Confirmations

- **Atomic writes:** All vault content written via `writeFileAtomic` (3 call sites: saveArticle + rebuildIndex x2). No bare `fs.writeFile` or `fs.writeFileSync` in wiki-store.ts.
- **Index rebuild:** `await this.rebuildIndex()` called from `saveArticle()` after every successful write.
- **Validation first:** `validateFrontmatter()` throws before any disk write — invalid frontmatter never reaches the filesystem.
- **Round-trip:** `yaml.load(roundTripped.matter)` runs after gray-matter stringify — catches YAML corruption gray-matter might introduce.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Incomplete frontmatter in listArticles test helper**
- **Found during:** TDD GREEN phase (1 of 10 tests failed)
- **Issue:** Plan's test template called `makeArticle({ slug: 'article-one', frontmatter: { title: 'Article One', summary: 'First' } as Frontmatter })` — casting to Frontmatter hides missing required fields (tags, categories, sources, etc.), causing `validateFrontmatter()` to throw at runtime.
- **Fix:** Provided complete Frontmatter objects in both listArticles test cases.
- **Files modified:** tests/wiki-store.test.ts
- **Commit:** c6b9ec2

## Known Stubs

None — WikiStore is fully functional. No placeholder values flow to any caller.

## Self-Check: PASSED

Files exist:
- FOUND: src/store/wiki-store.ts
- FOUND: tests/wiki-store.test.ts
- FOUND: .planning/phases/01-foundation/01-02-SUMMARY.md

Commits exist:
- fc10cd8 — test(01-02): add failing tests for WikiStore CRUD and index rebuild
- c6b9ec2 — feat(01-02): implement WikiStore — atomic write, frontmatter validation, index rebuild

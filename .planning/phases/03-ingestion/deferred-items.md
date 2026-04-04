# Phase 03 Deferred Items

Pre-existing TypeScript errors discovered during plan 03-02 compilation check.
These are out of scope for plan 03-02 (not caused by its changes).

## Pre-existing TypeScript Errors

### src/llm/adapter.ts:30
**Error:** `LanguageModelV1` not assignable to `LanguageModel` — `supportedUrls` property missing
**Cause:** AI SDK version mismatch (pre-existing from Phase 2 plan 01)
**Discovered during:** Plan 03-02 TypeScript check
**Impact:** TypeScript compilation fails but tests pass (runtime unaffected)
**Suggested fix:** Update `@ai-sdk/anthropic`, `@ai-sdk/openai`, `ollama-ai-provider` to compatible versions, or pin `ai` package to version that still exports `LanguageModelV1`

### src/store/wiki-store.ts:49
**Error:** `Frontmatter` cast to `Record<string, unknown>` — index signature missing
**Cause:** gray-matter's `stringify()` expects `Record<string, unknown>` but `Frontmatter` is a typed interface (pre-existing from Phase 1)
**Discovered during:** Plan 03-02 TypeScript check
**Impact:** TypeScript compilation fails but tests pass (runtime unaffected)
**Suggested fix:** Either add `[key: string]: unknown` index signature to `Frontmatter`, or use `article.frontmatter as unknown as Record<string, unknown>` cast

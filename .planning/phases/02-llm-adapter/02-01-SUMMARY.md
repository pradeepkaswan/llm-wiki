---
phase: 02-llm-adapter
plan: "01"
subsystem: llm-adapter
tags: [llm, adapter, vercel-ai-sdk, config, multi-provider]
dependency_graph:
  requires: [src/config/config.ts, package.json]
  provides: [src/llm/adapter.ts, extended Config interface with LLM fields]
  affects: [src/commands/ask.ts (Phase 4 wiring), all future phases using generateText]
tech_stack:
  added:
    - ai@6.0.146
    - "@ai-sdk/anthropic@3.0.66"
    - "@ai-sdk/openai@3.0.50"
    - ollama-ai-provider@1.2.0
  patterns:
    - Provider factory pattern (createProvider switches on config.llm_provider)
    - Pre-flight API key validation before SDK provider construction
    - Config defaults spread (DEFAULTS + parsed user config)
key_files:
  created:
    - src/llm/adapter.ts
    - tests/llm-adapter.test.ts
  modified:
    - src/config/config.ts
    - tests/config.test.ts
    - package.json
    - package-lock.json
decisions:
  - "Used VALID_PROVIDERS as const tuple for exhaustive type checking without runtime overhead"
  - "Re-throw validation errors in catch block to prevent silent swallow as first-run case"
  - "Exported createProvider() in addition to generateText() to enable unit testing without loadConfig()"
metrics:
  duration: "3m"
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_changed: 6
---

# Phase 02 Plan 01: LLM Adapter — Summary

Multi-provider LLM adapter using Vercel AI SDK with config-driven routing through Anthropic, OpenAI, and Ollama, plus pre-flight API key validation and config extension with LlmProvider union type.

## What Was Built

### Config Extension (`src/config/config.ts`)

- Added `VALID_PROVIDERS = ['claude', 'openai', 'ollama'] as const` and `LlmProvider` union type
- Extended `Config` interface with `llm_provider: LlmProvider`, `llm_model?: string`, `llm_base_url?: string`
- Set DEFAULTS: `llm_provider: 'claude'`, `llm_base_url: 'http://localhost:11434'`
- Added `validateConfig()` that throws a clear error listing valid providers for any invalid `llm_provider` value
- Called `validateConfig()` in both `loadConfig()` code paths (read-from-file and first-run defaults)
- Special handling to re-throw validation errors so they are not silently swallowed as first-run I/O errors

### LLM Adapter (`src/llm/adapter.ts`)

- `createProvider(config: Config): LanguageModel` — factory that switches on `config.llm_provider`:
  - `claude`: Checks `ANTHROPIC_API_KEY`, returns `anthropic(model ?? 'claude-sonnet-4-5')`
  - `openai`: Checks `OPENAI_API_KEY`, returns `openai(model ?? 'gpt-4o')`
  - `ollama`: Creates `createOllama({ baseURL: llm_base_url + '/api' })`, returns `ollamaProvider(model ?? 'llama3.3')`
- `generateText(prompt: string): Promise<string>` — public API: loads config, creates provider, calls SDK `generateText`, returns text string
- Both functions exported: `createProvider` for unit testing, `generateText` as public API
- No streaming, structured output, or tool use (D-08)
- No temperature or max_tokens (D-02)

### SDK Packages Installed

| Package | Version |
|---------|---------|
| `ai` | 6.0.146 |
| `@ai-sdk/anthropic` | 3.0.66 |
| `@ai-sdk/openai` | 3.0.50 |
| `ollama-ai-provider` | 1.2.0 |

## Test Coverage

| File | Tests Added | What They Cover |
|------|-------------|-----------------|
| `tests/config.test.ts` | +9 | LLM field defaults, VALID_PROVIDERS, validateConfig pass/fail |
| `tests/llm-adapter.test.ts` | +12 | Provider routing, default models, custom model override, API key pre-flight checks, Ollama baseURL /api suffix |

Full test suite: **46/46 passing** (was 25 before this plan).

## Decisions Made

1. **Re-throw validation errors in catch block**: The `loadConfig()` catch block handles first-run I/O errors. Without an explicit re-throw check, a validation error on a malformed config.json would be silently treated as "first run" and overwrite the config with defaults — hiding the user's misconfiguration. The re-throw pattern (`if (err instanceof Error && err.message.includes('Invalid llm_provider')) throw err`) preserves the fail-fast contract from D-03 and Pitfall 4.

2. **Export `createProvider()` for testability**: Making `createProvider()` exported (not private) allows unit tests to verify routing without going through `loadConfig()` filesystem access, keeping tests fast and deterministic.

3. **`VALID_PROVIDERS as const` tuple**: Using `as const` provides an exhaustive type constraint that TypeScript can check at compile time, eliminating runtime string comparisons in the switch statement's `default` case.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written with one minor structural fix:

**[Rule 1 - Bug] Fixed `await` in non-async `beforeEach` in test file**

- **Found during:** Task 2 (RED phase test run)
- **Issue:** Initial test draft used `const { generateText } = vi.mocked(await import('ai'))` inside a synchronous `beforeEach` callback — TypeScript/Oxc transformer rejected this with a parse error.
- **Fix:** Moved the mock reset to use `vi.clearAllMocks()` in `beforeEach` without `await`; mock return values are set inline per test using `vi.mocked(sdkGenerateText).mockResolvedValue(...)` within async `it()` bodies.
- **Files modified:** `tests/llm-adapter.test.ts`
- **Commit:** Included in `fe8c933`

## Known Stubs

None — all exported functions are fully implemented. `generateText()` makes real network calls when API keys are present.

## Self-Check: PASSED

Files created/modified:

- `src/llm/adapter.ts` — exists, verified
- `src/config/config.ts` — updated, verified
- `tests/llm-adapter.test.ts` — exists, verified
- `tests/config.test.ts` — updated, verified

Commits verified:

- `89a6363` — feat(02-01): install AI SDK packages and extend Config with LLM fields
- `fe8c933` — feat(02-01): create multi-provider LLM adapter with provider factory

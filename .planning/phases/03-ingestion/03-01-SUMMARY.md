---
phase: 03-ingestion
plan: 01
subsystem: ingestion
tags: [exa-js, readability, jsdom, turndown, pdf-parse, search, typescript]

# Dependency graph
requires:
  - phase: 02-llm-adapter
    provides: Config interface, createProvider pattern for factory functions
provides:
  - RawSourceEnvelope, ManifestEntry, Manifest type contracts (src/types/ingestion.ts)
  - SearchProvider interface with factory function (src/search/search-provider.ts)
  - ExaSearchProvider using exa-js neural search (src/search/exa-provider.ts)
  - Config extended with search_provider field and VALID_SEARCH_PROVIDERS (src/config/config.ts)
  - All Phase 3 packages installed (exa-js, @mozilla/readability, jsdom, turndown, pdf-parse)
affects:
  - 03-ingestion (plans 02-05 consume these type contracts and search provider)
  - 04-synthesis (uses RawSourceEnvelope shape for input to synthesis)
  - 05-orchestrator (uses createSearchProvider factory)

# Tech tracking
tech-stack:
  added:
    - exa-js 2.11.0 (neural web search)
    - "@mozilla/readability 0.6.0 (article body extraction)"
    - jsdom 29.0.1 (DOM implementation for Readability)
    - turndown 7.2.4 (HTML to Markdown conversion)
    - pdf-parse 2.4.5 (PDF text extraction, class-based 2.x API)
    - "@types/jsdom, @types/turndown, @types/pdf-parse (dev)"
  patterns:
    - "Search provider factory mirrors createProvider(config) pattern from src/llm/adapter.ts"
    - "VALID_SEARCH_PROVIDERS as const tuple gives compile-time exhaustiveness for SearchProvider union"
    - "Re-throw validation errors in loadConfig() catch — same pattern as llm_provider"
    - "EXA_API_KEY environment check at construction time — fails fast before network call"

key-files:
  created:
    - src/types/ingestion.ts
    - src/search/search-provider.ts
    - src/search/exa-provider.ts
    - tests/ingestion-types.test.ts
    - tests/search-provider.test.ts
  modified:
    - src/config/config.ts
    - tests/config.test.ts
    - package.json
    - package-lock.json

key-decisions:
  - "ExaSearchProvider uses SEARCH_RESULT_COUNT = 5 as code constant (not config) per D-10"
  - "Exa called with type: neural only — no contents option, URL discovery only per D-13"
  - "search_provider field added to Config interface as required (not optional) — must be in DEFAULTS"
  - "Mock for exa-js uses class syntax (not arrow function) in vi.mock — required for new Exa() constructor"

patterns-established:
  - "SearchProvider interface: search(query: string): Promise<SearchResult[]>"
  - "Factory function createSearchProvider(config): returns provider based on config.search_provider"
  - "Provider constructor throws on missing API key — fail fast before any network calls"

requirements-completed: [INGEST-01, INGEST-04]

# Metrics
duration: 7min
completed: 2026-04-04
---

# Phase 3 Plan 1: Ingestion Dependencies, Types, and Search Provider Summary

**Exa neural search provider with SearchProvider interface, RawSourceEnvelope/Manifest type contracts, and all 5 Phase 3 packages installed**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-04T14:26:00Z
- **Completed:** 2026-04-04T14:33:36Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Installed all 5 Phase 3 runtime packages (exa-js, @mozilla/readability, jsdom, turndown, pdf-parse 2.x) and 3 dev type packages
- Created ingestion type contracts: RawSourceEnvelope (9 fields), ManifestEntry, Manifest — the shape used by all Phase 3 plans
- Extended Config with `search_provider` field (default: 'exa'), VALID_SEARCH_PROVIDERS, and validateConfig check
- Built SearchProvider interface + ExaSearchProvider with neural search (numResults: 5) and EXA_API_KEY gate
- Full test suite passes: 65 tests across 7 files, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Install packages, create ingestion types, extend Config** - `cb8ea43` (feat)
2. **Task 2: SearchProvider interface and ExaSearchProvider implementation** - `a1bfbaa` (feat)

_Note: TDD tasks followed RED (write failing tests) → GREEN (write code) → verified pattern_

## Files Created/Modified
- `src/types/ingestion.ts` - RawSourceEnvelope, ManifestEntry, Manifest type exports
- `src/config/config.ts` - Added VALID_SEARCH_PROVIDERS, SearchProvider type, search_provider to Config and DEFAULTS, validation
- `src/search/search-provider.ts` - SearchResult interface, SearchProvider interface, createSearchProvider factory
- `src/search/exa-provider.ts` - ExaSearchProvider class wrapping exa-js with neural search
- `tests/ingestion-types.test.ts` - Type shape validation tests for ingestion types
- `tests/config.test.ts` - Added config search_provider describe block (5 new tests)
- `tests/search-provider.test.ts` - Full mocked Exa SDK test suite (8 tests)
- `package.json` - Added 5 runtime + 3 dev dependencies
- `package-lock.json` - Updated lockfile

## Decisions Made
- **SEARCH_RESULT_COUNT = 5 as code constant**: Per D-10, result count is a code constant, not user-configurable — hardcoded in exa-provider.ts
- **No contents option in Exa call**: Per D-13, Exa is URL discovery only — content extraction is handled by a separate fetcher in later plans
- **search_provider required field (not optional)**: Added to Config interface as required with 'exa' in DEFAULTS — mirrors llm_provider pattern
- **vi.mock class syntax**: Arrow function mocks fail as constructors with `new`; class syntax in vi.mock required for ExaSearchProvider tests

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **Mock constructor issue**: First attempt at `vi.fn().mockImplementation(() => ({...}))` for Exa mock failed with "not a constructor" error because arrow function factories cannot be called with `new`. Fixed by using class syntax in vi.mock factory. No plan change needed.
- **Pre-existing TypeScript errors**: `src/llm/adapter.ts` and `src/store/wiki-store.ts` have 2 pre-existing TS type errors unrelated to this plan. Logged to deferred-items — not introduced by this plan.

## User Setup Required

**EXA_API_KEY required before running searches.** To use web search features:
1. Get an API key from [exa.ai](https://exa.ai)
2. Set `export EXA_API_KEY=your-key-here` in your shell profile

## Next Phase Readiness
- All ingestion type contracts established — Plans 03-02 through 03-05 can import from `src/types/ingestion.ts`
- createSearchProvider factory ready — orchestrator in 03-02 or 03-05 can call it with loaded config
- All packages installed — subsequent plans can import @mozilla/readability, jsdom, turndown, pdf-parse without npm install
- Config search_provider field available — EXA_API_KEY gate will be exercised in first real search run

---
*Phase: 03-ingestion*
*Completed: 2026-04-04*

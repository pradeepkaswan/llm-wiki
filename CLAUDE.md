<!-- GSD:project-start source:PROJECT.md -->
## Project

**LLM Wiki**

A personal knowledge engine that turns questions into a growing wiki. You ask a question, the system searches the web, fetches sources, and an LLM synthesizes everything into organized Markdown articles in your Obsidian vault — with backlinks, concept categories, and an auto-maintained index. Every answer compounds the wiki. Inspired by Andrej Karpathy's "How LLMs Turn Raw Research Into a Living Knowledge Base."

**Core Value:** Every question you ask makes the wiki smarter — the knowledge compounds automatically.

### Constraints

- **Stack**: Node/TypeScript — aligns with CLI tooling and Claude Code skill ecosystem
- **Storage**: Markdown files in Obsidian vault — must be valid Obsidian-compatible markdown
- **LLM**: Must support multiple providers via configuration (Claude API, OpenAI API, Ollama)
- **Search**: Needs a web search mechanism (API-based — Brave, Exa, or similar)
- **Privacy**: Raw sources and wiki live locally on disk, not in the cloud
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### LLM Abstraction
| Package | Version | Rationale | Confidence |
|---------|---------|-----------|------------|
| `ai` (Vercel AI SDK) | 6.0.145 | Unified interface for Claude/OpenAI/Ollama — avoids conditional branching per provider. Maps exactly to configurable-LLM requirement. | HIGH |
| `@ai-sdk/anthropic` | Provider for Claude API | HIGH |
| `@ai-sdk/openai` | Provider for OpenAI API | HIGH |
| `ollama-ai-provider` | Provider for local Ollama models | HIGH |
### Web Search
| Package | Version | Rationale | Confidence |
|---------|---------|-----------|------------|
| Brave Search REST API + native `fetch` | N/A | No SDK needed. Generous free tier (2,000 req/month). Independent index (not Google wrapper). Avoids SerpAPI cost and Google ToS issues. | MEDIUM |
| `exa-js` (fallback) | 2.10.2 | Upgrade path if Brave quality insufficient. Minimal code change needed. | MEDIUM |
### Content Extraction
| Package | Version | Rationale | Confidence |
|---------|---------|-----------|------------|
| `@mozilla/readability` | 0.6.0 | Extracts article body from HTML. Cheerio can't identify article body. Firecrawl adds hosted-service cost and privacy risk. Playwright is 200MB overkill. | HIGH |
| `jsdom` | 29.0.1 | DOM implementation for Readability | HIGH |
| `turndown` | 7.2.2 | HTML → Markdown conversion | HIGH |
### Markdown Processing
| Package | Version | Rationale | Confidence |
|---------|---------|-----------|------------|
| `gray-matter` | 4.0.3 | YAML frontmatter parsing/serialization | HIGH |
| `remark` + `unified` | Latest | AST-based markdown manipulation — prevents string corruption as articles compound | HIGH |
### Local Search/Indexing
| Package | Version | Rationale | Confidence |
|---------|---------|-----------|------------|
| `minisearch` | 7.2.0 | Lightweight, stable API, good TypeScript support. FlexSearch has unstable API. Lunr unmaintained since 2020. Vector DBs are over-engineered when LLM handles semantic matching. | HIGH |
### CLI Framework
| Package | Version | Rationale | Confidence |
|---------|---------|-----------|------------|
| `commander` | 14.x | Clean, well-documented. oclif is enterprise overkill. yargs has confusing docs. | HIGH |
| `@clack/prompts` | Latest | Beautiful CLI prompts and spinners | HIGH |
### Dev Tooling
| Package | Version | Rationale | Confidence |
|---------|---------|-----------|------------|
| `typescript` | 6.x | Type safety | HIGH |
| `tsx` | Latest | Fast TypeScript execution for dev | HIGH |
| `vitest` | Latest | Fast test runner | HIGH |
## Explicitly Rejected
| Package | Reason |
|---------|--------|
| LangChain.js | Severe API instability, poor TypeScript types, massive bundle weight |
| Cheerio | Can't identify article body — only parses HTML structure |
| Firecrawl | Hosted service adds cost and privacy risk |
| Playwright | 200MB dependency, overkill for content extraction |
| FlexSearch | Unstable API across versions |
| Lunr | Unmaintained since 2020 |
| SerpAPI | Expensive, wraps Google (ToS issues) |
| oclif | Enterprise-scale overkill for personal tool |
## Roadmap Implications
- Phase 1 should install and wire the full dependency graph before building features — many packages (remark, unified, AI SDK providers) have non-obvious peer dependency requirements
- Multi-provider LLM config via Vercel AI SDK should be established in Phase 1 so all subsequent phases build against the abstraction, not a specific provider
- Brave Search integration should be validated early — if API quality is insufficient, Exa is the upgrade path with minimal code change
## Open Questions
- Brave Search API free tier limits need runtime validation (2,000/month figure needs verification)
- Whether Readability handles JavaScript-heavy pages adequately — may need Firecrawl upgrade path sooner than expected
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

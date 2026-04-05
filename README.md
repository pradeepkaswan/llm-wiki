# LLM Wiki

A personal knowledge engine that turns questions into a growing wiki. Ask a question, the system searches the web, fetches sources, and an LLM synthesizes everything into organized Markdown articles in your Obsidian vault — with backlinks, concept categories, and an auto-maintained index.

Every answer compounds the wiki. Inspired by [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## Architecture

Three layers, per Karpathy's design:

```
Raw Sources (immutable)  →  Wiki Articles (LLM-owned)  →  Schema (conventions)
~/.llm-wiki/raw/            ~/Vault/articles/              ~/Vault/schema.md
```

**HydraDB** powers the intelligence layer — semantic recall replaces naive keyword search, user memories personalize the experience, and context graphs track article relationships automatically.

## Quick Start

```bash
# Install
npm install -g .

# Configure
cat > ~/.llm-wiki/config.json << 'EOF'
{
  "vault_path": "/path/to/your/obsidian/vault",
  "llm_provider": "claude",
  "search_provider": "exa"
}
EOF

# Set API keys
export ANTHROPIC_API_KEY=sk-ant-...
export EXA_API_KEY=...
export HYDRADB_API_KEY=...          # optional — enables semantic search
export HYDRADB_TENANT_ID=...        # your HydraDB tenant
```

## Commands

| Command | What it does |
|---------|-------------|
| `wiki ask "question"` | Search web → synthesize article → ripple cross-references → enforce backlinks |
| `wiki ask --refresh` | Re-fetch sources for stale articles (older than `freshness_days`) |
| `wiki ask --web` | Force web search, skip wiki check |
| `wiki search "query"` | BM25 local search across all articles |
| `wiki list` | List all articles in the wiki |
| `wiki ingest <url>` | Ingest a specific URL as a raw source |
| `wiki file "text"` | File freeform content — LLM decides where it belongs |
| `wiki lint` | Health check: orphans, stale articles, missing concepts, contradictions |
| `wiki heal` | Auto-fix lint findings (create missing pages, add cross-refs, flag contradictions) |
| `wiki heal --dry-run` | Preview fixes without applying |
| `wiki sync` | Sync all articles to HydraDB for semantic search |

## How It Works

### Ask Flow

```
wiki ask "How does flash attention work?"
    │
    ├─ Check wiki (BM25 + HydraDB semantic recall)
    │   ├─ Covered → Answer from wiki, offer to file back
    │   └─ Not covered ↓
    │
    ├─ Search web (Exa neural search, 5 results)
    ├─ Fetch & extract content (Readability + Turndown)
    ├─ Store raw sources (~/.llm-wiki/raw/)
    ├─ Synthesize article (LLM with schema conventions)
    ├─ Ripple cross-references to 5-15 related articles
    ├─ Enforce bidirectional backlinks (See Also sections)
    ├─ Sync to HydraDB
    └─ Log operation to log.md
```

### Multi-Page Ingest

A single question doesn't just create one article — it ripples knowledge across the entire wiki. Asking about "flash attention" also updates the transformer architecture page, attention mechanisms page, and any other related articles with cross-references.

### Feedback Loop

Q&A answers, comparisons, and analyses can be filed back into the wiki as durable artifacts:

```bash
# Answer from wiki gets filed back as a compound article
wiki ask "Compare flash attention vs standard attention"
> File this answer back into the wiki? [y/N] y

# File any freeform content
wiki file "Flash attention reduces memory from O(n²) to O(n) by tiling"
```

### Lint + Heal

```bash
# Find issues
wiki lint
# → Orphan pages, stale articles, missing concepts, contradictions

# Auto-fix
wiki heal --dry-run   # preview
wiki heal             # apply fixes
```

## HydraDB Integration

When `HYDRADB_API_KEY` is set, LLM Wiki uses [HydraDB](https://hydradb.com) for:

- **Semantic recall** — finds articles by meaning, not just keywords
- **User memory** — tracks questions and personalizes future responses
- **Context graphs** — automatic relationship tracking between articles

Without HydraDB, everything works via local BM25 search. HydraDB is a genuine enhancement, not a dependency.

## Configuration

`~/.llm-wiki/config.json`:

```json
{
  "vault_path": "/path/to/obsidian/vault",
  "llm_provider": "claude",
  "search_provider": "exa",
  "coverage_threshold": 5.0,
  "freshness_days": 30
}
```

| Field | Description | Default |
|-------|------------|---------|
| `vault_path` | Path to your Obsidian vault | `~/Desktop/Pradeep's Vault` |
| `llm_provider` | `claude`, `openai`, or `ollama` | `claude` |
| `search_provider` | Web search provider | `exa` |
| `coverage_threshold` | BM25 score threshold for wiki-first routing | `5.0` |
| `freshness_days` | Days before an article is considered stale | `30` |

## Stack

- **Runtime**: Node.js / TypeScript
- **LLM**: Vercel AI SDK (Claude, OpenAI, Ollama)
- **Search**: Exa neural search
- **Local index**: MiniSearch (BM25)
- **Semantic search**: HydraDB
- **Content extraction**: Mozilla Readability + Turndown
- **Storage**: Obsidian-compatible Markdown
- **CLI**: Commander
- **Tests**: Vitest (371 tests)

## License

MIT

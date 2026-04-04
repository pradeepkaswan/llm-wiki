---
name: llm-wiki
description: Query and grow a local Obsidian wiki from natural language questions
version: 1.0.0
metadata: {"openclaw":{"requires":{"bins":["wiki"]}}}
---

## Overview

llm-wiki is a personal knowledge engine that turns questions into wiki articles. Every question either retrieves an existing wiki answer or searches the web and synthesizes new articles into your Obsidian vault.

**stdout** contains machine-readable output (answers, article titles, JSON).

**stderr** contains progress and status messages. Ignore stderr when parsing output.

## Commands

### Ask a question

Command: `wiki ask "<question>"`

Behavior:
- Checks the local wiki first. If relevant articles exist, outputs an answer to stdout.
- If the wiki lacks coverage, searches the web, synthesizes articles, and outputs article title(s) to stdout (one per line).

Flags:
- `--web` — Skip wiki check; always search the web and synthesize new articles.
- `--refresh` — Re-fetch web sources for existing articles older than the configured freshness_days (default: 30 days). If the article is fresh, answers from wiki. If no matching article exists, falls through to normal web search.

stdout format:
- Wiki path: plain text answer
- Web path: article title(s), one per line

### Search the wiki

Command: `wiki search "<query>"`

stdout: JSON array of matching articles. Each entry has `slug`, `title`, `summary`, and `score` fields.

Example: `wiki search "attention mechanism"`

### List all articles

Command: `wiki list`

stdout: JSON array of all articles with `slug`, `title`, `categories`, and `updated_at`.

### Ingest a URL

Command: `wiki ingest <url>`

Description: Fetches the URL, extracts content, and synthesizes it into the wiki. Supports web pages, PDFs, and arxiv papers.

stdout: article title on success.

stderr: progress messages.

## Parsing Output

- Always read stdout for machine-readable data.
- Never parse stderr — it is for human display only.
- Exit code 0 = success. Non-zero = error (check stderr for message).

## Installation

1. Install globally: `npm install -g llm-wiki`
2. Verify: `wiki --help`
3. Place this skill in `~/.openclaw/skills/llm-wiki/SKILL.md` or keep it in your workspace `skills/` directory.

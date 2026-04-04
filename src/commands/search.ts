import { Command } from 'commander';
import * as clack from '@clack/prompts';
import { WikiStore } from '../store/wiki-store.js';
import { buildIndex, search } from '../search/search-index.js';
import { loadConfig } from '../config/config.js';

export const searchCommand = new Command('search')
  .description('Search wiki articles using BM25 full-text search')
  .argument('<query>', 'search query')
  .option('--limit <n>', 'maximum results to return', '10')
  .action(async (query: string, options: { limit: string }) => {
    // All progress to stderr (per D-02, INTG-02)
    clack.intro('wiki search');

    const config = await loadConfig();
    const store = new WikiStore(config.vault_path);
    const articles = await store.listArticles();

    if (articles.length === 0) {
      process.stderr.write('No articles in wiki yet. Use `wiki ask` to add articles.\n');
      process.stdout.write('[]\n');
      process.exit(0);
    }

    const index = buildIndex(articles);
    const results = search(index, query).slice(0, parseInt(options.limit, 10));

    if (results.length === 0) {
      process.stderr.write(`No results found for: ${query}\n`);
      process.stdout.write('[]\n');
    } else {
      // Machine-readable results to stdout (per INTG-02)
      process.stdout.write(JSON.stringify(results, null, 2) + '\n');
      clack.outro(`Found ${results.length} result(s)`);
    }
  });

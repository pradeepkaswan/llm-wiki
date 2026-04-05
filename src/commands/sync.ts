import { Command } from 'commander';
import { loadConfig } from '../config/config.js';
import { WikiStore } from '../store/wiki-store.js';
import { syncAllArticles, ensureTenant } from '../hydra/client.js';

export const syncCommand = new Command('sync')
  .description('Sync all wiki articles to HydraDB for semantic search')
  .action(async () => {
    try {
      if (!process.env['HYDRADB_API_KEY']) {
        process.stderr.write('Error: Set HYDRADB_API_KEY environment variable to use HydraDB sync.\n');
        process.exit(1);
      }

      const config = await loadConfig();
      const store = new WikiStore(config.vault_path);

      process.stderr.write('Ensuring HydraDB tenant...\n');
      await ensureTenant();

      const articles = await store.listArticles();
      process.stderr.write(`Syncing ${articles.length} article(s) to HydraDB...\n`);

      const synced = await syncAllArticles(articles);
      process.stderr.write(`Done: ${synced} article(s) synced to HydraDB.\n`);

      // Machine-readable output
      process.stdout.write(JSON.stringify({ synced, total: articles.length }) + '\n');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  });

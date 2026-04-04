import { Command } from 'commander';
import { WikiStore } from '../store/wiki-store.js';
import { loadConfig } from '../config/config.js';

export const listCommand = new Command('list')
  .description('List all wiki articles')
  .option('--json', 'output article metadata as JSON to stdout')
  .action(async (options: { json?: boolean }) => {
    // D-02: human progress to stderr; machine-readable data to stdout (INTG-02)
    // Note: clack.intro/outro write to stdout by default — using process.stderr.write directly
    process.stderr.write('wiki list\n');

    const config = await loadConfig();
    const store = new WikiStore(config.vault_path);
    const articles = await store.listArticles();

    if (options.json) {
      // Machine-readable: stdout (INTG-02)
      const metadata = articles.map((a) => ({
        slug: a.slug,
        title: a.frontmatter.title,
        summary: a.frontmatter.summary,
        categories: a.frontmatter.categories,
        updated_at: a.frontmatter.updated_at,
      }));
      process.stdout.write(JSON.stringify(metadata, null, 2) + '\n');
    } else {
      // Human-readable: stderr
      if (articles.length === 0) {
        process.stderr.write('No articles yet. Use `wiki ask "..."` to create articles.\n');
      } else {
        for (const a of articles) {
          process.stderr.write(`  ${a.slug} — ${a.frontmatter.summary}\n`);
        }
      }
    }

    process.stderr.write(`${articles.length} article(s) in wiki\n`);
  });

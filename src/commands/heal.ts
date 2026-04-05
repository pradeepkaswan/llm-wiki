/**
 * wiki heal — Auto-fix wiki health issues.
 *
 * Per D-11: Heal runs lint internally (does not require user to run lint first).
 * Per D-12: Routes findings to fix functions via healFindings().
 * Per D-13: Writes through WikiStore.saveArticle() which auto-logs.
 * Per D-17: --dry-run shows what would be fixed without mutations.
 * Per D-18: Reads schema and passes to LLM calls.
 */

import { Command } from 'commander';
import { loadConfig } from '../config/config.js';
import { WikiStore } from '../store/wiki-store.js';
import { runLint } from '../lint/linter.js';
import { healFindings } from '../lint/healer.js';
import { buildDefaultSchema } from '../schema/template.js';

export const healCommand = new Command('heal')
  .description(
    'Auto-fix wiki health issues — creates missing pages, adds cross-references, flags contradictions'
  )
  .option('--dry-run', 'show what would be fixed without making changes')
  .action(async (options: { dryRun?: boolean }) => {
    try {
      const config = await loadConfig();
      const store = new WikiStore(config.vault_path);

      // Schema bootstrap — same pattern as ask/file commands (D-18)
      let schema = await store.readSchema();
      if (schema === null) {
        process.stderr.write('Bootstrapping wiki schema...\n');
        const articles = await store.listArticles();
        const categories = [
          ...new Set(articles.flatMap((a) => a.frontmatter.categories)),
        ].sort();
        schema = buildDefaultSchema(categories);
        await store.updateSchema(schema);
      }

      const articles = await store.listArticles();

      if (articles.length === 0) {
        process.stderr.write('No articles found in the wiki.\n');
        return;
      }

      // D-11: Heal runs lint internally
      process.stderr.write(`Scanning ${articles.length} article(s) for issues...\n`);
      const report = await runLint(articles, config);

      if (report.findings.length === 0) {
        process.stderr.write('No issues found — wiki is healthy!\n');
        // Log heal invocation even if no fixes needed
        await store.appendLog('heal', 'Heal run: no issues found');
        return;
      }

      process.stderr.write(
        `Found ${report.findings.length} issue(s). ${options.dryRun ? '[DRY-RUN] ' : ''}Healing...\n`
      );

      // Log heal start
      await store.appendLog(
        'heal',
        `Heal run started: ${report.findings.length} finding(s)${options.dryRun ? ' (dry-run)' : ''}`
      );

      // D-12, D-14: Route findings to fix functions
      const result = await healFindings(
        report.findings,
        store,
        config,
        schema,
        options.dryRun ?? false
      );

      // Summary to stderr
      process.stderr.write('\n--- Heal Summary ---\n');
      process.stderr.write(`Fixed: ${result.fixed}\n`);
      process.stderr.write(`Skipped: ${result.skipped}\n`);
      process.stderr.write(`Errors: ${result.errors}\n`);
      if (result.humanReview.length > 0) {
        process.stderr.write(`Needs human review: ${result.humanReview.length}\n`);
        for (const item of result.humanReview) {
          process.stderr.write(`  - ${item}\n`);
        }
      }

      // JSON result to stdout
      process.stdout.write(JSON.stringify(result) + '\n');

      // Log heal completion
      await store.appendLog(
        'heal',
        `Heal complete: ${result.fixed} fixed, ${result.skipped} skipped, ${result.errors} errors`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  });

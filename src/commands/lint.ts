/**
 * wiki lint — Scan the wiki for structural and semantic health issues.
 *
 * Per D-09: JSON report to stdout, human-readable summary to stderr.
 * Per D-15, D-16: Optional --category flag to filter checks.
 * Per D-18: Logs lint run to log.md via store.appendLog().
 * Per T-09-01: Validate --category input against VALID_CATEGORIES.
 */

import { Command } from 'commander';
import { loadConfig } from '../config/config.js';
import { WikiStore } from '../store/wiki-store.js';
import { runLint } from '../lint/linter.js';
import type { LintCategory } from '../lint/linter.js';

/** All valid lint check categories — T-09-01 input validation */
const VALID_CATEGORIES: LintCategory[] = [
  'orphan',
  'stale',
  'missing-concept',
  'missing-cross-ref',
  'contradiction',
];

export const lintCommand = new Command('lint')
  .description(
    'Scan the wiki for health issues — orphans, stale articles, missing concepts, contradictions'
  )
  .option('--category <type>', 'filter to a specific check type')
  .action(async (options: { category?: string }) => {
    try {
      const config = await loadConfig();
      const store = new WikiStore(config.vault_path);

      // T-09-01: Validate --category flag against known enum values (ASVS L1 input validation)
      let categories: LintCategory[] | undefined;
      if (options.category) {
        if (!VALID_CATEGORIES.includes(options.category as LintCategory)) {
          process.stderr.write(
            `Error: Invalid category "${options.category}". Valid: ${VALID_CATEGORIES.join(', ')}\n`
          );
          process.exit(1);
        }
        categories = [options.category as LintCategory];
      }

      // Load all articles
      const articles = await store.listArticles();

      if (articles.length === 0) {
        process.stderr.write('No articles found in the wiki.\n');
        process.stdout.write(
          JSON.stringify({ findings: [], counts: {}, healthScore: 100, articleCount: 0 }) + '\n'
        );
        return;
      }

      process.stderr.write(`Scanning ${articles.length} article(s)...\n`);

      // Run lint — config carries freshness_days
      const report = await runLint(articles, config, { categories });

      // D-09: JSON report to stdout (machine-readable)
      process.stdout.write(JSON.stringify(report) + '\n');

      // D-09: Human-readable summary to stderr
      process.stderr.write('\n--- Wiki Health Report ---\n');
      process.stderr.write(`Health Score: ${report.healthScore}%\n`);
      process.stderr.write(`Total findings: ${report.findings.length}\n`);

      for (const [cat, count] of Object.entries(report.counts)) {
        if (count > 0) {
          process.stderr.write(`  ${cat}: ${count}\n`);
        }
      }

      if (report.findings.length === 0) {
        process.stderr.write('No issues found — wiki is healthy!\n');
      }

      // D-13: Log lint run to log.md
      await store.appendLog(
        'lint',
        `Lint scan: ${report.findings.length} finding(s), health ${report.healthScore}%`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  });

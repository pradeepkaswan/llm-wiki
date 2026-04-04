import * as readline from 'readline';
import { Command } from 'commander';
import { loadConfig } from '../config/config.js';
import { createSearchProvider } from '../search/search-provider.js';
import { fetchUrl, isPdf, normalizeArxivUrl } from '../ingestion/fetcher.js';
import { extractFromHtml } from '../ingestion/extractor.js';
import { extractFromPdf } from '../ingestion/pdf-extractor.js';
import { checkQuality } from '../ingestion/quality.js';
import { storeSourceEnvelopes, questionToSlug } from '../ingestion/raw-store.js';
import { synthesize } from '../synthesis/synthesizer.js';
import { WikiStore } from '../store/wiki-store.js';
import { assessCoverage } from '../retrieval/orchestrator.js';
import { generateWikiAnswer } from '../retrieval/wiki-answer.js';
import { fileAnswerAsArticle } from '../retrieval/article-filer.js';
import type { RawSourceEnvelope } from '../types/ingestion.js';

async function confirmFiling(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // CRITICAL: stderr not stdout (D-06, INTG-02)
    });
    rl.question('File this answer back into the wiki? [y/N] ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

export const askCommand = new Command('ask')
  .description('Ask a question — checks wiki first, then searches the web if needed')
  .argument('<question>', 'the question to ask')
  .option('--web', 'skip wiki check and search the web directly')
  .action(async (question: string, options: { web?: boolean }) => {
    try {
      // Load config
      const config = await loadConfig();
      const store = new WikiStore(config.vault_path);

      // Step 1: Wiki check (skip if --web) — per D-15
      if (!options.web) {
        process.stderr.write(`Checking wiki for: "${question}"...\n`);
        const coverage = await assessCoverage(question, store, config.coverage_threshold);

        if (coverage.covered) {
          process.stderr.write(
            `[WIKI] Found ${coverage.articles.length} relevant article(s) — answering from wiki\n`
          );

          // Generate wiki answer (per D-05)
          const answer = await generateWikiAnswer(question, coverage.articles);
          process.stdout.write(`${answer}\n`); // D-06: answer to stdout

          // Step 2: Prompt for filing (per D-11, D-12)
          const shouldFile = await confirmFiling();
          if (shouldFile) {
            process.stderr.write('Filing answer as compound article...\n');
            const filed = await fileAnswerAsArticle(question, answer, coverage.articles, store);
            process.stdout.write(`${filed.frontmatter.title}\n`); // article title to stdout
            process.stderr.write(`[SAVED] articles/${filed.slug}.md (type: compound)\n`);
          }
          return; // Exit — do NOT fall through to web search
        }

        process.stderr.write(
          `[WEB] Wiki coverage insufficient (threshold: ${config.coverage_threshold}) — searching web\n`
        );
      }

      // Step 3: Existing web search -> fetch -> synthesize flow
      const provider = createSearchProvider(config);

      // Search for sources
      process.stderr.write(`Searching for: "${question}"...\n`);
      const results = await provider.search(question);

      if (results.length === 0) {
        process.stderr.write(`No search results found for "${question}".\n`);
        process.exit(1);
      }

      process.stderr.write(`Found ${results.length} results. Fetching content...\n`);

      // Generate slug for storage
      const slug = questionToSlug(question);

      // Process each search result sequentially (graceful individual failure)
      const envelopes: RawSourceEnvelope[] = [];

      for (const result of results) {
        const normalizedUrl = normalizeArxivUrl(result.url);

        let fetchResult;
        try {
          fetchResult = await fetchUrl(normalizedUrl);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`  [SKIP] ${normalizedUrl}: ${message}\n`);
          envelopes.push({
            url: normalizedUrl,
            title: result.title ?? '',
            markdown: '',
            fetched_at: new Date().toISOString(),
            query: question,
            search_rank: result.rank,
            content_length: 0,
            excluded: true,
            exclude_reason: `fetch_failed: ${message}`,
          });
          continue;
        }

        let markdown = '';
        let title = result.title ?? '';
        let extractionFailed = false;
        let extractionReason: string | null = null;

        if (isPdf(normalizedUrl, fetchResult.contentType)) {
          // PDF extraction
          markdown = await extractFromPdf(fetchResult.body);
          // Use URL basename as title for PDFs
          const urlPath = new URL(normalizedUrl).pathname;
          title = urlPath.split('/').pop() ?? normalizedUrl;
        } else {
          // HTML extraction
          const html = new TextDecoder().decode(fetchResult.body);
          const extractResult = extractFromHtml(html, normalizedUrl);
          if (extractResult === null) {
            extractionFailed = true;
            extractionReason = 'extraction_failed';
            markdown = '';
          } else {
            markdown = extractResult.markdown;
            title = extractResult.title || title;
          }
        }

        const qualityResult = checkQuality(markdown);

        const excluded = qualityResult.excluded || extractionFailed;
        const excludeReason = qualityResult.reason ?? extractionReason ?? null;

        const envelope: RawSourceEnvelope = {
          url: normalizedUrl,
          title,
          markdown,
          fetched_at: new Date().toISOString(),
          query: question,
          search_rank: result.rank,
          content_length: markdown.length,
          excluded,
          exclude_reason: excludeReason,
        };

        envelopes.push(envelope);

        if (excluded) {
          process.stderr.write(`  [EXCLUDED] ${normalizedUrl}: ${excludeReason}\n`);
        } else {
          process.stderr.write(`  [OK] ${normalizedUrl} (${markdown.length} chars)\n`);
        }
      }

      // Store all envelopes
      const dir = await storeSourceEnvelopes(envelopes, slug);

      // Count included vs excluded
      const includedCount = envelopes.filter((e) => !e.excluded).length;
      const excludedCount = envelopes.filter((e) => e.excluded).length;

      // If ALL sources excluded, log warning and exit non-zero
      if (includedCount === 0) {
        process.stderr.write(
          `All ${envelopes.length} sources were excluded. Cannot proceed with synthesis.\n`
        );
        process.exit(1);
      }

      process.stderr.write(`Stored ${includedCount} sources (${excludedCount} excluded) at ${dir}\n`);

      // Phase 4: Synthesize articles from raw sources
      process.stderr.write('Synthesizing wiki article(s)...\n');
      const synthesisResult = await synthesize(dir, store);

      // Per D-17: write article title(s) to stdout (machine-readable for Phase 6)
      for (const article of synthesisResult.articles) {
        process.stdout.write(`${article.frontmatter.title}\n`);
      }

      // Summary to stderr
      const newCount = synthesisResult.articles.length - synthesisResult.updatedSlugs.length;
      const updateCount = synthesisResult.updatedSlugs.length;
      process.stderr.write(
        `Done: ${newCount} new article(s), ${updateCount} updated article(s)\n`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  });

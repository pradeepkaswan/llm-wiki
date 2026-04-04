import { Command } from 'commander';
import { loadConfig } from '../config/config.js';
import { createSearchProvider } from '../search/search-provider.js';
import { fetchUrl, isPdf, normalizeArxivUrl } from '../ingestion/fetcher.js';
import { extractFromHtml } from '../ingestion/extractor.js';
import { extractFromPdf } from '../ingestion/pdf-extractor.js';
import { checkQuality } from '../ingestion/quality.js';
import { storeSourceEnvelopes, questionToSlug } from '../ingestion/raw-store.js';
import type { RawSourceEnvelope } from '../types/ingestion.js';

export const askCommand = new Command('ask')
  .description('Ask a question — searches the web, fetches sources, and stores raw envelopes for synthesis')
  .argument('<question>', 'the question to ask')
  .action(async (question: string) => {
    try {
      // Load config and create search provider
      const config = await loadConfig();
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
      process.stderr.write(`Raw sources ready for synthesis. Run Phase 4 to generate wiki article.\n`);
      // Nothing written to stdout — stdout stays clean for Phase 6 subprocess use
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  });

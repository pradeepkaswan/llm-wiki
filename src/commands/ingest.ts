import { Command } from 'commander';
import { fetchUrl, isPdf, normalizeArxivUrl } from '../ingestion/fetcher.js';
import { extractFromHtml } from '../ingestion/extractor.js';
import { extractFromPdf } from '../ingestion/pdf-extractor.js';
import { checkQuality } from '../ingestion/quality.js';
import { storeSourceEnvelopes, urlToSlug } from '../ingestion/raw-store.js';
import type { RawSourceEnvelope } from '../types/ingestion.js';

export const ingestCommand = new Command('ingest')
  .description('Ingest a URL directly as a wiki source — fetches, extracts, and stores a raw envelope')
  .argument('<url>', 'URL to ingest')
  .action(async (url: string) => {
    try {
      // Normalize URL (e.g., arxiv PDF -> abstract page per D-17)
      const normalizedUrl = normalizeArxivUrl(url);
      const slug = urlToSlug(normalizedUrl);

      process.stderr.write(`Ingesting: ${normalizedUrl}\n`);

      // Fetch the URL
      let fetchResult;
      try {
        fetchResult = await fetchUrl(normalizedUrl);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Failed to fetch ${normalizedUrl}: ${message}\n`);
        process.exit(1);
      }

      // Extract content based on type
      let markdown = '';
      let title = '';

      if (isPdf(normalizedUrl, fetchResult.contentType)) {
        // PDF extraction
        markdown = await extractFromPdf(fetchResult.body);
        // Use URL basename as title (last path segment without .pdf)
        const urlPath = new URL(normalizedUrl).pathname;
        const basename = urlPath.split('/').pop() ?? '';
        title = basename.replace(/\.pdf$/i, '') || normalizedUrl;
      } else {
        // HTML extraction
        const html = new TextDecoder().decode(fetchResult.body);
        const extractResult = extractFromHtml(html, normalizedUrl);
        if (extractResult === null) {
          process.stderr.write(`Could not extract content from ${normalizedUrl}\n`);
          process.exit(1);
        }
        markdown = extractResult.markdown;
        title = extractResult.title;
      }

      // Quality check
      const qualityResult = checkQuality(markdown);

      // Build single envelope — D-02: query and search_rank are null for direct ingest
      const envelope: RawSourceEnvelope = {
        url: normalizedUrl,
        title,
        markdown,
        fetched_at: new Date().toISOString(),
        query: null,         // D-02: null for direct ingest
        search_rank: null,   // D-02: null for direct ingest
        content_length: markdown.length,
        excluded: qualityResult.excluded,
        exclude_reason: qualityResult.reason,
      };

      // Store the single envelope
      const dir = await storeSourceEnvelopes([envelope], slug);

      if (envelope.excluded) {
        process.stderr.write(`[EXCLUDED] ${normalizedUrl}: ${envelope.exclude_reason}\n`);
      }

      process.stderr.write(`Stored source at ${dir}/source-01.json\n`);
      process.stderr.write(`Ready for synthesis.\n`);
      // Nothing written to stdout — stdout stays clean for Phase 6 subprocess use
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }
  });

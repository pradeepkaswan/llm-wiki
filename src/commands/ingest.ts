import { Command } from 'commander';

export const ingestCommand = new Command('ingest')
  .description('Ingest a URL directly as a wiki source (Phase 3+)')
  .argument('<url>', 'URL to ingest')
  .action((url: string) => {
    // D-02: all output to stderr; stdout reserved for machine-readable content
    // Note: clack.intro/outro write to stdout by default — using process.stderr.write directly
    process.stderr.write(`wiki ingest\n`);
    process.stderr.write(`URL: ${url}\n`);
    process.stderr.write('URL ingestion available in Phase 3\n');
    process.stderr.write('Phase 3 will fetch and synthesize this URL\n');
  });

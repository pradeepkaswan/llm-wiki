import writeFileAtomic from 'write-file-atomic';
import * as fs from 'fs/promises';
import * as path from 'path';
import slugifyLib from 'slugify';
import { CONFIG_DIR } from '../config/config.js';
import type { RawSourceEnvelope, Manifest } from '../types/ingestion.js';

const RAW_DIR = path.join(CONFIG_DIR, 'raw');

export function questionToSlug(question: string): string {
  return slugifyLib(question, { lower: true, strict: true }).slice(0, 64);
}

export function urlToSlug(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const combined = parsed.hostname + parsed.pathname;
  return slugifyLib(combined, { lower: true, strict: true }).slice(0, 64);
}

export async function storeSourceEnvelopes(
  envelopes: RawSourceEnvelope[],
  slug: string,
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rawDir = path.join(CONFIG_DIR, 'raw');
  const dir = path.join(rawDir, date, slug);
  await fs.mkdir(dir, { recursive: true });

  // Write each envelope as source-01.json, source-02.json, etc.
  for (let i = 0; i < envelopes.length; i++) {
    const filename = `source-${String(i + 1).padStart(2, '0')}.json`;
    await writeFileAtomic(
      path.join(dir, filename),
      JSON.stringify(envelopes[i], null, 2),
      'utf8'
    );
  }

  // Write manifest.json — entry point for Phase 4 (per D-03)
  const manifest: Manifest = {
    query: envelopes[0]?.query ?? null,
    created_at: new Date().toISOString(),
    sources: envelopes.map((e, i) => ({
      file: `source-${String(i + 1).padStart(2, '0')}.json`,
      url: e.url,
      excluded: e.excluded,
      exclude_reason: e.exclude_reason,
    })),
  };
  await writeFileAtomic(
    path.join(dir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  return dir;
}

// Re-export RAW_DIR for external use
export { RAW_DIR };

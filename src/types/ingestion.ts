export interface RawSourceEnvelope {
  url: string;
  title: string;
  markdown: string;
  fetched_at: string;          // ISO 8601
  query: string | null;        // null for direct `wiki ingest` calls
  search_rank: number | null;  // null for direct `wiki ingest` calls
  content_length: number;
  excluded: boolean;
  exclude_reason: string | null;
}

export interface ManifestEntry {
  file: string;
  url: string;
  excluded: boolean;
  exclude_reason: string | null;
}

export interface Manifest {
  query: string | null;
  created_at: string;          // ISO 8601
  sources: ManifestEntry[];
}

import type { Config } from '../config/config.js';
import { ExaSearchProvider } from './exa-provider.js';

export interface SearchResult {
  url: string;
  title: string;
  rank: number;
}

export interface SearchProvider {
  search(query: string): Promise<SearchResult[]>;
}

export function createSearchProvider(config: Config): SearchProvider {
  switch (config.search_provider) {
    case 'exa':
      return new ExaSearchProvider();
    default:
      throw new Error(
        `Invalid search_provider "${String(config.search_provider)}". Valid values: exa.`
      );
  }
}

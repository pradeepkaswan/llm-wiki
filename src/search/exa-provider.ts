import Exa from 'exa-js';
import type { SearchProvider, SearchResult } from './search-provider.js';

const SEARCH_RESULT_COUNT = 5; // D-10: code constant, not configurable

export class ExaSearchProvider implements SearchProvider {
  private client: Exa;

  constructor() {
    const apiKey = process.env['EXA_API_KEY'];
    if (!apiKey) {
      throw new Error('Set EXA_API_KEY environment variable to use web search.');
    }
    this.client = new Exa(apiKey);
  }

  async search(query: string): Promise<SearchResult[]> {
    const response = await this.client.search(query, {
      numResults: SEARCH_RESULT_COUNT,
      type: 'neural',
    });
    return response.results.map((r, i) => ({
      url: r.url,
      title: r.title ?? '',
      rank: i + 1,
    }));
  }
}

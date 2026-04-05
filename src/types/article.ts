export interface Frontmatter {
  title: string;
  tags: string[];
  categories: string[];
  sources: string[];          // URLs; empty array until Phase 4
  sourced_at: string | null;  // ISO date string; null until Phase 4
  type: 'web' | 'compound' | 'filed';   // 'web' = from web search; 'compound' = Q&A filing (Phase 5); 'filed' = broad topic filing (Phase 8)
  created_at: string;         // ISO date string
  updated_at: string;         // ISO date string
  summary: string;            // One-line summary shown in index.md
}

export interface Article {
  slug: string;               // Derived from title via slugify: "flash-attention"
  frontmatter: Frontmatter;
  body: string;               // Markdown body (no frontmatter block)
}

export interface ArticleMetadata {
  slug: string;
  title: string;
  summary: string;
  categories: string[];
  tags: string[];
  updated_at: string;
}

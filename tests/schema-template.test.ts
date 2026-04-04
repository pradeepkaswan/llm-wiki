import { describe, it, expect } from 'vitest';
import {
  buildDefaultSchema,
  extractSchemaCategories,
  appendCategoriesToSchema,
} from '../src/schema/template.js';

describe('buildDefaultSchema', () => {
  it('starts with # Wiki Schema heading', () => {
    const output = buildDefaultSchema([]);
    expect(output).toMatch(/^# Wiki Schema/);
  });

  it('includes Page Types section with web and compound', () => {
    const output = buildDefaultSchema([]);
    expect(output).toContain('## Page Types');
    expect(output).toContain('**web**');
    expect(output).toContain('**compound**');
  });

  it('includes Frontmatter Conventions with required fields', () => {
    const output = buildDefaultSchema([]);
    expect(output).toContain('## Frontmatter Conventions');
    expect(output).toContain('title');
    expect(output).toContain('tags');
    expect(output).toContain('categories');
    expect(output).toContain('type');
    expect(output).toContain('created_at');
    expect(output).toContain('updated_at');
    expect(output).toContain('summary');
  });

  it('includes Category Taxonomy section with provided categories', () => {
    const output = buildDefaultSchema(['Machine Learning', 'Algorithms']);
    expect(output).toContain('## Category Taxonomy');
    expect(output).toContain('- **Machine Learning**');
    expect(output).toContain('- **Algorithms**');
  });

  it('includes empty Category Taxonomy when no categories', () => {
    const output = buildDefaultSchema([]);
    expect(output).toContain('## Category Taxonomy');
    // No bold list items between Category Taxonomy and the next section
    const taxonomyIdx = output.indexOf('## Category Taxonomy');
    const wikilinkIdx = output.indexOf('## Wikilink Style');
    const between = output.slice(taxonomyIdx, wikilinkIdx);
    expect(between).not.toMatch(/- \*\*/);
  });

  it('includes Wikilink Style section', () => {
    const output = buildDefaultSchema([]);
    expect(output).toContain('## Wikilink Style');
    expect(output).toMatch(/lowercase/i);
    expect(output).toMatch(/hyphens/i);
  });

  it('includes LLM instruction prose', () => {
    const output = buildDefaultSchema([]);
    expect(output).toMatch(/[Ww]hen writing articles/);
  });
});

describe('extractSchemaCategories', () => {
  it('extracts categories from taxonomy section', () => {
    const schema = buildDefaultSchema(['ML', 'Algorithms']);
    const result = extractSchemaCategories(schema);
    expect(result.has('ML')).toBe(true);
    expect(result.has('Algorithms')).toBe(true);
  });

  it('returns empty Set when no categories listed', () => {
    const schema = buildDefaultSchema([]);
    const result = extractSchemaCategories(schema);
    expect(result.size).toBe(0);
  });

  it('returns empty Set when no taxonomy section found', () => {
    const result = extractSchemaCategories('# Some other markdown\n\nNo taxonomy here.');
    expect(result.size).toBe(0);
  });
});

describe('appendCategoriesToSchema', () => {
  it('appends new categories to taxonomy section', () => {
    const schema = buildDefaultSchema(['ML']);
    const result = appendCategoriesToSchema(schema, ['Algorithms']);
    expect(result).toContain('- **ML**');
    expect(result).toContain('- **Algorithms**');
  });

  it('does not duplicate existing categories', () => {
    const schema = buildDefaultSchema(['ML']);
    const result = appendCategoriesToSchema(schema, ['ML', 'New']);
    const categories = extractSchemaCategories(result);
    expect(categories.size).toBe(2);
    expect(categories.has('ML')).toBe(true);
    expect(categories.has('New')).toBe(true);
  });
});

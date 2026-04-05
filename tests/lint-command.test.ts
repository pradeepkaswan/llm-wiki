import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the lintCommand Commander command definition
// Pattern from tests/cli.test.ts — unit tests via vi.doMock for dependency injection

describe('lintCommand — command structure', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lintCommand is a Commander Command instance with name lint', async () => {
    vi.doMock('../src/config/config.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        vault_path: '/tmp/test-vault',
        llm_provider: 'claude',
        search_provider: 'exa',
        coverage_threshold: 5.0,
        freshness_days: 30,
      }),
    }));

    vi.doMock('../src/store/wiki-store.js', () => ({
      WikiStore: vi.fn().mockImplementation(() => ({
        listArticles: vi.fn().mockResolvedValue([]),
        readSchema: vi.fn().mockResolvedValue(null),
        appendLog: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    vi.doMock('../src/lint/linter.js', () => ({
      runLint: vi.fn().mockResolvedValue({
        findings: [],
        counts: { orphan: 0, stale: 0, 'missing-concept': 0, 'missing-cross-ref': 0, contradiction: 0 },
        healthScore: 100,
        articleCount: 0,
      }),
    }));

    const { lintCommand } = await import('../src/commands/lint.js');

    expect(lintCommand).toBeDefined();
    expect(lintCommand.name()).toBe('lint');
  });

  it('lintCommand has --category option defined', async () => {
    vi.doMock('../src/config/config.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        vault_path: '/tmp/test-vault',
        llm_provider: 'claude',
        search_provider: 'exa',
        coverage_threshold: 5.0,
        freshness_days: 30,
      }),
    }));

    vi.doMock('../src/store/wiki-store.js', () => ({
      WikiStore: vi.fn().mockImplementation(() => ({
        listArticles: vi.fn().mockResolvedValue([]),
        readSchema: vi.fn().mockResolvedValue(null),
        appendLog: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    vi.doMock('../src/lint/linter.js', () => ({
      runLint: vi.fn().mockResolvedValue({
        findings: [],
        counts: { orphan: 0, stale: 0, 'missing-concept': 0, 'missing-cross-ref': 0, contradiction: 0 },
        healthScore: 100,
        articleCount: 0,
      }),
    }));

    const { lintCommand } = await import('../src/commands/lint.js');

    // Check that --category option exists
    const options = lintCommand.options;
    const categoryOption = options.find((o) => o.long === '--category');
    expect(categoryOption).toBeDefined();
  });

  it('VALID_CATEGORIES contains all 5 lint check types', async () => {
    vi.doMock('../src/config/config.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        vault_path: '/tmp/test-vault',
        llm_provider: 'claude',
        search_provider: 'exa',
        coverage_threshold: 5.0,
        freshness_days: 30,
      }),
    }));

    vi.doMock('../src/store/wiki-store.js', () => ({
      WikiStore: vi.fn().mockImplementation(() => ({
        listArticles: vi.fn().mockResolvedValue([]),
        readSchema: vi.fn().mockResolvedValue(null),
        appendLog: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    vi.doMock('../src/lint/linter.js', () => ({
      runLint: vi.fn().mockResolvedValue({
        findings: [],
        counts: { orphan: 0, stale: 0, 'missing-concept': 0, 'missing-cross-ref': 0, contradiction: 0 },
        healthScore: 100,
        articleCount: 0,
      }),
      VALID_CATEGORIES: ['orphan', 'stale', 'missing-concept', 'missing-cross-ref', 'contradiction'],
    }));

    // VALID_CATEGORIES is defined in lint.ts itself, not imported from linter.ts
    // Verify via the source directly
    const fs = await import('fs/promises');
    const src = await fs.readFile(new URL('../src/commands/lint.ts', import.meta.url).pathname, 'utf8');
    expect(src).toContain("'orphan'");
    expect(src).toContain("'stale'");
    expect(src).toContain("'missing-concept'");
    expect(src).toContain("'missing-cross-ref'");
    expect(src).toContain("'contradiction'");
    expect(src).toContain('VALID_CATEGORIES');
  });

  it('lintCommand description mentions wiki health scanning', async () => {
    vi.doMock('../src/config/config.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        vault_path: '/tmp/test-vault',
        llm_provider: 'claude',
        search_provider: 'exa',
        coverage_threshold: 5.0,
        freshness_days: 30,
      }),
    }));

    vi.doMock('../src/store/wiki-store.js', () => ({
      WikiStore: vi.fn().mockImplementation(() => ({
        listArticles: vi.fn().mockResolvedValue([]),
        readSchema: vi.fn().mockResolvedValue(null),
        appendLog: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    vi.doMock('../src/lint/linter.js', () => ({
      runLint: vi.fn().mockResolvedValue({
        findings: [],
        counts: { orphan: 0, stale: 0, 'missing-concept': 0, 'missing-cross-ref': 0, contradiction: 0 },
        healthScore: 100,
        articleCount: 0,
      }),
    }));

    const { lintCommand } = await import('../src/commands/lint.js');
    expect(lintCommand.description()).toContain('Scan');
  });

  it('lint command source has JSON.stringify(report) written to stdout and Health Score to stderr', async () => {
    // Verify source-level contract: JSON to stdout, human summary to stderr
    // (Testing behavior via source inspection avoids fragile parseAsync + doMock interaction)
    const fs = await import('fs/promises');
    const src = await fs.readFile(new URL('../src/commands/lint.ts', import.meta.url).pathname, 'utf8');

    // D-09: JSON to stdout
    expect(src).toContain('process.stdout.write(JSON.stringify(report)');
    // D-09: Human summary to stderr
    expect(src).toContain('process.stderr.write');
    expect(src).toContain('Health Score:');
    // D-13: Log to log.md
    expect(src).toContain('appendLog(');
    // T-09-01: Input validation
    expect(src).toContain('VALID_CATEGORIES');
    expect(src).toContain('process.exit(1)');
  });
});

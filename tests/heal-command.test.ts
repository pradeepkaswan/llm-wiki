import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the healCommand Commander command definition
// Pattern follows lint-command.test.ts — unit tests via vi.doMock for dependency injection

describe('healCommand — command structure', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('healCommand is a Commander Command instance with name heal', async () => {
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
        updateSchema: vi.fn().mockResolvedValue(undefined),
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

    vi.doMock('../src/lint/healer.js', () => ({
      healFindings: vi.fn().mockResolvedValue({
        fixed: 0,
        skipped: 0,
        errors: 0,
        humanReview: [],
      }),
    }));

    vi.doMock('../src/schema/template.js', () => ({
      buildDefaultSchema: vi.fn().mockReturnValue('# Wiki Schema\n'),
    }));

    const { healCommand } = await import('../src/commands/heal.js');

    expect(healCommand).toBeDefined();
    expect(healCommand.name()).toBe('heal');
  });

  it('healCommand has --dry-run option defined', async () => {
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
        updateSchema: vi.fn().mockResolvedValue(undefined),
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

    vi.doMock('../src/lint/healer.js', () => ({
      healFindings: vi.fn().mockResolvedValue({
        fixed: 0,
        skipped: 0,
        errors: 0,
        humanReview: [],
      }),
    }));

    vi.doMock('../src/schema/template.js', () => ({
      buildDefaultSchema: vi.fn().mockReturnValue('# Wiki Schema\n'),
    }));

    const { healCommand } = await import('../src/commands/heal.js');

    // Check that --dry-run option exists
    const options = healCommand.options;
    const dryRunOption = options.find((o) => o.long === '--dry-run');
    expect(dryRunOption).toBeDefined();
  });

  it('healCommand description contains health-related keywords', async () => {
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
        updateSchema: vi.fn().mockResolvedValue(undefined),
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

    vi.doMock('../src/lint/healer.js', () => ({
      healFindings: vi.fn().mockResolvedValue({
        fixed: 0,
        skipped: 0,
        errors: 0,
        humanReview: [],
      }),
    }));

    vi.doMock('../src/schema/template.js', () => ({
      buildDefaultSchema: vi.fn().mockReturnValue('# Wiki Schema\n'),
    }));

    const { healCommand } = await import('../src/commands/heal.js');

    // Description should contain 'health' or 'auto-fix'
    const desc = healCommand.description().toLowerCase();
    expect(desc.includes('health') || desc.includes('auto-fix') || desc.includes('fix')).toBe(true);
  });

  it('heal command source has runLint, healFindings, appendLog, JSON.stringify, buildDefaultSchema', async () => {
    // Verify source-level contract (avoids fragile parseAsync + doMock interaction)
    const fs = await import('fs/promises');
    const src = await fs.readFile(
      new URL('../src/commands/heal.ts', import.meta.url).pathname,
      'utf8'
    );

    // D-11: Lint-then-fix pattern
    expect(src).toContain('runLint');
    // D-12: Heal routing
    expect(src).toContain('healFindings');
    // D-13: Logging
    expect(src).toContain('appendLog');
    // JSON to stdout
    expect(src).toContain('JSON.stringify(result)');
    // D-18: Schema bootstrap
    expect(src).toContain('buildDefaultSchema');
    // D-17: --dry-run flag
    expect(src).toContain('dry-run');
    expect(src).toContain('dryRun');
  });
});

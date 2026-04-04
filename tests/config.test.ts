import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
// Note: vitest isolates modules per test file; dynamic imports allow per-test module loading

describe('config', () => {
  it('exports CONFIG_DIR pointing to ~/.llm-wiki', async () => {
    const { CONFIG_DIR } = await import('../src/config/config.js');
    expect(CONFIG_DIR).toBe(path.join(os.homedir(), '.llm-wiki'));
  });

  it('loadConfig returns vault_path with correct default', async () => {
    const { loadConfig } = await import('../src/config/config.js');
    const config = await loadConfig();
    // Either the real config exists or defaults were written
    expect(config.vault_path).toBeTruthy();
    expect(typeof config.vault_path).toBe('string');
  });

  it('loadConfig returns object with vault_path key', async () => {
    const { loadConfig } = await import('../src/config/config.js');
    const config = await loadConfig();
    expect(config).toHaveProperty('vault_path');
  });
});

describe('config LLM fields', () => {
  it('loadConfig returns llm_provider defaulting to claude', async () => {
    const { loadConfig } = await import('../src/config/config.js');
    const config = await loadConfig();
    expect(config.llm_provider).toBe('claude');
  });

  it('loadConfig returns llm_base_url defaulting to http://localhost:11434', async () => {
    const { loadConfig } = await import('../src/config/config.js');
    const config = await loadConfig();
    expect(config.llm_base_url).toBe('http://localhost:11434');
  });

  it('loadConfig returns no llm_model key by default (undefined)', async () => {
    const { loadConfig } = await import('../src/config/config.js');
    const config = await loadConfig();
    expect(config.llm_model).toBeUndefined();
  });

  it('VALID_PROVIDERS export contains exactly claude, openai, ollama', async () => {
    const { VALID_PROVIDERS } = await import('../src/config/config.js');
    expect(Array.from(VALID_PROVIDERS)).toEqual(['claude', 'openai', 'ollama']);
  });

  it('validateConfig does not throw for valid provider claude', async () => {
    const { validateConfig } = await import('../src/config/config.js');
    expect(() =>
      validateConfig({
        vault_path: '/some/path',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
        search_provider: 'exa',
        coverage_threshold: 5.0,
      })
    ).not.toThrow();
  });

  it('validateConfig does not throw for valid provider openai', async () => {
    const { validateConfig } = await import('../src/config/config.js');
    expect(() =>
      validateConfig({
        vault_path: '/some/path',
        llm_provider: 'openai',
        llm_base_url: 'http://localhost:11434',
        search_provider: 'exa',
        coverage_threshold: 5.0,
      })
    ).not.toThrow();
  });

  it('validateConfig does not throw for valid provider ollama', async () => {
    const { validateConfig } = await import('../src/config/config.js');
    expect(() =>
      validateConfig({
        vault_path: '/some/path',
        llm_provider: 'ollama',
        llm_base_url: 'http://localhost:11434',
        search_provider: 'exa',
        coverage_threshold: 5.0,
      })
    ).not.toThrow();
  });

  it('validateConfig throws Error containing Invalid llm_provider for typo gpt4', async () => {
    const { validateConfig } = await import('../src/config/config.js');
    expect(() =>
      validateConfig({
        vault_path: '/some/path',
        llm_provider: 'gpt4' as 'claude',
        llm_base_url: 'http://localhost:11434',
        search_provider: 'exa',
      })
    ).toThrow(/Invalid llm_provider/);
  });

  it('validateConfig error message lists claude, openai, ollama for invalid provider', async () => {
    const { validateConfig } = await import('../src/config/config.js');
    let errorMessage = '';
    try {
      validateConfig({
        vault_path: '/some/path',
        llm_provider: 'gpt4' as 'claude',
        llm_base_url: 'http://localhost:11434',
        search_provider: 'exa',
      } as Parameters<typeof validateConfig>[0]);
    } catch (err) {
      errorMessage = (err as Error).message;
    }
    expect(errorMessage).toMatch(/claude/);
    expect(errorMessage).toMatch(/openai/);
    expect(errorMessage).toMatch(/ollama/);
  });
});

describe('config search_provider', () => {
  it('loadConfig returns search_provider defaulting to exa', async () => {
    const { loadConfig } = await import('../src/config/config.js');
    const config = await loadConfig();
    expect(config.search_provider).toBe('exa');
  });

  it('VALID_SEARCH_PROVIDERS contains exactly exa', async () => {
    const { VALID_SEARCH_PROVIDERS } = await import('../src/config/config.js');
    expect(Array.from(VALID_SEARCH_PROVIDERS)).toEqual(['exa']);
  });

  it('validateConfig does not throw for search_provider exa', async () => {
    const { validateConfig } = await import('../src/config/config.js');
    expect(() =>
      validateConfig({
        vault_path: '/some/path',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
        search_provider: 'exa',
        coverage_threshold: 5.0,
      })
    ).not.toThrow();
  });

  it('validateConfig throws Invalid search_provider for unknown value google', async () => {
    const { validateConfig } = await import('../src/config/config.js');
    expect(() =>
      validateConfig({
        vault_path: '/some/path',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
        search_provider: 'google' as 'exa',
      })
    ).toThrow(/Invalid search_provider/);
  });

  it('validateConfig error message contains exa for invalid search_provider', async () => {
    const { validateConfig } = await import('../src/config/config.js');
    let errorMessage = '';
    try {
      validateConfig({
        vault_path: '/some/path',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
        search_provider: 'google' as 'exa',
      });
    } catch (err) {
      errorMessage = (err as Error).message;
    }
    expect(errorMessage).toMatch(/exa/);
  });
});

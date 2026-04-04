import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';

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

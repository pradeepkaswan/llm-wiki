import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export const VALID_PROVIDERS = ['claude', 'openai', 'ollama'] as const;
export type LlmProvider = typeof VALID_PROVIDERS[number];

export interface Config {
  vault_path: string;
  llm_provider: LlmProvider;
  llm_model?: string;
  llm_base_url?: string;
}

export const CONFIG_DIR = path.join(os.homedir(), '.llm-wiki');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS: Config = {
  vault_path: path.join(os.homedir(), 'Desktop', "Pradeep's Vault"),
  llm_provider: 'claude',
  llm_base_url: 'http://localhost:11434',
};

export function validateConfig(config: Config): void {
  if (!VALID_PROVIDERS.includes(config.llm_provider as LlmProvider)) {
    throw new Error(
      `Invalid llm_provider "${String(config.llm_provider)}" in ~/.llm-wiki/config.json. ` +
        `Valid providers: ${VALID_PROVIDERS.join(', ')}.`
    );
  }
}

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    const merged: Config = { ...DEFAULTS, ...parsed };
    validateConfig(merged);
    return merged;
  } catch (err) {
    // Re-throw validation errors — don't swallow them as first-run
    if (err instanceof Error && err.message.includes('Invalid llm_provider')) {
      throw err;
    }
    // First run: create config directory and write defaults
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2), 'utf8');
    const defaults = { ...DEFAULTS };
    validateConfig(defaults);
    return defaults;
  }
}

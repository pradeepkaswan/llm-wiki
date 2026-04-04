import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface Config {
  vault_path: string;
  llm_provider?: string;     // Used in Phase 2; optional here
}

export const CONFIG_DIR = path.join(os.homedir(), '.llm-wiki');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS: Config = {
  vault_path: path.join(os.homedir(), 'Desktop', "Pradeep's Vault"),
};

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    // First run: create config directory and write defaults
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2), 'utf8');
    return { ...DEFAULTS };
  }
}

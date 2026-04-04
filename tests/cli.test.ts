import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);
const CLI = `npx tsx ${path.resolve('./src/index.ts')}`;

// Helper: run CLI command, capture stdout and stderr separately
async function runCLI(args: string): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execAsync(`${CLI} ${args}`, {
      cwd: path.resolve('.'),
      timeout: 15000,
    });
    return { stdout, stderr, code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

describe('CLI stdout/stderr separation (INTG-02)', () => {
  it('wiki ask produces nothing on stdout', async () => {
    const { stdout } = await runCLI('ask "How does attention work?"');
    expect(stdout.trim()).toBe('');
  });

  it('wiki ask writes progress to stderr', async () => {
    const { stderr } = await runCLI('ask "How does attention work?"');
    expect(stderr).toContain('Phase 2');
  });

  it('wiki ingest produces nothing on stdout', async () => {
    const { stdout } = await runCLI('ingest https://example.com');
    expect(stdout.trim()).toBe('');
  });

  it('wiki --help output goes to stderr (not stdout)', async () => {
    const { stdout, stderr } = await runCLI('--help');
    // configureOutput redirects Commander help to stderr
    expect(stdout.trim()).toBe('');
    expect(stderr).toContain('wiki');
  });
});

describe('CLI commands wire correctly (FOUND-01)', () => {
  it('wiki ask exits 0 with a question argument', async () => {
    const { code } = await runCLI('ask "test question"');
    expect(code).toBe(0);
  });

  it('wiki list exits 0', async () => {
    const { code } = await runCLI('list');
    expect(code).toBe(0);
  });

  it('wiki search exits 0 against empty vault', async () => {
    const { code, stdout } = await runCLI('search "anything"');
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('[]'); // empty JSON array to stdout
  });

  it('wiki ingest exits 0 with URL argument', async () => {
    const { code } = await runCLI('ingest https://example.com');
    expect(code).toBe(0);
  });
});

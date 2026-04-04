import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external SDK modules before any imports
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ text: 'mock response' }),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue({ provider: 'anthropic-model' }),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn().mockReturnValue({ provider: 'openai-model' }),
}));

vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn().mockReturnValue(
    vi.fn().mockReturnValue({ provider: 'ollama-model' })
  ),
}));

vi.mock('../src/config/config.js', () => ({
  loadConfig: vi.fn(),
}));

describe('LLM adapter', () => {
  let savedAnthropicKey: string | undefined;
  let savedOpenAIKey: string | undefined;

  beforeEach(() => {
    // Save existing env vars
    savedAnthropicKey = process.env['ANTHROPIC_API_KEY'];
    savedOpenAIKey = process.env['OPENAI_API_KEY'];
    // Set keys present by default
    process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';
    process.env['OPENAI_API_KEY'] = 'test-openai-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore env vars
    if (savedAnthropicKey === undefined) {
      delete process.env['ANTHROPIC_API_KEY'];
    } else {
      process.env['ANTHROPIC_API_KEY'] = savedAnthropicKey;
    }
    if (savedOpenAIKey === undefined) {
      delete process.env['OPENAI_API_KEY'];
    } else {
      process.env['OPENAI_API_KEY'] = savedOpenAIKey;
    }
  });

  describe('createProvider routing', () => {
    it('uses anthropic with claude-sonnet-4-5 when provider=claude and no model', async () => {
      const { anthropic } = await import('@ai-sdk/anthropic');
      const { createProvider } = await import('../src/llm/adapter.js');

      createProvider({
        vault_path: '/vault',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
      });

      expect(vi.mocked(anthropic)).toHaveBeenCalledWith('claude-sonnet-4-5');
    });

    it('uses openai with gpt-4o when provider=openai and no model', async () => {
      const { openai } = await import('@ai-sdk/openai');
      const { createProvider } = await import('../src/llm/adapter.js');

      createProvider({
        vault_path: '/vault',
        llm_provider: 'openai',
        llm_base_url: 'http://localhost:11434',
      });

      expect(vi.mocked(openai)).toHaveBeenCalledWith('gpt-4o');
    });

    it('uses ollama with llama3.3 when provider=ollama and no model', async () => {
      const { createOllama } = await import('ollama-ai-provider');
      const { createProvider } = await import('../src/llm/adapter.js');

      createProvider({
        vault_path: '/vault',
        llm_provider: 'ollama',
        llm_base_url: 'http://localhost:11434',
      });

      const ollamaFactory = vi.mocked(createOllama).mock.results[0]?.value as ReturnType<typeof vi.fn>;
      expect(ollamaFactory).toHaveBeenCalledWith('llama3.3');
    });

    it('uses config.llm_model when provided for claude', async () => {
      const { anthropic } = await import('@ai-sdk/anthropic');
      const { createProvider } = await import('../src/llm/adapter.js');

      createProvider({
        vault_path: '/vault',
        llm_provider: 'claude',
        llm_model: 'claude-opus-4',
        llm_base_url: 'http://localhost:11434',
      });

      expect(vi.mocked(anthropic)).toHaveBeenCalledWith('claude-opus-4');
    });

    it('creates ollama provider with baseURL http://localhost:11434/api (default)', async () => {
      const { createOllama } = await import('ollama-ai-provider');
      const { createProvider } = await import('../src/llm/adapter.js');

      createProvider({
        vault_path: '/vault',
        llm_provider: 'ollama',
        llm_base_url: 'http://localhost:11434',
      });

      expect(vi.mocked(createOllama)).toHaveBeenCalledWith({
        baseURL: 'http://localhost:11434/api',
      });
    });

    it('creates ollama provider with custom llm_base_url + /api suffix', async () => {
      const { createOllama } = await import('ollama-ai-provider');
      const { createProvider } = await import('../src/llm/adapter.js');

      createProvider({
        vault_path: '/vault',
        llm_provider: 'ollama',
        llm_base_url: 'http://myhost:9999',
      });

      expect(vi.mocked(createOllama)).toHaveBeenCalledWith({
        baseURL: 'http://myhost:9999/api',
      });
    });
  });

  describe('API key pre-flight checks', () => {
    it('throws error containing ANTHROPIC_API_KEY when provider=claude and key is missing', async () => {
      delete process.env['ANTHROPIC_API_KEY'];
      const { createProvider } = await import('../src/llm/adapter.js');

      expect(() =>
        createProvider({
          vault_path: '/vault',
          llm_provider: 'claude',
          llm_base_url: 'http://localhost:11434',
        })
      ).toThrow(/ANTHROPIC_API_KEY/);
    });

    it('throws error containing OPENAI_API_KEY when provider=openai and key is missing', async () => {
      delete process.env['OPENAI_API_KEY'];
      const { createProvider } = await import('../src/llm/adapter.js');

      expect(() =>
        createProvider({
          vault_path: '/vault',
          llm_provider: 'openai',
          llm_base_url: 'http://localhost:11434',
        })
      ).toThrow(/OPENAI_API_KEY/);
    });

    it('does not throw for missing API key when provider=ollama', async () => {
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      const { createProvider } = await import('../src/llm/adapter.js');

      expect(() =>
        createProvider({
          vault_path: '/vault',
          llm_provider: 'ollama',
          llm_base_url: 'http://localhost:11434',
        })
      ).not.toThrow();
    });
  });

  describe('generateText', () => {
    it('calls SDK generateText with anthropic model and returns text string', async () => {
      const { loadConfig } = await import('../src/config/config.js');
      vi.mocked(loadConfig).mockResolvedValue({
        vault_path: '/vault',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
      });

      const { generateText: sdkGenerateText } = await import('ai');
      vi.mocked(sdkGenerateText).mockResolvedValue({ text: 'hello from claude' } as never);

      const { generateText } = await import('../src/llm/adapter.js');
      const result = await generateText('test prompt');

      expect(result).toBe('hello from claude');
      expect(vi.mocked(sdkGenerateText)).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'test prompt' })
      );
    });

    it('calls SDK generateText with openai model when provider=openai', async () => {
      const { loadConfig } = await import('../src/config/config.js');
      vi.mocked(loadConfig).mockResolvedValue({
        vault_path: '/vault',
        llm_provider: 'openai',
        llm_base_url: 'http://localhost:11434',
      });

      const { generateText: sdkGenerateText } = await import('ai');
      vi.mocked(sdkGenerateText).mockResolvedValue({ text: 'hello from openai' } as never);

      const { generateText } = await import('../src/llm/adapter.js');
      const result = await generateText('test prompt');

      expect(result).toBe('hello from openai');
    });

    it('calls SDK generateText with ollama model when provider=ollama', async () => {
      const { loadConfig } = await import('../src/config/config.js');
      vi.mocked(loadConfig).mockResolvedValue({
        vault_path: '/vault',
        llm_provider: 'ollama',
        llm_base_url: 'http://localhost:11434',
      });

      const { generateText: sdkGenerateText } = await import('ai');
      vi.mocked(sdkGenerateText).mockResolvedValue({ text: 'hello from ollama' } as never);

      const { generateText } = await import('../src/llm/adapter.js');
      const result = await generateText('test prompt');

      expect(result).toBe('hello from ollama');
    });
  });

  describe('generateText with GenerateOptions', () => {
    it('still works with no options (backward compat)', async () => {
      const { loadConfig } = await import('../src/config/config.js');
      vi.mocked(loadConfig).mockResolvedValue({
        vault_path: '/vault',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
      });

      const { generateText: sdkGenerateText } = await import('ai');
      vi.mocked(sdkGenerateText).mockResolvedValue({ text: 'hello' } as never);

      const { generateText } = await import('../src/llm/adapter.js');
      const result = await generateText('hello');

      expect(result).toBe('hello');
    });

    it('passes system to SDK when provided', async () => {
      const { loadConfig } = await import('../src/config/config.js');
      vi.mocked(loadConfig).mockResolvedValue({
        vault_path: '/vault',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
      });

      const { generateText: sdkGenerateText } = await import('ai');
      vi.mocked(sdkGenerateText).mockResolvedValue({ text: 'ok' } as never);

      const { generateText } = await import('../src/llm/adapter.js');
      await generateText('hello', { system: 'You are a wiki author' });

      expect(vi.mocked(sdkGenerateText)).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a wiki author',
        })
      );
    });

    it('passes system and temperature to SDK when provided', async () => {
      const { loadConfig } = await import('../src/config/config.js');
      vi.mocked(loadConfig).mockResolvedValue({
        vault_path: '/vault',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
      });

      const { generateText: sdkGenerateText } = await import('ai');
      vi.mocked(sdkGenerateText).mockResolvedValue({ text: 'ok' } as never);

      const { generateText } = await import('../src/llm/adapter.js');
      await generateText('hello', { system: 'You are a wiki author', temperature: 0.3 });

      expect(vi.mocked(sdkGenerateText)).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a wiki author',
          temperature: 0.3,
        })
      );
    });

    it('passes temperature and maxOutputTokens to SDK when provided', async () => {
      const { loadConfig } = await import('../src/config/config.js');
      vi.mocked(loadConfig).mockResolvedValue({
        vault_path: '/vault',
        llm_provider: 'claude',
        llm_base_url: 'http://localhost:11434',
      });

      const { generateText: sdkGenerateText } = await import('ai');
      vi.mocked(sdkGenerateText).mockResolvedValue({ text: 'ok' } as never);

      const { generateText } = await import('../src/llm/adapter.js');
      await generateText('hello', { temperature: 0.3, maxOutputTokens: 4096 });

      expect(vi.mocked(sdkGenerateText)).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3,
          maxOutputTokens: 4096,
        })
      );
    });
  });
});

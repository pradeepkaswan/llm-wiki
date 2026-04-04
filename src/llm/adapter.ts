import { generateText as sdkGenerateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';
import { loadConfig } from '../config/config.js';
import type { LanguageModel } from 'ai';
import type { Config } from '../config/config.js';

export function createProvider(config: Config): LanguageModel {
  const model = config.llm_model;
  switch (config.llm_provider) {
    case 'claude':
      if (!process.env['ANTHROPIC_API_KEY']) {
        throw new Error(
          'Missing API key: set ANTHROPIC_API_KEY environment variable to use Claude.'
        );
      }
      return anthropic(model ?? 'claude-sonnet-4-5');
    case 'openai':
      if (!process.env['OPENAI_API_KEY']) {
        throw new Error(
          'Missing API key: set OPENAI_API_KEY environment variable to use OpenAI.'
        );
      }
      return openai(model ?? 'gpt-4o');
    case 'ollama': {
      const ollamaProvider = createOllama({
        baseURL: `${config.llm_base_url ?? 'http://localhost:11434'}/api`,
      });
      return ollamaProvider(model ?? 'llama3.3');
    }
    default:
      throw new Error(
        `Invalid llm_provider "${String(config.llm_provider)}". ` +
          'Valid values: claude, openai, ollama.'
      );
  }
}

export async function generateText(prompt: string): Promise<string> {
  const config = await loadConfig();
  const model = createProvider(config);
  const { text } = await sdkGenerateText({ model, prompt });
  return text;
}

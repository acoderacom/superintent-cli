import type { DoctorConfig } from '../types.js';

/**
 * Create a LanguageModel instance from DoctorConfig.
 * All provider packages are lazy-loaded via dynamic import.
 */
export async function createDoctorModel(config: DoctorConfig) {
  const colonIdx = config.model.indexOf(':');
  if (colonIdx === -1) {
    throw new Error(
      `Invalid DOCTOR_MODEL format: "${config.model}". Expected "provider:model-id" (e.g. "anthropic:claude-sonnet-4-5-20250929")`,
    );
  }

  const provider = config.model.slice(0, colonIdx);
  const modelId = config.model.slice(colonIdx + 1);

  switch (provider) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const anthropic = createAnthropic({
        ...(config.apiKey && { apiKey: config.apiKey }),
        ...(config.baseUrl && { baseURL: config.baseUrl }),
      });
      return anthropic(modelId);
    }

    case 'openai': {
      // @ai-sdk/openai supports baseURL override and structured outputs
      const { createOpenAI } = await import('@ai-sdk/openai');
      const openai = createOpenAI({
        ...(config.apiKey && { apiKey: config.apiKey }),
        ...(config.baseUrl && { baseURL: config.baseUrl }),
      });
      return openai(modelId);
    }

    case 'compatible': {
      // For non-OpenAI providers that don't support structured outputs
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
      const compatible = createOpenAICompatible({
        name: 'doctor-compatible',
        baseURL: config.baseUrl || 'http://localhost:11434/v1',
        ...(config.apiKey && { apiKey: config.apiKey }),
      });
      return compatible(modelId);
    }

    default:
      throw new Error(`Unsupported provider "${provider}" in DOCTOR_MODEL. Supported: anthropic, openai, compatible`);
  }
}

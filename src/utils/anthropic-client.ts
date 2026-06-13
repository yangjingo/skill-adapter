import Anthropic from '@anthropic-ai/sdk';
import { modelConfigLoader } from '../core/model-config-loader';

export interface AnthropicClientResult {
  client: Anthropic | null;
  modelId: string;
}

/**
 * Create an Anthropic client from the detected model configuration.
 * Returns { client: null, modelId: '' } if no config is available.
 */
export function createAnthropicClient(): AnthropicClientResult {
  const result = modelConfigLoader.load();
  if (result.success && result.config) {
    return {
      client: new Anthropic({
        apiKey: result.config.apiKey,
        baseURL: result.config.baseUrl,
      }),
      modelId: result.config.modelId,
    };
  }
  return { client: null, modelId: '' };
}

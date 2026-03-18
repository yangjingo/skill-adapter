/**
 * AI Evolution Engine - AI-powered skill evolution
 */

import Anthropic from '@anthropic-ai/sdk';
import { modelConfigLoader } from '../model-config-loader';
import { buildEvolutionPrompt, buildSummaryPrompt } from './prompts';

/**
 * AI-generated recommendation
 */
export interface AIRecommendation {
  type: 'env_adaptation' | 'style_injection' | 'error_avoidance' | 'best_practice';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedContent: string;
  confidence: number;
}

/**
 * AI response structure
 */
interface AIResponse {
  recommendations: AIRecommendation[];
}

/**
 * Evolution result
 */
export interface EvolutionResult {
  skillName: string;
  oldVersion: string;
  newVersion: string;
  recommendations: AIRecommendation[];
  appliedRecommendations: AIRecommendation[];
  skippedRecommendations: AIRecommendation[];
  summary: string;
}

/**
 * Stream callback for real-time output
 */
export interface StreamCallbacks {
  onThinking?: (text: string) => void;
  onContent?: (text: string) => void;
  onComplete?: () => void;
}

/**
 * AI Evolution Engine
 */
export class AIEvolutionEngine {
  private client: Anthropic | null = null;
  private modelId: string = 'claude-sonnet-4-6';

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const result = modelConfigLoader.load();
    if (result.success && result.config) {
      this.client = new Anthropic({
        apiKey: result.config.apiKey,
        baseURL: result.config.baseUrl,
      });
      this.modelId = result.config.modelId;
    }
  }

  /**
   * Check if AI is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Get model info
   */
  getModelInfo(): { modelId: string; available: boolean } {
    return {
      modelId: this.modelId,
      available: this.client !== null,
    };
  }

  /**
   * Generate evolution recommendations using AI with streaming
   */
  async generateRecommendations(
    context: {
      skillName: string;
      skillContent: string;
      soulPreferences?: { communicationStyle?: string; boundaries?: string[] };
      memoryRules?: Array<{ category: string; rule: string }>;
      workspaceInfo?: { languages?: string[]; frameworks?: string[]; packageManager?: string };
    },
    callbacks?: StreamCallbacks
  ): Promise<AIRecommendation[]> {
    if (!this.client) {
      throw new Error('AI model not configured. Run `sa config` to set up model.');
    }

    const prompt = buildEvolutionPrompt(context);

    try {
      // Use streaming API for real-time output
      const stream = this.client.messages.stream({
        model: this.modelId,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      let fullText = '';
      let thinkingText = '';

      // Process stream events using async iteration
      for await (const event of await stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta as any;
          if (delta.type === 'thinking_delta' && delta.thinking) {
            thinkingText += delta.thinking;
            callbacks?.onThinking?.(delta.thinking);
          } else if (delta.type === 'text_delta' && delta.text) {
            fullText += delta.text;
            callbacks?.onContent?.(delta.text);
          }
        }
      }

      callbacks?.onComplete?.();

      // Debug: log fullText if parsing might fail
      const recommendations = this.parseRecommendations(fullText);
      if (recommendations.length === 0 && fullText) {
        console.log('[DEBUG] fullText length:', fullText.length);
        console.log('[DEBUG] fullText preview:', fullText.slice(0, 300));
      }

      return recommendations;
    } catch (error: any) {
      throw new Error(`AI request failed: ${error.message}`);
    }
  }

  /**
   * Generate evolution recommendations (non-streaming, for compatibility)
   */
  async generateRecommendationsSync(context: {
    skillName: string;
    skillContent: string;
    soulPreferences?: { communicationStyle?: string; boundaries?: string[] };
    memoryRules?: Array<{ category: string; rule: string }>;
    workspaceInfo?: { languages?: string[]; frameworks?: string[]; packageManager?: string };
  }): Promise<AIRecommendation[]> {
    if (!this.client) {
      throw new Error('AI model not configured.');
    }

    const prompt = buildEvolutionPrompt(context);
    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';
    return this.parseRecommendations(text);
  }

  /**
   * Parse AI response to recommendations
   */
  private parseRecommendations(text: string): AIRecommendation[] {
    // Extract JSON from response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as AIResponse;
        return parsed.recommendations || [];
      } catch {}
    }

    // Try direct JSON parse
    try {
      const parsed = JSON.parse(text) as AIResponse;
      return parsed.recommendations || [];
    } catch {
      const objectMatch = text.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
      if (objectMatch) {
        try {
          const parsed = JSON.parse(objectMatch[0]) as AIResponse;
          return parsed.recommendations || [];
        } catch {}
      }
      return [];
    }
  }

  /**
   * Generate evolution summary using AI
   */
  async generateSummary(context: {
    skillName: string;
    oldVersion: string;
    newVersion: string;
    appliedChanges: Array<{ title: string; description: string }>;
  }): Promise<string> {
    if (!this.client) {
      return `${context.skillName} evolved from ${context.oldVersion} to ${context.newVersion}`;
    }

    const prompt = buildSummaryPrompt(context);

    try {
      const response = await this.client.messages.create({
        model: this.modelId,
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(block => block.type === 'text');
      return textBlock && 'text' in textBlock ? textBlock.text.trim() : '';
    } catch {
      return `${context.skillName} evolved from ${context.oldVersion} to ${context.newVersion}`;
    }
  }
}

// Singleton
export const aiEvolutionEngine = new AIEvolutionEngine();
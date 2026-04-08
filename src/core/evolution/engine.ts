/**
 * SA Agent Evolution Engine - SA Agent-powered skill evolution
 */

import Anthropic from '@anthropic-ai/sdk';
import { modelConfigLoader } from '../model-config-loader';
import { buildEvolutionPrompt, buildSummaryPrompt } from './prompts';
import type { SessionEvidenceContext } from './prompts';

/**
 * SA Agent-generated recommendation
 */
export interface SAAgentRecommendation {
  type: 'env_adaptation' | 'style_injection' | 'error_avoidance' | 'best_practice';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedContent: string;
  confidence: number;
}

/**
 * SA Agent response structure
 */
interface SAAgentResponse {
  recommendations: SAAgentRecommendation[];
}

/**
 * Evolution result
 */
export interface EvolutionResult {
  skillName: string;
  oldVersion: string;
  newVersion: string;
  recommendations: SAAgentRecommendation[];
  appliedRecommendations: SAAgentRecommendation[];
  skippedRecommendations: SAAgentRecommendation[];
  summary: string;
}

/**
 * Stream callback for real-time output
 */
export interface StreamCallbacks {
  onThinking?: (text: string) => void;
  onContent?: (text: string) => void;
  onComplete?: () => void;
  onRoundStart?: (round: number, totalRounds: number) => void;
}

export interface SAAgentEvolutionContext {
  skillName: string;
  skillContent: string;
  soulPreferences?: { communicationStyle?: string; boundaries?: string[] };
  memoryRules?: Array<{ category: string; rule: string }>;
  workspaceInfo?: { languages?: string[]; frameworks?: string[]; packageManager?: string };
  sessionEvidence?: SessionEvidenceContext;
  loopConfig?: {
    enabled?: boolean;
    maxRounds?: number;
    minConfidence?: number;
  };
}

/**
 * SA Agent Evolution Engine
 */
export class SAAgentEvolutionEngine {
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
   * Check if SA Agent is available
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
   * Generate evolution recommendations using SA Agent with streaming
   */
  async generateRecommendations(
    context: SAAgentEvolutionContext,
    callbacks?: StreamCallbacks
  ): Promise<SAAgentRecommendation[]> {
    if (!this.client) {
      throw new Error('SA Agent model not configured. Run `sa config` to set up model.');
    }

    if (context.loopConfig?.enabled === false) {
      return this.generateRecommendationsSingle(context, callbacks);
    }

    return this.generateRecommendationsLoop(context, callbacks);
  }

  async generateRecommendationsSync(context: SAAgentEvolutionContext): Promise<SAAgentRecommendation[]> {
    if (!this.client) {
      throw new Error('SA Agent model not configured.');
    }

    return this.generateRecommendationsSingle({ ...context, loopConfig: { enabled: false } });
  }

  /**
   * Parse SA Agent response to recommendations
   */
  private parseRecommendations(text: string): SAAgentRecommendation[] {
    // Extract JSON from response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as SAAgentResponse;
        return parsed.recommendations || [];
      } catch {}
    }

    // Try direct JSON parse
    try {
      const parsed = JSON.parse(text) as SAAgentResponse;
      return parsed.recommendations || [];
    } catch {
      const objectMatch = text.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
      if (objectMatch) {
        try {
          const parsed = JSON.parse(objectMatch[0]) as SAAgentResponse;
          return parsed.recommendations || [];
        } catch {}
      }
      return [];
    }
  }

  private async generateRecommendationsLoop(
    context: SAAgentEvolutionContext,
    callbacks?: StreamCallbacks
  ): Promise<SAAgentRecommendation[]> {
    const maxRounds = Math.max(2, Math.min(context.loopConfig?.maxRounds ?? 3, 4));
    const minConfidence = context.loopConfig?.minConfidence ?? 0.8;

    let currentContext = { ...context };
    let previousFingerprint = '';
    let bestRecommendations: SAAgentRecommendation[] = [];
    let bestScore = -1;
    const roundSummaries: string[] = [];

    for (let round = 1; round <= maxRounds; round++) {
      callbacks?.onRoundStart?.(round, maxRounds);
      if (round > 1) {
        currentContext = {
          ...context,
          skillContent: augmentSkillContentForLoop(context.skillContent, roundSummaries),
          loopConfig: { ...context.loopConfig, enabled: false },
        };
      }

      const recommendations = await this.generateRecommendationsSingle(currentContext, {
        ...callbacks,
        onRoundStart: undefined,
      });

      const fingerprint = fingerprintRecommendations(recommendations);
      const score = scoreRecommendations(recommendations, minConfidence);

      if (score > bestScore) {
        bestScore = score;
        bestRecommendations = recommendations;
      }

      if (fingerprint === previousFingerprint) {
        break;
      }
      previousFingerprint = fingerprint;

      roundSummaries.push(summarizeRound(recommendations, round));

      const stopEarly = recommendations.length > 0 && score >= 1 && recommendations.every(rec => rec.confidence >= minConfidence);
      if (stopEarly) {
        break;
      }
    }

    callbacks?.onComplete?.();
    return bestRecommendations;
  }

  private async generateRecommendationsSingle(
    context: SAAgentEvolutionContext,
    callbacks?: StreamCallbacks
  ): Promise<SAAgentRecommendation[]> {
    const prompt = buildEvolutionPrompt(context);

    try {
      const stream = this.client!.messages.stream({
        model: this.modelId,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      let fullText = '';
      for await (const event of await stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta as any;
          if (delta.type === 'thinking_delta' && delta.thinking) {
            callbacks?.onThinking?.(delta.thinking);
          } else if (delta.type === 'text_delta' && delta.text) {
            fullText += delta.text;
            callbacks?.onContent?.(delta.text);
          }
        }
      }

      const recommendations = this.parseRecommendations(fullText);
      if (recommendations.length === 0 && fullText) {
        console.log('[DEBUG] fullText length:', fullText.length);
        console.log('[DEBUG] fullText preview:', fullText.slice(0, 300));
      }
      return recommendations;
    } catch (error: any) {
      throw new Error(`SA Agent request failed: ${error.message}`);
    }
  }

  /**
   * Generate evolution summary using SA Agent
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

  /**
   * Get quick suggestion for a skill (one-line hint)
   * Used before full evolution to show user what could be improved
   */
  async getQuickSuggestion(skillContent: string): Promise<string> {
    if (!this.client) {
      return 'Consider adding more examples and error handling';
    }

    const prompt = `Analyze this skill content briefly. Give ONE concise suggestion (max 60 chars) for improvement.

Skill content (first 2000 chars):
${skillContent.slice(0, 2000)}

Reply format: Just the suggestion, no explanation. Example: "Add error handling examples" or "Include TypeScript types"`;

    try {
      const response = await this.client.messages.create({
        model: this.modelId,
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(block => block.type === 'text');
      if (textBlock && 'text' in textBlock) {
        return textBlock.text.trim().slice(0, 80);
      }
      return 'Consider adding more examples';
    } catch {
      return 'Consider adding more examples';
    }
  }
}

// Singleton
export const saAgentEvolutionEngine = new SAAgentEvolutionEngine();

function summarizeRound(recommendations: SAAgentRecommendation[], round: number): string {
  if (recommendations.length === 0) {
    return `Round ${round}: no recommendations generated.`;
  }

  const top = [...recommendations]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4)
    .map(rec => `[${rec.priority}] ${rec.title} (${(rec.confidence * 100).toFixed(0)}%)`);

  return `Round ${round}: ${top.join('; ')}`;
}

function fingerprintRecommendations(recommendations: SAAgentRecommendation[]): string {
  return recommendations
    .map(rec => `${rec.priority}:${rec.type}:${rec.title}:${Math.round(rec.confidence * 100)}`)
    .sort()
    .join('|');
}

function scoreRecommendations(recommendations: SAAgentRecommendation[], minConfidence: number): number {
  return recommendations.reduce((score, rec) => {
    if (rec.confidence >= minConfidence) {
      return score + 2;
    }
    if (rec.confidence >= 0.65) {
      return score + 1;
    }
    return score;
  }, 0);
}

function augmentSkillContentForLoop(skillContent: string, roundSummaries: string[]): string {
  if (roundSummaries.length === 0) {
    return skillContent;
  }

  return `${skillContent}\n\n## Previous Agent Loop Findings\n${roundSummaries.map(item => `- ${item}`).join('\n')}\n\n## Loop Instruction\nRefine the recommendations above. Remove weak or redundant items, keep only evidence-backed changes, and prefer specific actionable edits.`;
}

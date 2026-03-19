/**
 * Evaluator - Evolution effect evaluation
 *
 * Compares metrics before and after evolution, calculates delta percentages, generates conclusions
 * Supports both traditional calculation and SA Agent-powered intelligent evaluation
 */

import Anthropic from '@anthropic-ai/sdk';
import ora from 'ora';
import { MetricsSummary } from './telemetry';
import { modelConfigLoader } from './model-config-loader';

/**
 * Security metrics for evaluation
 */
export interface SecurityMetrics {
  totalIssues: number;        // Total issues count
  highSeverity: number;       // High severity issues
  mediumSeverity: number;     // Medium severity issues
  lowSeverity: number;        // Low severity issues
  riskScore: number;          // Risk score (0-100)
}

export interface EvaluationResult {
  skillName: string;
  baselineVersion: string;
  evolvedVersion: string;
  metrics: MetricComparison[];
  overallStatus: 'improved' | 'degraded' | 'neutral';
  conclusion: string;
  timestamp: Date;
  aiInsights?: string;
  aiRecommendations?: string[];
}

export interface MetricComparison {
  name: string;
  baseline: number;
  evolved: number;
  delta: number;  // Percentage change
  deltaType: 'increase' | 'decrease' | 'unchanged';
  status: 'good' | 'bad' | 'neutral';
  description: string;
  analysis?: string;  // AI-generated analysis
}

/**
 * Stream callbacks for real-time output
 */
export interface EvaluatorStreamCallbacks {
  onThinking?: (text: string) => void;
  onContent?: (text: string) => void;
  onProgress?: (message: string) => void;
}

/**
 * SA Agent Evaluation response structure
 */
interface SAAgentEvaluationResponse {
  metrics: Array<{
    name: string;
    analysis: string;
  }>;
  overallStatus: 'improved' | 'degraded' | 'neutral';
  conclusion: string;
  recommendations: string[];
  insights: string;
}

export class Evaluator {
  private client: Anthropic | null = null;
  private modelId: string = 'claude-sonnet-4-6';

  constructor() {
    this.initClient();
  }

  /**
   * Initialize SA Agent client from model config
   */
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
  isAIAvailable(): boolean {
    return this.client !== null;
  }
  /**
   * Evaluate evolution by comparing two sets of metrics
   */
  evaluate(
    skillName: string,
    baselineVersion: string,
    evolvedVersion: string,
    baselineMetrics: MetricsSummary,
    evolvedMetrics: MetricsSummary,
    securityMetrics?: {
      baseline: SecurityMetrics;
      evolved: SecurityMetrics;
    }
  ): EvaluationResult {
    const metrics = this.compareMetrics(baselineMetrics, evolvedMetrics, securityMetrics);
    const overallStatus = this.determineOverallStatus(metrics);
    const conclusion = this.generateConclusion(metrics, overallStatus);

    return {
      skillName,
      baselineVersion,
      evolvedVersion,
      metrics,
      overallStatus,
      conclusion,
      timestamp: new Date()
    };
  }

  /**
   * SA Agent-powered evaluation with streaming output
   * Combines traditional metrics calculation with SA Agent intelligent analysis
   */
  async evaluateWithAI(
    skillName: string,
    baselineVersion: string,
    evolvedVersion: string,
    baselineMetrics: MetricsSummary,
    evolvedMetrics: MetricsSummary,
    callbacks?: EvaluatorStreamCallbacks,
    securityMetrics?: {
      baseline: SecurityMetrics;
      evolved: SecurityMetrics;
    }
  ): Promise<EvaluationResult> {
    // Step 1: Traditional metrics calculation
    callbacks?.onProgress?.('Calculating metrics changes...');
    const spinner = ora('Calculating metrics changes...').start();

    const basicMetrics = this.compareMetrics(baselineMetrics, evolvedMetrics, securityMetrics);
    const basicStatus = this.determineOverallStatus(basicMetrics);
    spinner.succeed('Metrics calculation complete');

    // Check if SA Agent is available
    if (!this.client) {
      callbacks?.onProgress?.('SA Agent not enabled, returning basic evaluation results');
      const conclusion = this.generateConclusion(basicMetrics, basicStatus);
      return {
        skillName,
        baselineVersion,
        evolvedVersion,
        metrics: basicMetrics,
        overallStatus: basicStatus,
        conclusion,
        timestamp: new Date()
      };
    }

    // Step 2: SA Agent intelligent analysis with streaming
    callbacks?.onProgress?.('SA Agent intelligent analysis...');
    spinner.start('SA Agent intelligent analysis...');

    try {
      const agentResult = await this.performAgentEvaluation(
        skillName,
        baselineMetrics,
        evolvedMetrics,
        basicMetrics,
        callbacks
      );

      spinner.succeed('SA Agent analysis complete');

      // Step 3: Merge results
      return this.mergeAgentResults(
        skillName,
        baselineVersion,
        evolvedVersion,
        basicMetrics,
        agentResult
      );
    } catch (error: any) {
      spinner.fail(`SA Agent analysis failed: ${error.message}`);
      callbacks?.onProgress?.('SA Agent analysis failed, returning basic evaluation results');
      const conclusion = this.generateConclusion(basicMetrics, basicStatus);
      return {
        skillName,
        baselineVersion,
        evolvedVersion,
        metrics: basicMetrics,
        overallStatus: basicStatus,
        conclusion,
        timestamp: new Date()
      };
    }
  }

  /**
   * Perform SA Agent evaluation with streaming
   */
  private async performAgentEvaluation(
    skillName: string,
    baselineMetrics: MetricsSummary,
    evolvedMetrics: MetricsSummary,
    basicMetrics: MetricComparison[],
    callbacks?: EvaluatorStreamCallbacks
  ): Promise<SAAgentEvaluationResponse> {
    if (!this.client) {
      throw new Error('SA Agent client not initialized');
    }

    const prompt = this.buildEvaluationPrompt(skillName, baselineMetrics, evolvedMetrics, basicMetrics);

    // Use streaming API
    const stream = this.client.messages.stream({
      model: this.modelId,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    let fullText = '';

    // Process stream events
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

    return this.parseAgentEvaluation(fullText);
  }

  /**
   * Build evaluation prompt - model decides output language
   */
  private buildEvaluationPrompt(
    skillName: string,
    baselineMetrics: MetricsSummary,
    evolvedMetrics: MetricsSummary,
    basicMetrics: MetricComparison[]
  ): string {
    return `You are a skill evolution evaluation expert. Analyze the following metrics changes and provide insightful evaluation.

**Output Language**: Respond in the same language as the skill name. If the skill name is in Chinese, output in Chinese. If in English, output in English.

## Skill Information
- Name: ${skillName}

## Baseline Version Metrics
\`\`\`json
${JSON.stringify(baselineMetrics, null, 2)}
\`\`\`

## Evolved Version Metrics
\`\`\`json
${JSON.stringify(evolvedMetrics, null, 2)}
\`\`\`

## Basic Metrics Changes
\`\`\`json
${JSON.stringify(basicMetrics.map(m => ({
  name: m.name,
  baseline: m.baseline,
  evolved: m.evolved,
  delta: m.delta + '%',
  status: m.status
})), null, 2)}
\`\`\`

## Analysis Tasks
1. Analyze the actual meaning and causes of each metric change
2. Evaluate the overall effect of evolution (consider metric correlations)
3. Generate insightful conclusions (avoid fixed templates, be profound)
4. Provide specific improvement recommendations

## Output Format (JSON Only)
\`\`\`json
{
  "metrics": [
    {
      "name": "Metric name",
      "analysis": "Deep analysis of change causes and impact"
    }
  ],
  "overallStatus": "improved|degraded|neutral",
  "conclusion": "Natural, insightful conclusion without fixed template",
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "insights": "Deep insight summary..."
}
\`\`\`

Please provide evaluation results:`;
  }

  /**
   * Parse SA Agent evaluation response
   */
  private parseAgentEvaluation(text: string): SAAgentEvaluationResponse {
    // Extract JSON from response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as SAAgentEvaluationResponse;
      } catch {}
    }

    // Try direct JSON parse
    try {
      return JSON.parse(text) as SAAgentEvaluationResponse;
    } catch {
      // Return default if parsing fails
      return {
        metrics: [],
        overallStatus: 'neutral',
        conclusion: 'AI evaluation parsing failed',
        recommendations: [],
        insights: ''
      };
    }
  }

  /**
   * Merge SA Agent results with basic metrics
   */
  private mergeAgentResults(
    skillName: string,
    baselineVersion: string,
    evolvedVersion: string,
    basicMetrics: MetricComparison[],
    agentResult: SAAgentEvaluationResponse
  ): EvaluationResult {
    // Add SA Agent analysis to each metric
    const enhancedMetrics = basicMetrics.map(metric => {
      const agentMetric = agentResult.metrics.find(m => m.name === metric.name);
      return {
        ...metric,
        analysis: agentMetric?.analysis
      };
    });

    return {
      skillName,
      baselineVersion,
      evolvedVersion,
      metrics: enhancedMetrics,
      overallStatus: agentResult.overallStatus,
      conclusion: agentResult.conclusion,
      timestamp: new Date(),
      aiInsights: agentResult.insights,
      aiRecommendations: agentResult.recommendations
    };
  }

  /**
   * Compare metrics and calculate deltas
   */
  private compareMetrics(
    baseline: MetricsSummary,
    evolved: MetricsSummary,
    securityMetrics?: {
      baseline: SecurityMetrics;
      evolved: SecurityMetrics;
    }
  ): MetricComparison[] {
    const metrics: MetricComparison[] = [
      this.compareMetric(
        'Avg User Rounds',
        'Avg User Rounds',
        baseline.avgUserRounds,
        evolved.avgUserRounds,
        true,  // Lower is better
        'Number of user conversation rounds to reach goal'
      ),
      this.compareMetric(
        'Avg Tool Calls',
        'Avg Tool Calls',
        baseline.avgToolCalls,
        evolved.avgToolCalls,
        true,  // Lower is better
        'Number of tool calls to complete same task'
      ),
      this.compareMetric(
        'Total Tokens',
        'Total Tokens',
        baseline.totalTokenInput + baseline.totalTokenOutput,
        evolved.totalTokenInput + evolved.totalTokenOutput,
        true,  // Lower is better
        'Token consumption (Input + Output)'
      ),
      this.compareMetric(
        'Context Load',
        'Context Load',
        baseline.avgContextLoad,
        evolved.avgContextLoad,
        false,  // Higher is not necessarily better, but acceptable for workspace context
        'Context window usage from environment injection'
      )
    ];

    // Add security metrics if provided
    if (securityMetrics) {
      metrics.push(
        this.compareMetric(
          'Security Issues',
          'Security Issues',
          securityMetrics.baseline.totalIssues,
          securityMetrics.evolved.totalIssues,
          true,  // Lower is better (fewer security issues is good)
          'Total number of security issues detected'
        )
      );
      metrics.push(
        this.compareMetric(
          'High Severity Issues',
          'High Severity Issues',
          securityMetrics.baseline.highSeverity,
          securityMetrics.evolved.highSeverity,
          true,  // Lower is better
          'Number of high severity security issues'
        )
      );
      metrics.push(
        this.compareMetric(
          'Security Risk Score',
          'Security Risk Score',
          securityMetrics.baseline.riskScore,
          securityMetrics.evolved.riskScore,
          true,  // Lower is better (lower risk score is good)
          'Overall security risk score (0-100)'
        )
      );
    }

    return metrics;
  }

  /**
   * Compare a single metric
   */
  private compareMetric(
    name: string,
    englishName: string,
    baseline: number,
    evolved: number,
    lowerIsBetter: boolean,
    description: string
  ): MetricComparison {
    const delta = baseline === 0
      ? (evolved === 0 ? 0 : 100)
      : ((evolved - baseline) / baseline) * 100;

    const deltaType = delta > 0.01 ? 'increase' : delta < -0.01 ? 'decrease' : 'unchanged';

    let status: 'good' | 'bad' | 'neutral';
    if (deltaType === 'unchanged') {
      status = 'neutral';
    } else if (lowerIsBetter) {
      status = delta < 0 ? 'good' : 'bad';
    } else {
      // For metrics where increase might be acceptable (like context load)
      // We mark small increases as neutral
      if (Math.abs(delta) < 20) {
        status = 'neutral';
      } else {
        status = delta > 0 ? 'bad' : 'good';
      }
    }

    return {
      name,
      baseline,
      evolved,
      delta: Math.round(delta * 10) / 10,
      deltaType,
      status,
      description
    };
  }

  /**
   * Determine overall status
   */
  private determineOverallStatus(metrics: MetricComparison[]): 'improved' | 'degraded' | 'neutral' {
    const goodCount = metrics.filter(m => m.status === 'good').length;
    const badCount = metrics.filter(m => m.status === 'bad').length;

    if (goodCount > badCount) {
      return 'improved';
    } else if (badCount > goodCount) {
      return 'degraded';
    }
    return 'neutral';
  }

  /**
   * Generate conclusion text
   */
  private generateConclusion(metrics: MetricComparison[], status: 'improved' | 'degraded' | 'neutral'): string {
    const statusEmoji = status === 'improved' ? '✅' : status === 'degraded' ? '❌' : '➖';

    const improvements = metrics.filter(m => m.status === 'good');
    const degradations = metrics.filter(m => m.status === 'bad');

    let conclusion = `${statusEmoji} **Evolution Result:** `;

    if (status === 'improved') {
      conclusion += `Skill evolved successfully! Key improvements:\n`;
      for (const m of improvements) {
        conclusion += `- ${m.name} reduced by ${Math.abs(m.delta)}%\n`;
      }
    } else if (status === 'degraded') {
      conclusion += `Skill evolution has issues. Attention needed:\n`;
      for (const m of degradations) {
        conclusion += `- ${m.name} increased by ${m.delta}%\n`;
      }
    } else {
      conclusion += `Evolution neutral. Continue monitoring or adjust strategy.`;
    }

    return conclusion;
  }

  /**
   * Format delta with sign and percentage
   */
  formatDelta(delta: number): string {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta}%`;
  }
}

// Singleton instance
export const evaluator = new Evaluator();
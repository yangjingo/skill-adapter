/**
 * Evaluator - Evolution effect evaluation
 *
 * Compares metrics before and after evolution, calculates delta percentages, generates conclusions
 */

import { MetricsSummary } from './telemetry';

export interface EvaluationResult {
  skillName: string;
  baselineVersion: string;
  evolvedVersion: string;
  metrics: MetricComparison[];
  overallStatus: 'improved' | 'degraded' | 'neutral';
  conclusion: string;
  timestamp: Date;
}

export interface MetricComparison {
  name: string;
  baseline: number;
  evolved: number;
  delta: number;  // Percentage change
  deltaType: 'increase' | 'decrease' | 'unchanged';
  status: 'good' | 'bad' | 'neutral';
  description: string;
}

export class Evaluator {
  /**
   * Evaluate evolution by comparing two sets of metrics
   */
  evaluate(
    skillName: string,
    baselineVersion: string,
    evolvedVersion: string,
    baselineMetrics: MetricsSummary,
    evolvedMetrics: MetricsSummary
  ): EvaluationResult {
    const metrics = this.compareMetrics(baselineMetrics, evolvedMetrics);
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
   * Compare metrics and calculate deltas
   */
  private compareMetrics(baseline: MetricsSummary, evolved: MetricsSummary): MetricComparison[] {
    return [
      this.compareMetric(
        '平均对话轮数',
        'Avg User Rounds',
        baseline.avgUserRounds,
        evolved.avgUserRounds,
        true,  // Lower is better
        '达到目标所需的用户对话轮数'
      ),
      this.compareMetric(
        '工具调用次数',
        'Avg Tool Calls',
        baseline.avgToolCalls,
        evolved.avgToolCalls,
        true,  // Lower is better
        '完成相同任务所需的工具调用次数'
      ),
      this.compareMetric(
        'Token 消耗',
        'Total Tokens',
        baseline.totalTokenInput + baseline.totalTokenOutput,
        evolved.totalTokenInput + evolved.totalTokenOutput,
        true,  // Lower is better
        'Token 消耗（Input + Output）'
      ),
      this.compareMetric(
        '上下文占用',
        'Context Load',
        baseline.avgContextLoad,
        evolved.avgContextLoad,
        false,  // Higher is not necessarily better, but acceptable for workspace context
        '环境注入对 Context Window 的占用'
      )
    ];
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

    let conclusion = `${statusEmoji} **进化结论：** `;

    if (status === 'improved') {
      conclusion += `Skill 进化成功！主要改进：\n`;
      for (const m of improvements) {
        conclusion += `- ${m.name} 减少 ${Math.abs(m.delta)}%\n`;
      }
    } else if (status === 'degraded') {
      conclusion += `Skill 进化存在问题。需要关注：\n`;
      for (const m of degradations) {
        conclusion += `- ${m.name} 增加 ${m.delta}%\n`;
      }
    } else {
      conclusion += `进化效果持平，建议继续观察或调整策略。`;
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
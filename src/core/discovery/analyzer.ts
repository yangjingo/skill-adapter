/**
 * Skill Analyzer - Extracts insights from remote skills
 *
 * Analyzes skill content to extract best practices, patterns, and improvements
 */

import {
  RemoteSkill,
  SkillInsight,
  SkillPattern,
  ImprovementSuggestion,
  InsightExtractionOptions
} from '../../types/discovery';
import { PlatformFetcher, platformFetcher } from './fetcher';

/**
 * Common pattern types to extract
 */
const PATTERN_TYPES = {
  instruction: [
    /(?:always|never|must|should|avoid|ensure)\s+/gi,
    /(?:when|if|before|after)\s+(?:you|the|a)\s+/gi,
    /(?:use|using|using\s+the)\s+/gi
  ],
  constraint: [
    /(?:do\s+not|don't|never|avoid)\s+/gi,
    /(?:limited\s+to|restricted\s+to|only)\s+/gi,
    /(?:must\s+not|cannot|can't)\s+/gi
  ],
  workflow: [
    /(?:step\s+\d+|first|then|next|finally)/gi,
    /(?:start\s+by|begin\s+with|end\s+with)/gi,
    /(?:follow\s+these\s+steps)/gi
  ],
  'error-handling': [
    /(?:if\s+.+\s+fails|on\s+error|catch|handle\s+error)/gi,
    /(?:fallback|retry|alternative)/gi,
    /(?:gracefully|safely)\s+handle/gi
  ],
  'tool-usage': [
    /(?:use\s+the\s+\w+\s+tool)/gi,
    /(?:call|invoke|execute)\s+\w+/gi,
    /(?:via|through|using)\s+(?:the\s+)?\w+\s+(?:tool|api)/gi
  ]
};

/**
 * Best practice keywords
 */
const BEST_PRACTICE_KEYWORDS = [
  'always verify',
  'check before',
  'validate input',
  'handle errors',
  'provide context',
  'explain reasoning',
  'ask for clarification',
  'follow conventions',
  'maintain consistency',
  'optimize for',
  'security best',
  'user experience',
  'clean code',
  'test thoroughly'
];

/**
 * SkillAnalyzer class
 */
export class SkillAnalyzer {
  private fetcher: PlatformFetcher;

  constructor() {
    this.fetcher = platformFetcher;
  }

  /**
   * Extract insights from a remote skill
   */
  async extractInsights(
    skill: RemoteSkill,
    options: InsightExtractionOptions = {}
  ): Promise<SkillInsight> {
    const content = await this.fetcher.fetchSkillContent(skill);

    const bestPractices = options.extractBestPractices !== false
      ? this.extractBestPractices(content, options.maxBestPractices || 10)
      : [];

    const patterns = options.extractPatterns !== false
      ? this.extractPatterns(content, options)
      : [];

    const improvements = this.generateImprovements(patterns, bestPractices);

    return {
      id: `insight_${skill.name}_${Date.now()}`,
      skillName: skill.name,
      source: skill,
      extractedAt: new Date(),
      bestPractices,
      patterns,
      improvements,
      applicableTo: this.determineApplicability(patterns),
      riskLevel: this.assessRiskLevel(content)
    };
  }

  /**
   * Extract best practices from content
   */
  extractBestPractices(content: string, maxItems: number = 10): string[] {
    const practices: string[] = [];
    const lines = content.split('\n');

    for (const keyword of BEST_PRACTICE_KEYWORDS) {
      const regex = new RegExp(`(.{0,100}${keyword}.{0,100})`, 'gi');
      const matches = content.match(regex);
      if (matches) {
        for (const match of matches) {
          const cleaned = match.trim().replace(/^\s*[-*•]\s*/, '');
          if (cleaned.length > 20 && cleaned.length < 200) {
            practices.push(cleaned);
          }
        }
      }
    }

    // Also look for bullet points that might be best practices
    for (const line of lines) {
      if (/^[-*•]\s+/.test(line) && line.length > 20 && line.length < 200) {
        const cleaned = line.replace(/^[-*•]\s+/, '');
        if (!practices.includes(cleaned) && this.isLikelyBestPractice(cleaned)) {
          practices.push(cleaned);
        }
      }
    }

    // Remove duplicates and limit
    return [...new Set(practices)].slice(0, maxItems);
  }

  /**
   * Extract patterns from content
   */
  extractPatterns(
    content: string,
    options: InsightExtractionOptions = {}
  ): SkillPattern[] {
    const patterns: SkillPattern[] = [];
    const focusAreas = options.focusAreas || ['instruction', 'constraint', 'workflow', 'error-handling', 'tool-usage'];

    for (const type of focusAreas) {
      const typePatterns = this.extractPatternsByType(content, type as SkillPattern['type']);
      patterns.push(...typePatterns.slice(0, options.maxPatterns || 5));
    }

    return patterns;
  }

  /**
   * Extract patterns by type
   */
  private extractPatternsByType(content: string, type: SkillPattern['type']): SkillPattern[] {
    const patterns: SkillPattern[] = [];
    const regexes = PATTERN_TYPES[type] || [];

    for (const regex of regexes) {
      const matches = content.matchAll(regex);
      const examples: string[] = [];

      for (const match of matches) {
        const context = this.getContext(content, match.index || 0, 50);
        if (context && !examples.includes(context)) {
          examples.push(context);
        }
        if (examples.length >= 3) break;
      }

      if (examples.length > 0) {
        patterns.push({
          name: `${type} pattern`,
          description: `Detected ${type} pattern in skill content`,
          type,
          examples,
          applicability: this.determinePatternApplicability(type)
        });
      }
    }

    return patterns;
  }

  /**
   * Generate improvement suggestions
   */
  generateImprovements(
    patterns: SkillPattern[],
    bestPractices: string[]
  ): ImprovementSuggestion[] {
    const improvements: ImprovementSuggestion[] = [];

    // Generate suggestions based on patterns
    for (const pattern of patterns) {
      if (pattern.type === 'error-handling' && pattern.examples.length > 0) {
        improvements.push({
          id: `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          category: 'safety',
          priority: 'high',
          description: 'Add error handling pattern detected from remote skill',
          implementation: `Consider adding similar error handling:\n${pattern.examples[0]}`,
          expectedBenefit: 'Improved robustness and error recovery',
          relatedPatterns: [pattern.name]
        });
      }

      if (pattern.type === 'workflow' && pattern.examples.length > 0) {
        improvements.push({
          id: `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          category: 'clarity',
          priority: 'medium',
          description: 'Adopt workflow pattern from popular skill',
          implementation: `Structure your skill with similar workflow:\n${pattern.examples[0]}`,
          expectedBenefit: 'Clearer process flow for users',
          relatedPatterns: [pattern.name]
        });
      }
    }

    // Generate suggestions based on best practices
    for (const practice of bestPractices.slice(0, 3)) {
      improvements.push({
        id: `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        category: 'user-experience',
        priority: 'medium',
        description: 'Adopt best practice from popular skill',
        implementation: practice,
        expectedBenefit: 'Improved user experience and reliability',
        relatedPatterns: []
      });
    }

    return improvements.slice(0, 10);
  }

  /**
   * Check if text is likely a best practice
   */
  private isLikelyBestPractice(text: string): boolean {
    const indicators = [
      /^(always|never|avoid|ensure|make sure|remember)/i,
      /should|must|recommend|best/i,
      /improve|optimize|enhance|better/i,
      /security|safety|reliable/i
    ];

    return indicators.some(regex => regex.test(text));
  }

  /**
   * Get context around a position
   */
  private getContext(content: string, position: number, radius: number): string {
    const start = Math.max(0, position - radius);
    const end = Math.min(content.length, position + radius);
    return content.substring(start, end).trim();
  }

  /**
   * Determine pattern applicability
   */
  private determinePatternApplicability(type: SkillPattern['type']): string {
    const applicabilityMap = {
      'instruction': 'All skills that provide guidance to agents',
      'constraint': 'Skills that need to limit or control behavior',
      'workflow': 'Skills with multi-step processes',
      'error-handling': 'Skills that interact with external systems',
      'tool-usage': 'Skills that utilize tools or APIs'
    };
    return applicabilityMap[type] || 'General applicability';
  }

  /**
   * Determine applicability for local skills
   */
  private determineApplicability(patterns: SkillPattern[]): string[] {
    const applicable: string[] = [];

    for (const pattern of patterns) {
      switch (pattern.type) {
        case 'instruction':
          applicable.push('code-generation', 'documentation', 'general-assistant');
          break;
        case 'constraint':
          applicable.push('file-operations', 'system-commands', 'api-calls');
          break;
        case 'workflow':
          applicable.push('project-management', 'task-automation', 'multi-step-tasks');
          break;
        case 'error-handling':
          applicable.push('api-integration', 'file-processing', 'network-operations');
          break;
        case 'tool-usage':
          applicable.push('tool-dependent', 'api-integration', 'automation');
          break;
      }
    }

    return [...new Set(applicable)];
  }

  /**
   * Assess risk level of skill content
   */
  private assessRiskLevel(content: string): 'low' | 'medium' | 'high' {
    // Check for dangerous patterns
    const highRiskPatterns = [
      /rm\s+-rf/gi,
      /eval\s*\(/gi,
      /exec\s*\(/gi,
      /password\s*=/gi,
      /api[_-]?key\s*=/gi
    ];

    const mediumRiskPatterns = [
      /fetch\s*\(/gi,
      /http\.request/gi,
      /subprocess/gi
    ];

    let riskScore = 0;

    for (const pattern of highRiskPatterns) {
      const matches = content.match(pattern);
      if (matches) riskScore += matches.length * 30;
    }

    for (const pattern of mediumRiskPatterns) {
      const matches = content.match(pattern);
      if (matches) riskScore += matches.length * 10;
    }

    if (riskScore >= 60) return 'high';
    if (riskScore >= 30) return 'medium';
    return 'low';
  }
}

// Singleton instance
export const skillAnalyzer = new SkillAnalyzer();
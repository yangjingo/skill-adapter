/**
 * Analyzer - Session semantic analysis
 *
 * Analyzes user correction behaviors, extracts intent, identifies ineffective patterns
 */

export interface SessionLog {
  id: string;
  timestamp: Date;
  userMessage: string;
  assistantResponse: string;
  toolCalls: ToolCallRecord[];
  corrections: CorrectionRecord[];
}

export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  success: boolean;
}

export interface CorrectionRecord {
  originalAction: string;
  correctedAction: string;
  userFeedback: string;
  timestamp: Date;
}

export interface AnalysisResult {
  patterns: BehaviorPattern[];
  suggestions: ImprovementSuggestion[];
  intentSummary: string;
}

export interface BehaviorPattern {
  type: 'inefficient' | 'error_prone' | 'suboptimal';
  description: string;
  frequency: number;
  examples: string[];
}

export interface ImprovementSuggestion {
  priority: 'high' | 'medium' | 'low';
  area: string;
  suggestion: string;
  reasoning: string;
}

export class SessionAnalyzer {
  private sessions: SessionLog[] = [];

  /**
   * Add a session log for analysis
   */
  addSession(session: SessionLog): void {
    this.sessions.push(session);
  }

  /**
   * Analyze all sessions and extract insights
   */
  analyze(): AnalysisResult {
    const patterns = this.identifyPatterns();
    const suggestions = this.generateSuggestions(patterns);
    const intentSummary = this.summarizeIntent();

    return {
      patterns,
      suggestions,
      intentSummary
    };
  }

  /**
   * Identify behavior patterns from sessions
   */
  private identifyPatterns(): BehaviorPattern[] {
    const patterns: BehaviorPattern[] = [];
    const toolFailureCounts = new Map<string, number>();
    const correctionCounts = new Map<string, number>();

    // Analyze tool failures
    for (const session of this.sessions) {
      for (const toolCall of session.toolCalls) {
        if (!toolCall.success) {
          const key = toolCall.tool;
          toolFailureCounts.set(key, (toolFailureCounts.get(key) || 0) + 1);
        }
      }

      // Count correction types
      for (const correction of session.corrections) {
        const key = correction.originalAction;
        correctionCounts.set(key, (correctionCounts.get(key) || 0) + 1);
      }
    }

    // Convert to patterns
    for (const [tool, count] of toolFailureCounts) {
      if (count >= 2) {
        patterns.push({
          type: 'error_prone',
          description: `Tool '${tool}' fails frequently`,
          frequency: count,
          examples: this.getFailureExamples(tool)
        });
      }
    }

    for (const [action, count] of correctionCounts) {
      if (count >= 2) {
        patterns.push({
          type: 'inefficient',
          description: `Action '${action}' requires frequent correction`,
          frequency: count,
          examples: this.getCorrectionExamples(action)
        });
      }
    }

    return patterns;
  }

  /**
   * Get examples of tool failures
   */
  private getFailureExamples(tool: string): string[] {
    const examples: string[] = [];
    for (const session of this.sessions) {
      for (const toolCall of session.toolCalls) {
        if (toolCall.tool === tool && !toolCall.success) {
          examples.push(JSON.stringify(toolCall.input));
          if (examples.length >= 3) break;
        }
      }
    }
    return examples;
  }

  /**
   * Get examples of corrections
   */
  private getCorrectionExamples(action: string): string[] {
    const examples: string[] = [];
    for (const session of this.sessions) {
      for (const correction of session.corrections) {
        if (correction.originalAction === action) {
          examples.push(`${correction.originalAction} -> ${correction.correctedAction}`);
          if (examples.length >= 3) break;
        }
      }
    }
    return examples;
  }

  /**
   * Generate improvement suggestions based on patterns
   */
  private generateSuggestions(patterns: BehaviorPattern[]): ImprovementSuggestion[] {
    const suggestions: ImprovementSuggestion[] = [];

    for (const pattern of patterns) {
      if (pattern.type === 'error_prone') {
        suggestions.push({
          priority: 'high',
          area: 'tool_usage',
          suggestion: `Add error handling guidance for ${pattern.description}`,
          reasoning: `This pattern occurred ${pattern.frequency} times`
        });
      } else if (pattern.type === 'inefficient') {
        suggestions.push({
          priority: 'medium',
          area: 'workflow',
          suggestion: `Optimize the workflow for ${pattern.description}`,
          reasoning: `Users frequently correct this behavior`
        });
      }
    }

    return suggestions;
  }

  /**
   * Summarize user intent from sessions
   */
  private summarizeIntent(): string {
    const intents: string[] = [];

    for (const session of this.sessions) {
      // Extract key verbs and nouns from user messages
      const verbs = this.extractKeyVerbs(session.userMessage);
      intents.push(...verbs);
    }

    // Return most common intents
    const intentCounts = new Map<string, number>();
    for (const intent of intents) {
      intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
    }

    const sortedIntents = Array.from(intentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([intent]) => intent);

    return sortedIntents.length > 0
      ? `Primary intents: ${sortedIntents.join(', ')}`
      : 'No clear intent pattern detected';
  }

  /**
   * Extract key verbs from a message
   */
  private extractKeyVerbs(message: string): string[] {
    const actionVerbs = [
      'create', 'fix', 'update', 'delete', 'refactor',
      'implement', 'add', 'remove', 'optimize', 'test'
    ];

    const lowerMessage = message.toLowerCase();
    return actionVerbs.filter(verb => lowerMessage.includes(verb));
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions = [];
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.length;
  }
}
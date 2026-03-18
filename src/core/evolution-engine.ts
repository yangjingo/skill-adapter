/**
 * Evolution Engine - Context building and rule-based recommendations
 *
 * Builds evolution context from:
 * - Session data (tool sequences, errors, patterns)
 * - Memory files (error avoidance, best practices)
 * - SOUL/AGENTS (behavior style, boundaries)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeExtractor, ClaudeCodePattern } from './session/claude-code-extractor';
import { OpenClawExtractor } from './session/openclaw-extractor';
import { Pattern } from './session/types';

// Type aliases for clarity
type Priority = 'high' | 'medium' | 'low';
type Category = 'error_avoidance' | 'best_practice' | 'project_knowledge' | 'style';

export interface MemoryRule {
  id: string;
  source: 'claude_code' | 'openclaw';
  category: Category;
  rule: string;
  context?: string;
  createdAt: Date;
  usage?: number;
}

export interface BehaviorStyle {
  communicationStyle: 'direct' | 'polite' | 'technical' | 'casual';
  boundaries: string[];
  preferences: string[];
  avoidPatterns: string[];
  source: 'openclaw' | 'claude_code';
}

export interface EvolutionRecommendation {
  id: string;
  type: 'pattern_adoption' | 'error_avoidance' | 'style_injection' | 'best_practice';
  source: 'session' | 'memory' | 'soul' | 'agents' | 'cross_skill';
  sourceDetail: string;
  priority: Priority;
  title: string;
  description: string;
  codeSnippet?: string;
  confidence: number;
  appliesTo: string[];
}

export interface EvolutionContext {
  sessionPatterns: SessionPatternAnalysis;
  memoryRules: MemoryRule[];
  behaviorStyle: BehaviorStyle;
  crossSkillPatterns: CrossSkillPattern[];
}

// Internal types
interface SessionPatternAnalysis {
  toolSequences: ToolSequence[];
  errorPatterns: ErrorPattern[];
  successPatterns: SuccessPattern[];
  userIntents: UserIntent[];
  summary: { totalSessions: number; avgToolCalls: number; errorRate: number; topTools: string[] };
}

interface ToolSequence { tools: string[]; frequency: number; success: boolean; context: string; examples: string[]; }
interface ErrorPattern { errorType: string; errorMessage: string; recovery?: string; frequency: number; contexts: string[]; }
interface SuccessPattern { name: string; description: string; toolSequence: string[]; frequency: number; userSatisfaction?: number; }
interface UserIntent { intent: string; keywords: string[]; toolsUsed: string[]; frequency: number; }
interface CrossSkillPattern { sourceSkill: string; pattern: string; successMetric: number; applicableTo: string[]; }

export class EvolutionEngine {
  private claudeCodeExtractor: ClaudeCodeExtractor;
  private openClawExtractor: OpenClawExtractor;
  private readonly OPENCLAW_WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
  private readonly CLAUDE_MEMORY_PATH = path.join(os.homedir(), '.claude');

  constructor() {
    this.claudeCodeExtractor = new ClaudeCodeExtractor();
    this.openClawExtractor = new OpenClawExtractor();
  }

  async buildEvolutionContext(skillName: string, days = 7): Promise<EvolutionContext> {
    const [sessionPatterns, memoryRules, behaviorStyle, crossSkillPatterns] = await Promise.all([
      this.analyzeSessions(skillName, days),
      this.extractMemoryRules(),
      this.extractBehaviorStyle(),
      this.extractCrossSkillPatterns(skillName),
    ]);
    return { sessionPatterns, memoryRules, behaviorStyle, crossSkillPatterns };
  }

  private async analyzeSessions(skillName: string, days: number): Promise<SessionPatternAnalysis> {
    const [claudeCodeSessions, openClawSessions] = await Promise.all([
      this.extractClaudeCodeSessions(skillName, days),
      this.extractOpenClawSessions(skillName, days),
    ]);
    const allPatterns = [...claudeCodeSessions, ...openClawSessions];
    return {
      toolSequences: this.findToolSequences(allPatterns),
      errorPatterns: this.findErrorPatterns(allPatterns),
      successPatterns: this.findSuccessPatterns(allPatterns),
      userIntents: this.findUserIntents(allPatterns),
      summary: this.calculateSummary(allPatterns),
    };
  }

  private async extractClaudeCodeSessions(skillName: string, days: number): Promise<ClaudeCodePattern[]> {
    try {
      const sessionFiles = await this.claudeCodeExtractor.findSessionFiles(days);
      const relevantSessions: ClaudeCodePattern[] = [];
      for (const file of sessionFiles.slice(0, 10)) {
        const session = await this.claudeCodeExtractor.extractSession(file.path);
        const skillRelated = session.metadata.skillNames.includes(skillName) ||
          session.userMessages.some(m => m.content.toLowerCase().includes(skillName.toLowerCase()));
        if (skillRelated) {
          const patterns = await this.claudeCodeExtractor.summarizePatterns([session]);
          relevantSessions.push(...patterns);
        }
      }
      return relevantSessions;
    } catch { return []; }
  }

  private async extractOpenClawSessions(skillName: string, days: number): Promise<Pattern[]> {
    try {
      const sessionFiles = await this.openClawExtractor.findSessionFiles(days);
      const relevantSessions: Pattern[] = [];
      for (const file of sessionFiles.slice(0, 10)) {
        const session = await this.openClawExtractor.extractSession(file);
        if (session.skillsUsed.includes(skillName)) {
          relevantSessions.push(...this.openClawExtractor.summarizePatterns([session]));
        }
      }
      return relevantSessions;
    } catch { return []; }
  }

  private findToolSequences(patterns: (ClaudeCodePattern | Pattern)[]): ToolSequence[] {
    const sequences = new Map<string, ToolSequence>();
    for (const pattern of patterns) {
      if (String(pattern.type) === 'tool_sequence') {
        const key = pattern.description;
        const existing = sequences.get(key);
        if (existing) existing.frequency++;
        else sequences.set(key, {
          tools: [],
          frequency: pattern.frequency,
          success: true,
          context: pattern.description,
          examples: pattern.examples?.map((e: { context: string }) => e.context || '').slice(0, 3) || [],
        });
      }
    }
    return Array.from(sequences.values()).sort((a, b) => b.frequency - a.frequency).slice(0, 10);
  }

  private findErrorPatterns(patterns: (ClaudeCodePattern | Pattern)[]): ErrorPattern[] {
    const errors = new Map<string, ErrorPattern>();
    for (const pattern of patterns) {
      if (pattern.type === 'error_pattern' || pattern.type === 'error_recovery') {
        if (!errors.has(pattern.description)) {
          errors.set(pattern.description, {
            errorType: 'unknown',
            errorMessage: pattern.description,
            frequency: pattern.frequency,
            contexts: pattern.examples?.map(e => e.context || '').slice(0, 3) || [],
          });
        }
      }
    }
    return Array.from(errors.values());
  }

  private findSuccessPatterns(patterns: (ClaudeCodePattern | Pattern)[]): SuccessPattern[] {
    return patterns
      .filter(p => p.type === 'success_pattern' || p.type === 'workflow_pattern')
      .map(p => ({ name: p.description.slice(0, 50), description: p.description, toolSequence: [], frequency: p.frequency }))
      .slice(0, 10);
  }

  private findUserIntents(patterns: (ClaudeCodePattern | Pattern)[]): UserIntent[] {
    return patterns
      .filter(p => p.type === 'user_intent' || p.type === 'content_pattern')
      .map(p => ({ intent: p.description, keywords: [], toolsUsed: [], frequency: p.frequency }))
      .slice(0, 10);
  }

  private calculateSummary(patterns: (ClaudeCodePattern | Pattern)[]): SessionPatternAnalysis['summary'] {
    return {
      totalSessions: patterns.length,
      avgToolCalls: 0,
      errorRate: patterns.filter(p => p.type === 'error_pattern' || p.type === 'error_recovery').length / Math.max(patterns.length, 1),
      topTools: [],
    };
  }

  private async extractMemoryRules(): Promise<MemoryRule[]> {
    const rules: MemoryRule[] = [];

    // OpenClaw MEMORY.md
    const openClawMemoryPath = path.join(this.OPENCLAW_WORKSPACE, 'MEMORY.md');
    if (fs.existsSync(openClawMemoryPath)) {
      rules.push(...this.parseMemoryFile(fs.readFileSync(openClawMemoryPath, 'utf-8'), 'openclaw'));
    }

    // Claude Code project MEMORY.md
    const claudeMemoryPath = path.join(this.CLAUDE_MEMORY_PATH, 'projects', this.getProjectHash(process.cwd()), 'memory', 'MEMORY.md');
    if (fs.existsSync(claudeMemoryPath)) {
      rules.push(...this.parseMemoryFile(fs.readFileSync(claudeMemoryPath, 'utf-8'), 'claude_code'));
    }

    return rules;
  }

  private parseMemoryFile(content: string, source: 'openclaw' | 'claude_code'): MemoryRule[] {
    const rules: MemoryRule[] = [];
    let currentCategory: Category = 'best_practice';
    let inRelevantSection = true;
    let ruleId = 0;

    const skipSectionPatterns = [/邮件|Email|收件人|主题|署名|审核人|状态/i, /Daily|日志|Log/i, /Template|模板/i, /Example|示例/i];
    const ruleIndicators = [/必须|禁止|严禁|不要|应该|遵循|原则|记忆|Memory/i, /Avoid|Never|Always|Must|Should|Don't/i, /原子化|验证|闭环|秒回|按需/i];

    for (const line of content.split('\n')) {
      if (line.startsWith('## ') || line.startsWith('### ')) {
        inRelevantSection = !skipSectionPatterns.some(p => p.test(line));
        if (/错误规避|Error Avoidance|Avoid/i.test(line)) { currentCategory = 'error_avoidance'; inRelevantSection = true; }
        else if (/最佳实践|Best Practice/i.test(line)) { currentCategory = 'best_practice'; inRelevantSection = true; }
        else if (/风格|Style/i.test(line)) { currentCategory = 'style'; inRelevantSection = true; }
      }

      if (!inRelevantSection) continue;

      const listMatch = line.match(/^[-*]\s+(.+)$/);
      const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
      const ruleText = listMatch?.[1] || numberedMatch?.[1];

      if (ruleText) {
        const isLikelyRule = ruleText.length > 15 && ruleText.length < 500 && ruleIndicators.some(p => p.test(ruleText));
        const isEmailContent = /^\*\*[^*]+\*\*:/.test(ruleText) && /收件人|主题|署名|审核人|状态/.test(ruleText);
        if (isLikelyRule && !isEmailContent) {
          rules.push({ id: `${source}-${ruleId++}`, source, category: currentCategory, rule: ruleText, createdAt: new Date() });
        }
      }
    }
    return rules;
  }

  private async extractBehaviorStyle(): Promise<BehaviorStyle> {
    const style: BehaviorStyle = {
      communicationStyle: 'direct',
      boundaries: [],
      preferences: [],
      avoidPatterns: [],
      source: 'openclaw',
    };

    const soulPath = path.join(this.OPENCLAW_WORKSPACE, 'SOUL.md');
    if (fs.existsSync(soulPath)) {
      const content = fs.readFileSync(soulPath, 'utf-8');
      const boundaryMatch = content.match(/## Boundaries\s+([\s\S]*?)(?=##|$)/);
      if (boundaryMatch) {
        style.boundaries = boundaryMatch[1].split('\n').filter(l => l.startsWith('-')).map(l => l.slice(1).trim());
      }
      if (content.includes('毒舌') || content.includes('direct') || content.includes('直')) {
        style.communicationStyle = 'direct';
      } else if (content.includes('polite') || content.includes('客气')) {
        style.communicationStyle = 'polite';
      }
    }

    const agentsPath = path.join(this.OPENCLAW_WORKSPACE, 'AGENTS.md');
    if (fs.existsSync(agentsPath)) {
      const content = fs.readFileSync(agentsPath, 'utf-8');
      const avoidMatch = content.match(/(?:Stay silent|Don't|Avoid)[\s\S]*?(?=\*\*|##|$)/gi);
      if (avoidMatch) {
        style.avoidPatterns = avoidMatch.flatMap(m => m.split('\n').filter(l => l.startsWith('-'))).map(l => l.replace(/^[-*]\s*/, '').trim());
      }
    }

    return style;
  }

  private async extractCrossSkillPatterns(_skillName: string): Promise<CrossSkillPattern[]> {
    return []; // Future: analyze other skills for transferable patterns
  }

  generateRecommendations(context: EvolutionContext): EvolutionRecommendation[] {
    const recommendations: EvolutionRecommendation[] = [];
    let recId = 0;

    // From memory rules
    for (const rule of context.memoryRules) {
      if (rule.category === 'error_avoidance') {
        recommendations.push({
          id: `rec-${recId++}`, type: 'error_avoidance', source: 'memory',
          sourceDetail: `${rule.source}: ${rule.rule.slice(0, 30)}...`, priority: 'high',
          title: `Error Avoidance: ${rule.rule.slice(0, 50)}`, description: rule.rule, confidence: 0.9, appliesTo: [],
        });
      } else if (rule.category === 'best_practice') {
        recommendations.push({
          id: `rec-${recId++}`, type: 'best_practice', source: 'memory',
          sourceDetail: `${rule.source}: ${rule.rule.slice(0, 30)}...`, priority: 'medium',
          title: `Best Practice: ${rule.rule.slice(0, 50)}`, description: rule.rule, confidence: 0.8, appliesTo: [],
        });
      }
    }

    // From behavior style
    if (context.behaviorStyle.communicationStyle === 'direct') {
      recommendations.push({
        id: `rec-${recId++}`, type: 'style_injection', source: 'soul',
        sourceDetail: 'SOUL.md', priority: 'medium',
        title: 'Inject Direct Communication Style',
        description: 'Be direct and concise, avoid pleasantries. Focus on solving problems efficiently.',
        confidence: 0.85, appliesTo: [],
      });
    }

    // From session patterns
    for (const sequence of context.sessionPatterns.toolSequences.slice(0, 5)) {
      if (sequence.frequency >= 2) {
        recommendations.push({
          id: `rec-${recId++}`, type: 'pattern_adoption', source: 'session',
          sourceDetail: `Found ${sequence.frequency} times`,
          priority: sequence.frequency >= 5 ? 'high' : 'medium',
          title: `Tool Sequence: ${sequence.context.slice(0, 50)}`,
          description: `Common sequence: ${sequence.tools.join(' → ')}`,
          confidence: Math.min(0.5 + sequence.frequency * 0.1, 0.95), appliesTo: [],
        });
      }
    }

    // From error patterns
    for (const error of context.sessionPatterns.errorPatterns) {
      recommendations.push({
        id: `rec-${recId++}`, type: 'error_avoidance', source: 'session',
        sourceDetail: `Error: ${error.errorType}`, priority: 'high',
        title: `Avoid Error: ${error.errorMessage.slice(0, 50)}`, description: error.errorMessage,
        confidence: 0.85, appliesTo: [],
      });
    }

    // Sort by priority and confidence
    const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] !== priorityOrder[b.priority]
      ? priorityOrder[a.priority] - priorityOrder[b.priority]
      : b.confidence - a.confidence);

    return recommendations;
  }

  private getProjectHash(projectPath: string): string {
    return projectPath.replace(/[:\\\/]/g, '-').replace(/^-/, '').slice(0, 50);
  }
}

export const evolutionEngine = new EvolutionEngine();
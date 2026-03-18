/**
 * OpenClaw Session Extractor - Extracts and analyzes session data from OpenClaw
 *
 * Reads session files and extracts patterns for skill evolution
 * Handles streaming for large JSONL files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  OPENCLAW_PATHS,
  SessionsIndex,
  ExtractedSession,
  ExtractedMessage,
  ExtractedToolCall,
  ExtractedThinking,
  ExtractedError,
  Pattern,
  PatternType,
  PatternExample,
  ExtractionOptions,
  FilterOptions,
  SessionSummary,
  LoadedSkill,
} from './types';

/**
 * OpenClaw JSONL line types
 */
interface SessionLine {
  type: string;
  id?: string;
  timestamp?: string;
  cwd?: string;
  message?: MessageContent;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  error?: ErrorContent;
}

interface MessageContent {
  role: 'user' | 'assistant' | 'system';
  content?: MessagePart[];
}

interface MessagePart {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

interface ErrorContent {
  message?: string;
  type?: string;
  stack?: string;
}

/**
 * OpenClaw Session Extractor
 *
 * Extracts session data from OpenClaw's JSONL session files for analysis
 * and skill evolution purposes.
 */
export class OpenClawExtractor {
  private sessionsIndexPath: string;
  private sessionsDirPath: string;

  constructor(sessionsDir?: string) {
    this.sessionsDirPath = sessionsDir || OPENCLAW_PATHS.sessions;
    this.sessionsIndexPath = path.join(path.dirname(this.sessionsDirPath), 'sessions.json');
  }

  /**
   * Find session files within the last N days
   */
  async findSessionFiles(days: number): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const files: string[] = [];

    if (!fs.existsSync(this.sessionsDirPath)) {
      return files;
    }

    const entries = await fs.promises.readdir(this.sessionsDirPath);

    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;

      const filePath = path.join(this.sessionsDirPath, entry);
      const stats = await fs.promises.stat(filePath);

      if (stats.mtime >= cutoffDate) {
        files.push(filePath);
      }
    }

    // Sort by modification time (newest first)
    files.sort((a, b) => {
      const statA = fs.statSync(a);
      const statB = fs.statSync(b);
      return statB.mtime.getTime() - statA.mtime.getTime();
    });

    return files;
  }

  /**
   * Load the sessions index file
   */
  async loadSessionsIndex(): Promise<SessionsIndex> {
    const indexPath = this.sessionsIndexPath;

    if (!fs.existsSync(indexPath)) {
      return { sessions: [] };
    }

    const content = await fs.promises.readFile(indexPath, 'utf-8');

    try {
      return JSON.parse(content) as SessionsIndex;
    } catch {
      return { sessions: [] };
    }
  }

  /**
   * Extract session data from a JSONL file
   */
  async extractSession(filePath: string): Promise<ExtractedSession> {
    const sessionId = path.basename(filePath, '.jsonl');
    const messages: ExtractedMessage[] = [];
    const toolCalls: ExtractedToolCall[] = [];
    const thinkingBlocks: ExtractedThinking[] = [];
    const errors: ExtractedError[] = [];
    const skillsUsed: Set<string> = new Set();

    let sessionTimestamp = new Date();
    let sessionCwd = '';
    let sessionStartedAt: Date | null = null;
    let sessionEndedAt: Date | null = null;

    // Stream read the JSONL file
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;
    let currentContext = '';

    for await (const line of rl) {
      lineNumber++;
      if (!line.trim()) continue;

      try {
        const data: SessionLine = JSON.parse(line);

        switch (data.type) {
          case 'session':
            sessionTimestamp = data.timestamp ? new Date(data.timestamp) : new Date();
            sessionCwd = data.cwd || '';
            sessionStartedAt = sessionTimestamp;
            break;

          case 'message':
            await this.processMessage(
              data,
              messages,
              toolCalls,
              thinkingBlocks,
              skillsUsed
            );
            if (data.timestamp) {
              sessionEndedAt = new Date(data.timestamp);
            }
            break;

          case 'text':
            currentContext = data.text || '';
            break;

          case 'thinking':
            thinkingBlocks.push({
              content: data.thinking || '',
              timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
            });
            break;

          case 'toolCall':
            toolCalls.push({
              name: data.name || '',
              arguments: data.arguments || {},
              timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
              context: currentContext,
            });
            // Detect skill usage from tool calls
            if (data.name === 'skill' || data.name === 'Skill') {
              const skillName = (data.arguments as { name?: string })?.name;
              if (skillName) {
                skillsUsed.add(skillName);
              }
            }
            break;

          case 'error':
            errors.push({
              message: (data.error as ErrorContent)?.message || 'Unknown error',
              type: (data.error as ErrorContent)?.type || 'Error',
              timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
              stackTrace: (data.error as ErrorContent)?.stack,
              context: currentContext,
            });
            break;
        }
      } catch {
        // Skip malformed lines
        console.warn(`Skipping malformed line ${lineNumber} in ${filePath}`);
      }
    }

    // Calculate duration
    let duration: number | undefined;
    if (sessionStartedAt && sessionEndedAt) {
      duration = sessionEndedAt.getTime() - sessionStartedAt.getTime();
    }

    return {
      id: sessionId,
      timestamp: sessionTimestamp,
      cwd: sessionCwd,
      messages,
      toolCalls,
      thinkingBlocks,
      errors,
      skillsUsed: Array.from(skillsUsed),
      duration,
    };
  }

  /**
   * Process a message object
   */
  private async processMessage(
    data: SessionLine,
    messages: ExtractedMessage[],
    toolCalls: ExtractedToolCall[],
    thinkingBlocks: ExtractedThinking[],
    skillsUsed: Set<string>
  ): Promise<void> {
    if (!data.message) return;

    const msg = data.message;
    let contentText = '';
    const toolCallNames: string[] = [];

    if (msg.content && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        switch (part.type) {
          case 'text':
            contentText += part.text || '';
            break;

          case 'thinking':
            thinkingBlocks.push({
              content: part.thinking || '',
              timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
            });
            break;

          case 'toolCall':
            toolCalls.push({
              name: part.name || '',
              arguments: part.arguments || {},
              timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
            });
            toolCallNames.push(part.name || '');

            // Detect skill invocation
            if (part.name === 'skill' || part.name === 'Skill') {
              const skillName = (part.arguments as { name?: string })?.name;
              if (skillName) {
                skillsUsed.add(skillName);
              }
            }
            break;
        }
      }
    }

    messages.push({
      role: msg.role,
      content: contentText,
      timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
      toolCalls: toolCallNames.length > 0 ? toolCallNames : undefined,
    });
  }

  /**
   * Filter sessions by skill name
   */
  filterBySkill(sessions: ExtractedSession[], skillName: string): ExtractedSession[] {
    return sessions.filter(session => {
      // Check if skill was used in the session
      if (session.skillsUsed.includes(skillName)) {
        return true;
      }

      // Check tool calls for skill invocation
      for (const tc of session.toolCalls) {
        if (tc.name.toLowerCase().includes('skill') &&
            tc.arguments && typeof tc.arguments === 'object') {
          const args = tc.arguments as { name?: string };
          if (args.name === skillName) {
            return true;
          }
        }
      }

      // Check messages for skill references
      for (const msg of session.messages) {
        const content = msg.content.toLowerCase();
        if (content.includes(skillName.toLowerCase())) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Filter sessions by various criteria
   */
  filterSessions(sessions: ExtractedSession[], options: FilterOptions): ExtractedSession[] {
    return sessions.filter(session => {
      // Time range filter
      if (options.startTime && session.timestamp < options.startTime) {
        return false;
      }
      if (options.endTime && session.timestamp > options.endTime) {
        return false;
      }

      // Duration filters
      if (options.minDuration !== undefined && session.duration !== undefined) {
        if (session.duration < options.minDuration) return false;
      }
      if (options.maxDuration !== undefined && session.duration !== undefined) {
        if (session.duration > options.maxDuration) return false;
      }

      // Error filter
      if (options.hasErrors === true && session.errors.length === 0) {
        return false;
      }
      if (options.hasErrors === false && session.errors.length > 0) {
        return false;
      }

      // Skill filter
      if (options.skillName && !session.skillsUsed.includes(options.skillName)) {
        // Also check tool calls
        const hasSkillCall = session.toolCalls.some(tc =>
          tc.name.toLowerCase().includes('skill') &&
          (tc.arguments as { name?: string })?.name === options.skillName
        );
        if (!hasSkillCall) return false;
      }

      return true;
    });
  }

  /**
   * Summarize patterns from extracted sessions
   */
  summarizePatterns(sessions: ExtractedSession[]): Pattern[] {
    const patternsMap = new Map<string, Pattern>();

    // Analyze tool sequences
    this.analyzeToolSequences(sessions, patternsMap);

    // Analyze error patterns
    this.analyzeErrorPatterns(sessions, patternsMap);

    // Analyze skill usage
    this.analyzeSkillUsage(sessions, patternsMap);

    // Analyze success patterns
    this.analyzeSuccessPatterns(sessions, patternsMap);

    // Analyze workflow patterns
    this.analyzeWorkflowPatterns(sessions, patternsMap);

    // Convert map to array and sort by frequency
    const patterns = Array.from(patternsMap.values());
    const sortedPatterns = [...patterns].sort((a, b) => b.frequency - a.frequency);

    return sortedPatterns;
  }

  /**
   * Analyze tool call sequences
   */
  private analyzeToolSequences(
    sessions: ExtractedSession[],
    patternsMap: Map<string, Pattern>
  ): void {
    const sequences = new Map<string, { count: number; examples: PatternExample[] }>();

    for (const session of sessions) {
      const toolNames = session.toolCalls.map(tc => tc.name);

      // Look for sequences of 2-3 tools
      for (let i = 0; i < toolNames.length - 1; i++) {
        // Pair sequences
        if (i < toolNames.length - 1) {
          const pair = `${toolNames[i]} -> ${toolNames[i + 1]}`;
          this.updateSequence(sequences, pair, session);
        }

        // Triple sequences
        if (i < toolNames.length - 2) {
          const triple = `${toolNames[i]} -> ${toolNames[i + 1]} -> ${toolNames[i + 2]}`;
          this.updateSequence(sequences, triple, session);
        }
      }
    }

    // Convert to patterns
    Array.from(sequences.entries()).forEach(([sequence, data]) => {
      if (data.count >= 2) {
        const patternId = `tool_seq_${patternsMap.size}`;
        patternsMap.set(patternId, {
          id: patternId,
          type: 'tool_sequence',
          frequency: data.count,
          description: `Common tool sequence: ${sequence}`,
          examples: data.examples.slice(0, 5),
          confidence: Math.min(data.count / 10, 1),
          firstSeen: data.examples[0]?.timestamp || new Date(),
          lastSeen: data.examples[data.examples.length - 1]?.timestamp || new Date(),
        });
      }
    });
  }

  /**
   * Update sequence count
   */
  private updateSequence(
    sequences: Map<string, { count: number; examples: PatternExample[] }>,
    sequence: string,
    session: ExtractedSession
  ): void {
    const existing = sequences.get(sequence) || { count: 0, examples: [] };
    existing.count++;
    if (existing.examples.length < 10) {
      existing.examples.push({
        sessionId: session.id,
        timestamp: session.timestamp,
        context: `Tools: ${sequence}`,
        excerpt: sequence,
      });
    }
    sequences.set(sequence, existing);
  }

  /**
   * Analyze error patterns
   */
  private analyzeErrorPatterns(
    sessions: ExtractedSession[],
    patternsMap: Map<string, Pattern>
  ): void {
    const errorTypes = new Map<string, { count: number; examples: PatternExample[] }>();

    for (const session of sessions) {
      for (const error of session.errors) {
        const key = `${error.type}: ${error.message.substring(0, 50)}`;
        const existing = errorTypes.get(key) || { count: 0, examples: [] };
        existing.count++;
        if (existing.examples.length < 10) {
          existing.examples.push({
            sessionId: session.id,
            timestamp: error.timestamp || session.timestamp,
            context: error.context || '',
            excerpt: error.message,
          });
        }
        errorTypes.set(key, existing);
      }
    }

    // Convert to patterns
    Array.from(errorTypes.entries()).forEach(([errorKey, data]) => {
      if (data.count >= 2) {
        const patternId = `error_${patternsMap.size}`;
        patternsMap.set(patternId, {
          id: patternId,
          type: 'error_pattern',
          frequency: data.count,
          description: `Recurring error: ${errorKey}`,
          examples: data.examples.slice(0, 5),
          confidence: Math.min(data.count / 5, 1),
          firstSeen: data.examples[0]?.timestamp || new Date(),
          lastSeen: data.examples[data.examples.length - 1]?.timestamp || new Date(),
        });
      }
    });
  }

  /**
   * Analyze skill usage patterns
   */
  private analyzeSkillUsage(
    sessions: ExtractedSession[],
    patternsMap: Map<string, Pattern>
  ): void {
    const skillUsage = new Map<string, { count: number; examples: PatternExample[] }>();

    for (const session of sessions) {
      for (const skillName of session.skillsUsed) {
        const existing = skillUsage.get(skillName) || { count: 0, examples: [] };
        existing.count++;
        if (existing.examples.length < 10) {
          existing.examples.push({
            sessionId: session.id,
            timestamp: session.timestamp,
            context: `Skill invoked: ${skillName}`,
            excerpt: skillName,
          });
        }
        skillUsage.set(skillName, existing);
      }
    }

    // Convert to patterns
    Array.from(skillUsage.entries()).forEach(([skillName, data]) => {
      const patternId = `skill_${patternsMap.size}`;
      patternsMap.set(patternId, {
        id: patternId,
        type: 'skill_usage',
        skillName,
        frequency: data.count,
        description: `Skill usage: ${skillName} (${data.count} times)`,
        examples: data.examples.slice(0, 5),
        confidence: Math.min(data.count / 3, 1),
        firstSeen: data.examples[0]?.timestamp || new Date(),
        lastSeen: data.examples[data.examples.length - 1]?.timestamp || new Date(),
      });
    });
  }

  /**
   * Analyze success patterns (sessions without errors)
   */
  private analyzeSuccessPatterns(
    sessions: ExtractedSession[],
    patternsMap: Map<string, Pattern>
  ): void {
    const successTools = new Map<string, { count: number; examples: PatternExample[] }>();

    for (const session of sessions) {
      // Sessions with tool calls but no errors
      if (session.toolCalls.length > 0 && session.errors.length === 0) {
        const toolSet = new Set(session.toolCalls.map(tc => tc.name));
        const key = Array.from(toolSet).sort().join(', ');

        const existing = successTools.get(key) || { count: 0, examples: [] };
        existing.count++;
        if (existing.examples.length < 10) {
          existing.examples.push({
            sessionId: session.id,
            timestamp: session.timestamp,
            context: 'Successful session',
            excerpt: `Tools used: ${key}`,
          });
        }
        successTools.set(key, existing);
      }
    }

    // Convert to patterns
    Array.from(successTools.entries()).forEach(([toolSet, data]) => {
      if (data.count >= 2) {
        const patternId = `success_${patternsMap.size}`;
        patternsMap.set(patternId, {
          id: patternId,
          type: 'success_pattern',
          frequency: data.count,
          description: `Successful tool combination: ${toolSet}`,
          examples: data.examples.slice(0, 5),
          confidence: Math.min(data.count / 5, 1),
          firstSeen: data.examples[0]?.timestamp || new Date(),
          lastSeen: data.examples[data.examples.length - 1]?.timestamp || new Date(),
        });
      }
    });
  }

  /**
   * Analyze workflow patterns (end-to-end interactions)
   */
  private analyzeWorkflowPatterns(
    sessions: ExtractedSession[],
    patternsMap: Map<string, Pattern>
  ): void {
    const workflows = new Map<string, { count: number; examples: PatternExample[] }>();

    for (const session of sessions) {
      // Skip short sessions
      if (session.messages.length < 3) continue;

      // Detect workflow type based on first user message
      const firstUserMsg = session.messages.find(m => m.role === 'user');
      if (!firstUserMsg) continue;

      // Extract intent keywords from first message
      const content = firstUserMsg.content.toLowerCase();
      let workflowType = 'unknown';

      if (content.includes('create') || content.includes('new') || content.includes('add')) {
        workflowType = 'creation';
      } else if (content.includes('fix') || content.includes('bug') || content.includes('error')) {
        workflowType = 'debugging';
      } else if (content.includes('refactor') || content.includes('improve')) {
        workflowType = 'refactoring';
      } else if (content.includes('test')) {
        workflowType = 'testing';
      } else if (content.includes('deploy') || content.includes('release')) {
        workflowType = 'deployment';
      } else if (content.includes('explain') || content.includes('what') || content.includes('how')) {
        workflowType = 'inquiry';
      }

      // Combine with tools used
      const toolSummary = session.toolCalls.slice(0, 3).map(tc => tc.name).join(' -> ');
      const key = `${workflowType}: ${toolSummary}`;

      const existing = workflows.get(key) || { count: 0, examples: [] };
      existing.count++;
      if (existing.examples.length < 10) {
        existing.examples.push({
          sessionId: session.id,
          timestamp: session.timestamp,
          context: `Workflow: ${workflowType}`,
          excerpt: firstUserMsg.content.substring(0, 100),
        });
      }
      workflows.set(key, existing);
    }

    // Convert to patterns
    Array.from(workflows.entries()).forEach(([workflow, data]) => {
      if (data.count >= 2) {
        const patternId = `workflow_${patternsMap.size}`;
        patternsMap.set(patternId, {
          id: patternId,
          type: 'workflow_pattern',
          frequency: data.count,
          description: `Workflow pattern: ${workflow}`,
          examples: data.examples.slice(0, 5),
          confidence: Math.min(data.count / 5, 1),
          firstSeen: data.examples[0]?.timestamp || new Date(),
          lastSeen: data.examples[data.examples.length - 1]?.timestamp || new Date(),
        });
      }
    });
  }

  /**
   * Generate a summary of extracted sessions
   */
  generateSummary(sessions: ExtractedSession[]): SessionSummary {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalMessages: 0,
        totalToolCalls: 0,
        uniqueTools: [],
        errors: 0,
        skillsUsed: [],
        dateRange: { start: new Date(), end: new Date() },
        avgDuration: 0,
      };
    }

    const timestamps = sessions.map(s => s.timestamp).sort((a, b) => a.getTime() - b.getTime());
    const toolsSet = new Set<string>();
    const skillsSet = new Set<string>();
    let totalMessages = 0;
    let totalToolCalls = 0;
    let totalErrors = 0;
    let totalDuration = 0;
    let sessionsWithDuration = 0;

    for (const session of sessions) {
      totalMessages += session.messages.length;
      totalToolCalls += session.toolCalls.length;
      totalErrors += session.errors.length;

      for (const tc of session.toolCalls) {
        toolsSet.add(tc.name);
      }

      for (const skill of session.skillsUsed) {
        skillsSet.add(skill);
      }

      if (session.duration !== undefined) {
        totalDuration += session.duration;
        sessionsWithDuration++;
      }
    }

    return {
      totalSessions: sessions.length,
      totalMessages,
      totalToolCalls,
      uniqueTools: Array.from(toolsSet),
      errors: totalErrors,
      skillsUsed: Array.from(skillsSet),
      dateRange: {
        start: timestamps[0],
        end: timestamps[timestamps.length - 1],
      },
      avgDuration: sessionsWithDuration > 0 ? totalDuration / sessionsWithDuration : 0,
    };
  }

  /**
   * Extract sessions with options
   */
  async extractWithOptions(options: ExtractionOptions): Promise<ExtractedSession[]> {
    const days = options.startTime
      ? Math.ceil((Date.now() - options.startTime.getTime()) / (1000 * 60 * 60 * 24))
      : 30;

    const files = await this.findSessionFiles(days);
    const sessions: ExtractedSession[] = [];

    for (const file of files.slice(0, options.maxSessions || 100)) {
      try {
        const session = await this.extractSession(file);

        // Apply time filters
        if (options.startTime && session.timestamp < options.startTime) continue;
        if (options.endTime && session.timestamp > options.endTime) continue;

        // Apply skill filter
        if (options.skillName && !session.skillsUsed.includes(options.skillName)) {
          continue;
        }

        sessions.push(session);
      } catch (error) {
        console.warn(`Failed to extract session from ${file}:`, error);
      }
    }

    return sessions;
  }

  /**
   * Get skills from sessions index
   */
  async getLoadedSkills(): Promise<LoadedSkill[]> {
    const index = await this.loadSessionsIndex();
    return index.skillsSnapshot?.loadedSkills || [];
  }
}
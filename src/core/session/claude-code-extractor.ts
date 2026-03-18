/**
 * Claude Code Session Extractor - Extracts and analyzes Claude Code session data
 *
 * Parses JSONL session files from ~/.claude/projects/<project-hash>/<session-id>.jsonl
 * Uses streaming to handle large files efficiently.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import {
  CLAUDE_CODE_PATHS,
  ClaudeCodeSessionLine,
  ClaudeCodeContentBlock,
  ClaudeCodeToolUseBlock,
  ClaudeCodeToolResultBlock,
  ClaudeCodeToolCall,
  ClaudeCodeToolResult,
  ClaudeCodeUserMessage,
  ClaudeCodeThinking,
  ClaudeCodeError,
  ClaudeCodeExtractedSession,
  ClaudeCodeSessionMetadata,
  ClaudeCodeFileOperation,
  ClaudeCodePattern,
  ClaudeCodePatternType,
  ClaudeCodePatternExample,
  ClaudeCodeFilterOptions,
  ClaudeCodePatternOptions,
  ClaudeCodeSessionFileInfo,
} from './types';

/**
 * ClaudeCodeExtractor class - Main extraction interface for Claude Code sessions
 */
export class ClaudeCodeExtractor {
  private claudeProjectsPath: string;

  constructor(projectsPath?: string) {
    this.claudeProjectsPath = projectsPath || CLAUDE_CODE_PATHS.projects;
  }

  /**
   * Find all session files from the last N days
   */
  async findSessionFiles(days: number = 7): Promise<ClaudeCodeSessionFileInfo[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const sessionFiles: ClaudeCodeSessionFileInfo[] = [];

    if (!fs.existsSync(this.claudeProjectsPath)) {
      return sessionFiles;
    }

    const projectDirs = await this.getDirectories(this.claudeProjectsPath);

    for (const projectDir of projectDirs) {
      const projectPath = path.join(this.claudeProjectsPath, projectDir);
      const files = await this.getSessionFilesInDir(projectPath);

      for (const file of files) {
        const filePath = path.join(projectPath, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime >= cutoffDate) {
          const sessionId = path.basename(file, '.jsonl');
          sessionFiles.push({
            path: filePath,
            projectId: projectDir,
            sessionId,
            modifiedTime: stats.mtime,
            size: stats.size,
          });
        }
      }
    }

    // Sort by modification time, most recent first
    sessionFiles.sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime());

    return sessionFiles;
  }

  /**
   * Extract session data from a JSONL file (streaming)
   */
  async extractSession(filePath: string): Promise<ClaudeCodeExtractedSession> {
    const sessionId = path.basename(filePath, '.jsonl');
    const projectId = path.basename(path.dirname(filePath));

    const session: ClaudeCodeExtractedSession = {
      id: sessionId,
      filePath,
      projectPath: projectId,
      userMessages: [],
      toolCalls: [],
      thinkings: [],
      errors: [],
      metadata: {
        totalMessages: 0,
        totalToolCalls: 0,
        toolCallCounts: {},
        skillNames: [],
        fileOperations: [],
      },
    };

    const toolCallMap = new Map<string, ClaudeCodeToolCall>();
    let currentTimestamp: Date | undefined;
    let firstTimestamp: Date | undefined;
    let lastTimestamp: Date | undefined;

    // Create read stream for large file handling
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const sessionLine: ClaudeCodeSessionLine = JSON.parse(line);
        session.metadata.totalMessages++;

        // Parse timestamp
        if (sessionLine.timestamp) {
          currentTimestamp = new Date(sessionLine.timestamp);
          if (!firstTimestamp) firstTimestamp = currentTimestamp;
          lastTimestamp = currentTimestamp;
        }

        // Update cwd from session
        if (sessionLine.cwd && !session.metadata.cwd) {
          session.metadata.cwd = sessionLine.cwd;
        }

        // Process based on type
        if (sessionLine.type === 'user') {
          await this.processUserMessage(
            sessionLine,
            session.userMessages,
            toolCallMap,
            currentTimestamp
          );
        } else if (sessionLine.type === 'assistant') {
          await this.processAssistantMessage(
            sessionLine,
            session.toolCalls,
            toolCallMap,
            session.thinkings,
            session.errors,
            session.metadata,
            currentTimestamp
          );
        }
      } catch (error) {
        // Skip malformed lines
        console.debug(`Skipping malformed line in ${filePath}`);
      }
    }

    // Set session timestamps
    session.startTime = firstTimestamp;
    session.endTime = lastTimestamp;

    // Finalize tool call counts
    for (const toolCall of session.toolCalls) {
      const name = toolCall.name;
      session.metadata.toolCallCounts[name] = (session.metadata.toolCallCounts[name] || 0) + 1;
    }
    session.metadata.totalToolCalls = session.toolCalls.length;

    // Extract skill names from content
    session.metadata.skillNames = this.extractSkillNames(session);

    return session;
  }

  /**
   * Filter sessions by skill name
   */
  filterBySkill(
    sessions: ClaudeCodeExtractedSession[],
    skillName: string
  ): ClaudeCodeExtractedSession[] {
    const lowerSkillName = skillName.toLowerCase();
    return sessions.filter(session => {
      // Check skill names in metadata
      if (session.metadata.skillNames.some(s => s.toLowerCase().includes(lowerSkillName))) {
        return true;
      }
      // Check user messages for skill references
      for (const msg of session.userMessages) {
        if (msg.content.toLowerCase().includes(lowerSkillName)) {
          return true;
        }
      }
      // Check tool calls for skill-related commands
      for (const tc of session.toolCalls) {
        if (tc.name.toLowerCase().includes('skill') ||
            JSON.stringify(tc.input).toLowerCase().includes(lowerSkillName)) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Filter sessions by various criteria
   */
  filterSessions(
    sessions: ClaudeCodeExtractedSession[],
    options: ClaudeCodeFilterOptions
  ): ClaudeCodeExtractedSession[] {
    return sessions.filter(session => {
      // Filter by date range
      if (options.startDate && session.startTime && session.startTime < options.startDate) {
        return false;
      }
      if (options.endDate && session.endTime && session.endTime > options.endDate) {
        return false;
      }

      // Filter by skill name
      if (options.skillName) {
        const matchesSkill = session.metadata.skillNames.some(s =>
          s.toLowerCase().includes(options.skillName!.toLowerCase())
        );
        if (!matchesSkill) return false;
      }

      // Filter by tool names
      if (options.toolNames && options.toolNames.length > 0) {
        const hasTool = session.toolCalls.some(tc =>
          options.toolNames!.some(tn => tc.name.toLowerCase().includes(tn.toLowerCase()))
        );
        if (!hasTool) return false;
      }

      // Filter by project path
      if (options.projectPath) {
        if (!session.projectPath?.toLowerCase().includes(options.projectPath.toLowerCase())) {
          return false;
        }
      }

      // Filter by hasErrors
      if (options.hasErrors === true && session.errors.length === 0) {
        return false;
      }

      return true;
    });
  }

  /**
   * Summarize patterns from multiple sessions
   */
  summarizePatterns(
    sessions: ClaudeCodeExtractedSession[],
    options: ClaudeCodePatternOptions = {}
  ): ClaudeCodePattern[] {
    const {
      minFrequency = 2,
      maxExamples = 5,
      patternTypes,
    } = options;

    const patterns: ClaudeCodePattern[] = [];

    // Extract tool sequence patterns
    if (!patternTypes || patternTypes.includes('tool_sequence')) {
      patterns.push(...this.extractToolSequencePatterns(sessions, minFrequency, maxExamples));
    }

    // Extract error recovery patterns
    if (!patternTypes || patternTypes.includes('error_recovery')) {
      patterns.push(...this.extractErrorRecoveryPatterns(sessions, minFrequency, maxExamples));
    }

    // Extract skill usage patterns
    if (!patternTypes || patternTypes.includes('skill_usage')) {
      patterns.push(...this.extractSkillUsagePatterns(sessions, minFrequency, maxExamples));
    }

    // Extract file operation patterns
    if (!patternTypes || patternTypes.includes('file_pattern')) {
      patterns.push(...this.extractFilePatterns(sessions, minFrequency, maxExamples));
    }

    // Extract thinking patterns
    if (!patternTypes || patternTypes.includes('thinking_pattern')) {
      patterns.push(...this.extractThinkingPatterns(sessions, minFrequency, maxExamples));
    }

    // Extract user intent patterns
    if (!patternTypes || patternTypes.includes('user_intent')) {
      patterns.push(...this.extractUserIntentPatterns(sessions, minFrequency, maxExamples));
    }

    return patterns;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Process user message from session line
   */
  private async processUserMessage(
    sessionLine: ClaudeCodeSessionLine,
    userMessages: ClaudeCodeUserMessage[],
    toolCallMap: Map<string, ClaudeCodeToolCall>,
    timestamp?: Date
  ): Promise<void> {
    const content = sessionLine.message.content;
    let textContent = '';
    const toolResults: ClaudeCodeToolResult[] = [];

    if (typeof content === 'string') {
      textContent = content;
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          textContent += (block as { text: string }).text;
        } else if (block.type === 'tool_result') {
          const toolResultBlock = block as ClaudeCodeToolResultBlock;
          const result: ClaudeCodeToolResult = {
            toolUseId: toolResultBlock.tool_use_id,
            content: typeof toolResultBlock.content === 'string'
              ? toolResultBlock.content
              : JSON.stringify(toolResultBlock.content),
            isError: toolResultBlock.is_error || false,
            timestamp,
          };
          toolResults.push(result);

          // Link result to tool call
          const toolCall = toolCallMap.get(toolResultBlock.tool_use_id);
          if (toolCall) {
            toolCall.result = result;
          }
        }
      }
    }

    if (textContent || toolResults.length > 0) {
      userMessages.push({
        content: textContent,
        timestamp,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
      });
    }
  }

  /**
   * Process assistant message from session line
   */
  private async processAssistantMessage(
    sessionLine: ClaudeCodeSessionLine,
    toolCalls: ClaudeCodeToolCall[],
    toolCallMap: Map<string, ClaudeCodeToolCall>,
    thinkings: ClaudeCodeThinking[],
    errors: ClaudeCodeError[],
    metadata: ClaudeCodeSessionMetadata,
    timestamp?: Date
  ): Promise<void> {
    const content = sessionLine.message.content;

    if (!Array.isArray(content)) return;

    for (const block of content) {
      if (block.type === 'thinking') {
        const thinkingBlock = block as { thinking: string };
        thinkings.push({
          content: thinkingBlock.thinking,
          timestamp,
        });
      } else if (block.type === 'tool_use') {
        const toolUseBlock = block as ClaudeCodeToolUseBlock;
        const toolCall: ClaudeCodeToolCall = {
          id: toolUseBlock.id,
          name: toolUseBlock.name,
          input: toolUseBlock.input,
          timestamp,
        };
        toolCalls.push(toolCall);
        toolCallMap.set(toolUseBlock.id, toolCall);

        // Track file operations
        this.trackFileOperation(toolUseBlock, metadata, timestamp);
      } else if (block.type === 'text') {
        // Check for errors in text
        const textBlock = block as { text: string };
        const errorInfo = this.extractErrorFromText(textBlock.text);
        if (errorInfo) {
          errors.push({
            message: errorInfo.message,
            timestamp,
            context: errorInfo.context,
          });
        }
      }
    }
  }

  /**
   * Track file operations from tool calls
   */
  private trackFileOperation(
    toolUse: ClaudeCodeToolUseBlock,
    metadata: ClaudeCodeSessionMetadata,
    timestamp?: Date
  ): void {
    const fileTools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'];
    if (!fileTools.includes(toolUse.name)) return;

    const input = toolUse.input as Record<string, unknown>;
    let operationType: 'read' | 'write' | 'edit' | 'delete' | 'create' | null = null;
    let filePath: string | undefined;

    switch (toolUse.name) {
      case 'Read':
        operationType = 'read';
        filePath = input.file_path as string | undefined;
        break;
      case 'Write':
        operationType = 'write';
        filePath = input.file_path as string | undefined;
        break;
      case 'Edit':
        operationType = 'edit';
        filePath = input.file_path as string | undefined;
        break;
      case 'Bash':
        const command = input.command as string | undefined;
        if (command) {
          if (command.includes('rm ') || command.includes('del ')) {
            operationType = 'delete';
          } else if (command.includes('mkdir') || command.includes('touch')) {
            operationType = 'create';
          }
        }
        break;
    }

    if (operationType && filePath) {
      metadata.fileOperations.push({
        type: operationType,
        path: filePath,
        timestamp,
      });
    }
  }

  /**
   * Extract error information from text
   */
  private extractErrorFromText(text: string): { message: string; context: string } | null {
    const errorPatterns = [
      /error:\s*(.+)/i,
      /failed:\s*(.+)/i,
      /exception:\s*(.+)/i,
      /cannot\s+(.+)/i,
      /unable to\s+(.+)/i,
    ];

    for (const pattern of errorPatterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          message: match[1].trim(),
          context: text.substring(0, 200),
        };
      }
    }
    return null;
  }

  /**
   * Extract skill names from session content
   */
  private extractSkillNames(session: ClaudeCodeExtractedSession): string[] {
    const skillNames = new Set<string>();

    // Pattern to match skill names in various formats
    const skillPatterns = [
      /skill[:\s]+([a-zA-Z0-9_-]+)/gi,
      /\/([a-zA-Z0-9_-]+)(?:\s|$)/g,  // Slash commands
      /invoke\s+([a-zA-Z0-9_-]+)/gi,
      /use\s+([a-zA-Z0-9_-]+)\s+skill/gi,
    ];

    // Search in user messages
    for (const msg of session.userMessages) {
      for (const pattern of skillPatterns) {
        let match;
        while ((match = pattern.exec(msg.content)) !== null) {
          skillNames.add(match[1]);
        }
      }
    }

    // Search in tool calls
    for (const tc of session.toolCalls) {
      if (tc.name === 'Skill' || tc.name.includes('skill')) {
        const skillName = tc.input.skill as string || tc.input.name as string;
        if (skillName) {
          skillNames.add(skillName);
        }
      }
    }

    return Array.from(skillNames);
  }

  /**
   * Extract tool sequence patterns
   */
  private extractToolSequencePatterns(
    sessions: ClaudeCodeExtractedSession[],
    minFrequency: number,
    maxExamples: number
  ): ClaudeCodePattern[] {
    const sequenceMap = new Map<string, { count: number; examples: ClaudeCodePatternExample[] }>();

    for (const session of sessions) {
      // Group tool calls by adjacent messages
      const sequences: string[][] = [];
      let currentSequence: string[] = [];

      for (const tc of session.toolCalls) {
        currentSequence.push(tc.name);
        if (currentSequence.length >= 2) {
          sequences.push([...currentSequence]);
        }
      }

      for (const seq of sequences) {
        const key = seq.join(' -> ');
        const existing = sequenceMap.get(key);
        if (existing) {
          existing.count++;
          if (existing.examples.length < maxExamples) {
            existing.examples.push({
              sessionId: session.id,
              timestamp: session.startTime,
              context: `Tool sequence: ${key}`,
            });
          }
        } else {
          sequenceMap.set(key, {
            count: 1,
            examples: [{
              sessionId: session.id,
              timestamp: session.startTime,
              context: `Tool sequence: ${key}`,
            }],
          });
        }
      }
    }

    const patterns: ClaudeCodePattern[] = [];
    Array.from(sequenceMap.entries()).forEach(([sequence, data]) => {
      if (data.count >= minFrequency) {
        patterns.push({
          id: `pattern_tool_seq_${patterns.length}`,
          type: 'tool_sequence',
          name: `Tool Sequence: ${sequence}`,
          description: `Common tool call sequence occurring ${data.count} times`,
          frequency: data.count,
          examples: data.examples,
          confidence: Math.min(data.count / 10, 1),
        });
      }
    });

    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Extract error recovery patterns
   */
  private extractErrorRecoveryPatterns(
    sessions: ClaudeCodeExtractedSession[],
    minFrequency: number,
    maxExamples: number
  ): ClaudeCodePattern[] {
    const errorRecoveryMap = new Map<string, { count: number; examples: ClaudeCodePatternExample[] }>();

    for (const session of sessions) {
      // Look for error followed by successful tool calls
      for (let i = 0; i < session.errors.length; i++) {
        const error = session.errors[i];
        const errorTime = error.timestamp?.getTime() || 0;

        // Find tool calls after error
        const recoveryTools = session.toolCalls.filter(tc =>
          tc.timestamp && tc.timestamp.getTime() > errorTime && tc.result && !tc.result.isError
        );

        if (recoveryTools.length > 0) {
          const recoveryKey = `Error -> ${recoveryTools.slice(0, 3).map(t => t.name).join(' -> ')}`;
          const existing = errorRecoveryMap.get(recoveryKey);
          if (existing) {
            existing.count++;
            if (existing.examples.length < maxExamples) {
              existing.examples.push({
                sessionId: session.id,
                timestamp: error.timestamp,
                context: `Recovery: ${error.message}`,
                outcome: recoveryTools.map(t => t.name).join(', '),
              });
            }
          } else {
            errorRecoveryMap.set(recoveryKey, {
              count: 1,
              examples: [{
                sessionId: session.id,
                timestamp: error.timestamp,
                context: `Recovery: ${error.message}`,
                outcome: recoveryTools.map(t => t.name).join(', '),
              }],
            });
          }
        }
      }
    }

    const patterns: ClaudeCodePattern[] = [];
    Array.from(errorRecoveryMap.entries()).forEach(([key, data]) => {
      if (data.count >= minFrequency) {
        patterns.push({
          id: `pattern_error_rec_${patterns.length}`,
          type: 'error_recovery',
          name: `Error Recovery: ${key}`,
          description: `Error recovery pattern occurring ${data.count} times`,
          frequency: data.count,
          examples: data.examples,
          confidence: Math.min(data.count / 5, 1),
        });
      }
    });

    return patterns;
  }

  /**
   * Extract skill usage patterns
   */
  private extractSkillUsagePatterns(
    sessions: ClaudeCodeExtractedSession[],
    minFrequency: number,
    maxExamples: number
  ): ClaudeCodePattern[] {
    const skillUsageMap = new Map<string, { count: number; examples: ClaudeCodePatternExample[] }>();

    for (const session of sessions) {
      for (const skillName of session.metadata.skillNames) {
        const existing = skillUsageMap.get(skillName);
        if (existing) {
          existing.count++;
          if (existing.examples.length < maxExamples) {
            existing.examples.push({
              sessionId: session.id,
              timestamp: session.startTime,
              context: `Skill invoked: ${skillName}`,
            });
          }
        } else {
          skillUsageMap.set(skillName, {
            count: 1,
            examples: [{
              sessionId: session.id,
              timestamp: session.startTime,
              context: `Skill invoked: ${skillName}`,
            }],
          });
        }
      }
    }

    const patterns: ClaudeCodePattern[] = [];
    Array.from(skillUsageMap.entries()).forEach(([skillName, data]) => {
      if (data.count >= minFrequency) {
        patterns.push({
          id: `pattern_skill_${patterns.length}`,
          type: 'skill_usage',
          name: `Skill Usage: ${skillName}`,
          description: `Skill "${skillName}" was used ${data.count} times`,
          frequency: data.count,
          skillName,
          examples: data.examples,
          confidence: Math.min(data.count / 3, 1),
        });
      }
    });

    return patterns;
  }

  /**
   * Extract file operation patterns
   */
  private extractFilePatterns(
    sessions: ClaudeCodeExtractedSession[],
    minFrequency: number,
    maxExamples: number
  ): ClaudeCodePattern[] {
    const filePatternMap = new Map<string, { count: number; examples: ClaudeCodePatternExample[] }>();

    for (const session of sessions) {
      // Group by file extension
      const extensionCounts = new Map<string, number>();
      for (const op of session.metadata.fileOperations) {
        const ext = path.extname(op.path) || 'no-extension';
        extensionCounts.set(ext, (extensionCounts.get(ext) || 0) + 1);
      }

      Array.from(extensionCounts.entries()).forEach(([ext, count]) => {
        const key = `File type: ${ext}`;
        const existing = filePatternMap.get(key);
        if (existing) {
          existing.count += count;
          if (existing.examples.length < maxExamples) {
            existing.examples.push({
              sessionId: session.id,
              timestamp: session.startTime,
              context: `${count} operations on ${ext} files`,
            });
          }
        } else {
          filePatternMap.set(key, {
            count,
            examples: [{
              sessionId: session.id,
              timestamp: session.startTime,
              context: `${count} operations on ${ext} files`,
            }],
          });
        }
      });
    }

    const patterns: ClaudeCodePattern[] = [];
    Array.from(filePatternMap.entries()).forEach(([key, data]) => {
      if (data.count >= minFrequency) {
        patterns.push({
          id: `pattern_file_${patterns.length}`,
          type: 'file_pattern',
          name: key,
          description: `File operation pattern occurring ${data.count} times`,
          frequency: data.count,
          examples: data.examples,
          confidence: Math.min(data.count / 10, 1),
        });
      }
    });

    return patterns;
  }

  /**
   * Extract thinking patterns
   */
  private extractThinkingPatterns(
    sessions: ClaudeCodeExtractedSession[],
    minFrequency: number,
    maxExamples: number
  ): ClaudeCodePattern[] {
    const thinkingPatternMap = new Map<string, { count: number; examples: ClaudeCodePatternExample[] }>();

    // Common thinking patterns to look for
    const thinkingKeywords = [
      'analyze', 'consider', 'evaluate', 'determine', 'implement',
      'check', 'verify', 'ensure', 'optimize', 'refactor',
    ];

    for (const session of sessions) {
      for (const thinking of session.thinkings) {
        const content = thinking.content.toLowerCase();
        for (const keyword of thinkingKeywords) {
          if (content.includes(keyword)) {
            const key = `Thinking: ${keyword}`;
            const existing = thinkingPatternMap.get(key);
            if (existing) {
              existing.count++;
              if (existing.examples.length < maxExamples) {
                existing.examples.push({
                  sessionId: session.id,
                  timestamp: thinking.timestamp,
                  context: thinking.content.substring(0, 100),
                });
              }
            } else {
              thinkingPatternMap.set(key, {
                count: 1,
                examples: [{
                  sessionId: session.id,
                  timestamp: thinking.timestamp,
                  context: thinking.content.substring(0, 100),
                }],
              });
            }
          }
        }
      }
    }

    const patterns: ClaudeCodePattern[] = [];
    Array.from(thinkingPatternMap.entries()).forEach(([key, data]) => {
      if (data.count >= minFrequency) {
        patterns.push({
          id: `pattern_thinking_${patterns.length}`,
          type: 'thinking_pattern',
          name: key,
          description: `Thinking pattern occurring ${data.count} times`,
          frequency: data.count,
          examples: data.examples,
          confidence: Math.min(data.count / 5, 1),
        });
      }
    });

    return patterns;
  }

  /**
   * Extract user intent patterns
   */
  private extractUserIntentPatterns(
    sessions: ClaudeCodeExtractedSession[],
    minFrequency: number,
    maxExamples: number
  ): ClaudeCodePattern[] {
    const intentMap = new Map<string, { count: number; examples: ClaudeCodePatternExample[] }>();

    // Common intent patterns
    const intentPatterns = [
      { pattern: /fix\s+(?:the\s+)?(?:bug|error|issue)/i, name: 'Bug Fix' },
      { pattern: /add\s+(?:a\s+)?(?:new\s+)?(?:feature|function|method)/i, name: 'Add Feature' },
      { pattern: /refactor\s+(?:this\s+)?(?:code|function|class)/i, name: 'Refactor' },
      { pattern: /create\s+(?:a\s+)?(?:new\s+)?(?:file|component|module)/i, name: 'Create New' },
      { pattern: /update\s+(?:the\s+)?(?:code|file|config)/i, name: 'Update' },
      { pattern: /delete\s+(?:the\s+)?(?:file|code)/i, name: 'Delete' },
      { pattern: /test\s+(?:the\s+)?(?:code|function)/i, name: 'Testing' },
      { pattern: /explain\s+(?:how|what|why)/i, name: 'Explanation' },
      { pattern: /optimize\s+(?:the\s+)?(?:code|performance)/i, name: 'Optimization' },
      { pattern: /review\s+(?:the\s+)?(?:code|changes)/i, name: 'Code Review' },
    ];

    for (const session of sessions) {
      for (const msg of session.userMessages) {
        for (const { pattern, name } of intentPatterns) {
          if (pattern.test(msg.content)) {
            const existing = intentMap.get(name);
            if (existing) {
              existing.count++;
              if (existing.examples.length < maxExamples) {
                existing.examples.push({
                  sessionId: session.id,
                  timestamp: msg.timestamp,
                  context: msg.content.substring(0, 100),
                });
              }
            } else {
              intentMap.set(name, {
                count: 1,
                examples: [{
                  sessionId: session.id,
                  timestamp: msg.timestamp,
                  context: msg.content.substring(0, 100),
                }],
              });
            }
          }
        }
      }
    }

    const patterns: ClaudeCodePattern[] = [];
    Array.from(intentMap.entries()).forEach(([name, data]) => {
      if (data.count >= minFrequency) {
        patterns.push({
          id: `pattern_intent_${patterns.length}`,
          type: 'user_intent',
          name: `User Intent: ${name}`,
          description: `User intent "${name}" occurred ${data.count} times`,
          frequency: data.count,
          examples: data.examples,
          confidence: Math.min(data.count / 3, 1),
        });
      }
    });

    return patterns;
  }

  /**
   * Get all directories in a path
   */
  private async getDirectories(dirPath: string): Promise<string[]> {
    return new Promise((resolve) => {
      fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
          resolve([]);
          return;
        }
        const dirs = entries
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name);
        resolve(dirs);
      });
    });
  }

  /**
   * Get all JSONL session files in a directory
   */
  private async getSessionFilesInDir(dirPath: string): Promise<string[]> {
    return new Promise((resolve) => {
      fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
          resolve([]);
          return;
        }
        const files = entries
          .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
          .map(entry => entry.name);
        resolve(files);
      });
    });
  }
}

// Singleton instance
export const claudeCodeExtractor = new ClaudeCodeExtractor();

// Re-export types
export * from './types';
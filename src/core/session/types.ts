/**
 * Session Types - Type definitions for session extraction and analysis
 *
 * Defines interfaces for session data extraction across different AI platforms
 */

import * as path from 'path';
import * as os from 'os';

/**
 * OpenClaw session directory paths
 */
export const OPENCLAW_PATHS = {
  base: path.join(os.homedir(), '.openclaw'),
  agents: path.join(os.homedir(), '.openclaw', 'agents'),
  mainAgent: path.join(os.homedir(), '.openclaw', 'agents', 'main'),
  sessions: path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions'),
  sessionsIndex: path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions.json'),
};

/**
 * Sessions index structure (from sessions.json)
 */
export interface SessionsIndex {
  sessions: SessionMeta[];
  skillsSnapshot?: SkillsSnapshot;
}

/**
 * Session metadata from index
 */
export interface SessionMeta {
  id: string;
  startedAt: string;
  endedAt?: string;
  cwd?: string;
  skillIds?: string[];
}

/**
 * Skills snapshot from index
 */
export interface SkillsSnapshot {
  loadedSkills: LoadedSkill[];
  activeAt: string;
}

/**
 * Loaded skill information
 */
export interface LoadedSkill {
  id: string;
  name: string;
  path: string;
  version?: string;
  enabled: boolean;
  loadedAt?: string;
}

/**
 * Extracted session data
 */
export interface ExtractedSession {
  id: string;
  timestamp: Date;
  cwd: string;
  messages: ExtractedMessage[];
  toolCalls: ExtractedToolCall[];
  thinkingBlocks: ExtractedThinking[];
  errors: ExtractedError[];
  skillsUsed: string[];
  duration?: number;
}

/**
 * Extracted message (user or assistant)
 */
export interface ExtractedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  toolCalls?: string[];
}

/**
 * Extracted tool call
 */
export interface ExtractedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  timestamp?: Date;
  result?: unknown;
  success?: boolean;
  context?: string;  // Surrounding text for context
}

/**
 * Extracted thinking block
 */
export interface ExtractedThinking {
  content: string;
  timestamp?: Date;
  duration?: number;
}

/**
 * Extracted error
 */
export interface ExtractedError {
  message: string;
  type: string;
  timestamp?: Date;
  context?: string;
  stackTrace?: string;
}

/**
 * Pattern identified from sessions
 */
export interface Pattern {
  id: string;
  type: PatternType;
  skillName?: string;
  frequency: number;
  description: string;
  examples: PatternExample[];
  confidence: number;  // 0-1
  firstSeen: Date;
  lastSeen: Date;
}

/**
 * Types of patterns that can be detected
 */
export type PatternType =
  | 'tool_sequence'      // Common sequences of tool calls
  | 'error_pattern'      // Recurring errors
  | 'success_pattern'    // Successful interaction patterns
  | 'skill_usage'        // How skills are invoked
  | 'timing_pattern'     // Time-based patterns
  | 'content_pattern'    // Content/themes in messages
  | 'workflow_pattern';  // End-to-end workflow patterns

/**
 * Example of a pattern occurrence
 */
export interface PatternExample {
  sessionId: string;
  timestamp: Date;
  context: string;
  excerpt: string;
}

/**
 * Options for session extraction
 */
export interface ExtractionOptions {
  startTime?: Date;
  endTime?: Date;
  skillName?: string;
  includeThinking?: boolean;
  includeErrors?: boolean;
  maxSessions?: number;
}

/**
 * Options for filtering sessions
 */
export interface FilterOptions {
  skillName?: string;
  startTime?: Date;
  endTime?: Date;
  minDuration?: number;
  maxDuration?: number;
  hasErrors?: boolean;
}

/**
 * Summary of extracted sessions
 */
export interface SessionSummary {
  totalSessions: number;
  totalMessages: number;
  totalToolCalls: number;
  uniqueTools: string[];
  errors: number;
  skillsUsed: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  avgDuration: number;
}

// ============================================================================
// Claude Code Specific Types
// ============================================================================

/**
 * Claude Code session paths
 */
export const CLAUDE_CODE_PATHS = {
  base: path.join(os.homedir(), '.claude'),
  projects: path.join(os.homedir(), '.claude', 'projects'),
};

/**
 * Raw session line from Claude Code JSONL file
 */
export interface ClaudeCodeSessionLine {
  type: 'user' | 'assistant' | 'system';
  message: ClaudeCodeMessage;
  timestamp?: string;
  cwd?: string;
  sessionId?: string;
}

/**
 * Claude Code message content
 */
export interface ClaudeCodeMessage {
  role?: 'user' | 'assistant' | 'system';
  content: string | ClaudeCodeContentBlock[];
}

/**
 * Claude Code content block types
 */
export type ClaudeCodeContentBlock =
  | ClaudeCodeTextBlock
  | ClaudeCodeThinkingBlock
  | ClaudeCodeToolUseBlock
  | ClaudeCodeToolResultBlock;

/**
 * Text content block
 */
export interface ClaudeCodeTextBlock {
  type: 'text';
  text: string;
}

/**
 * Thinking content block
 */
export interface ClaudeCodeThinkingBlock {
  type: 'thinking';
  thinking: string;
}

/**
 * Tool use content block
 */
export interface ClaudeCodeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result content block
 */
export interface ClaudeCodeToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ClaudeCodeContentBlock[];
  is_error?: boolean;
}

/**
 * Claude Code extracted tool call
 */
export interface ClaudeCodeToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  timestamp?: Date;
  result?: ClaudeCodeToolResult;
}

/**
 * Claude Code extracted tool result
 */
export interface ClaudeCodeToolResult {
  toolUseId: string;
  content: string;
  isError: boolean;
  timestamp?: Date;
}

/**
 * Claude Code extracted user message
 */
export interface ClaudeCodeUserMessage {
  content: string;
  timestamp?: Date;
  toolResults?: ClaudeCodeToolResult[];
}

/**
 * Claude Code extracted thinking
 */
export interface ClaudeCodeThinking {
  content: string;
  timestamp?: Date;
  context?: string;  // What prompted this thinking
}

/**
 * Claude Code extracted error
 */
export interface ClaudeCodeError {
  message: string;
  toolName?: string;
  timestamp?: Date;
  context?: string;
}

/**
 * Complete extracted Claude Code session
 */
export interface ClaudeCodeExtractedSession {
  id: string;
  filePath: string;
  projectPath?: string;
  startTime?: Date;
  endTime?: Date;
  userMessages: ClaudeCodeUserMessage[];
  toolCalls: ClaudeCodeToolCall[];
  thinkings: ClaudeCodeThinking[];
  errors: ClaudeCodeError[];
  metadata: ClaudeCodeSessionMetadata;
}

/**
 * Claude Code session metadata
 */
export interface ClaudeCodeSessionMetadata {
  cwd?: string;
  totalMessages: number;
  totalToolCalls: number;
  toolCallCounts: Record<string, number>;
  skillNames: string[];
  fileOperations: ClaudeCodeFileOperation[];
}

/**
 * Claude Code file operation record
 */
export interface ClaudeCodeFileOperation {
  type: 'read' | 'write' | 'edit' | 'delete' | 'create';
  path: string;
  timestamp?: Date;
}

/**
 * Claude Code pattern extracted from sessions
 */
export interface ClaudeCodePattern {
  id: string;
  type: ClaudeCodePatternType;
  name: string;
  description: string;
  frequency: number;
  skillName?: string;
  examples: ClaudeCodePatternExample[];
  confidence: number;  // 0-1
  metadata?: Record<string, unknown>;
}

/**
 * Claude Code pattern types
 */
export type ClaudeCodePatternType =
  | 'tool_sequence'      // Common tool call sequences
  | 'error_recovery'     // How errors were handled
  | 'skill_usage'        // How skills were invoked
  | 'file_pattern'       // Common file operations
  | 'thinking_pattern'   // Reasoning patterns
  | 'user_intent';       // Common user requests

/**
 * Claude Code pattern example
 */
export interface ClaudeCodePatternExample {
  sessionId: string;
  timestamp?: Date;
  context: string;
  outcome?: string;
}

/**
 * Claude Code session filter options
 */
export interface ClaudeCodeFilterOptions {
  startDate?: Date;
  endDate?: Date;
  lastNDays?: number;
  skillName?: string;
  toolNames?: string[];
  projectPath?: string;
  hasErrors?: boolean;
}

/**
 * Claude Code pattern extraction options
 */
export interface ClaudeCodePatternOptions {
  minFrequency?: number;      // Minimum occurrences to be considered a pattern
  maxExamples?: number;       // Maximum examples per pattern
  patternTypes?: ClaudeCodePatternType[];
  skillName?: string;
}

/**
 * Claude Code session file info
 */
export interface ClaudeCodeSessionFileInfo {
  path: string;
  projectId: string;
  sessionId: string;
  modifiedTime: Date;
  size: number;
}

export interface SessionEvidenceBundle {
  claudeCodeSessions: ClaudeCodeExtractedSession[];
  openClawSessions: ExtractedSession[];
  summary: SessionEvidenceSummary;
  highlights: SessionEvidenceHighlight[];
  loopInsights: SessionLoopInsight[];
  keywords: string[];
  grepTerms: string[];
}

export interface SessionEvidenceSummary {
  scannedSessions: number;
  relevantSessions: number;
  skillMatches: number;
  keywordMatches: number;
  grepMatches: number;
  loopSignals: number;
  topKeywords: Array<{ term: string; count: number }>;
  topGrepTerms: Array<{ term: string; count: number }>;
  topErrors: Array<{ message: string; count: number }>;
  topTools: Array<{ name: string; count: number }>;
}

export interface SessionEvidenceHighlight {
  source: 'claude_code' | 'openclaw';
  sessionId: string;
  timestamp?: Date;
  score: number;
  reason: string;
  excerpt: string;
  matchedKeywords: string[];
  matchedGrepTerms: string[];
  loopSignals: string[];
}

export interface SessionLoopInsight {
  label: string;
  description: string;
  frequency: number;
  sessionIds: string[];
}

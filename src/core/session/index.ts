/**
 * Session Module - Session extraction and analysis for AI platforms
 *
 * Provides extractors for different AI platforms to analyze session data
 * and extract patterns for skill evolution.
 */

export * from './types';
export { OpenClawExtractor } from './openclaw-extractor';
export { ClaudeCodeExtractor, claudeCodeExtractor } from './claude-code-extractor';
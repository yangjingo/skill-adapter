/**
 * Config Types - Type definitions for agent configuration
 */

/**
 * Supported agent platforms
 */
export type AgentPlatform = 'claude-code' | 'openclaw' | 'cline' | 'cursor' | 'windsurf' | 'unknown';

/**
 * Agent configuration
 */
export interface AgentConfig {
  platform: AgentPlatform;
  version?: string;
  model?: ModelConfig;
  settingsPath?: string;
  capabilities: string[];
}

/**
 * Model configuration
 */
export interface ModelConfig {
  provider: 'anthropic' | 'openai' | 'openclaw' | 'custom';
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Detection result
 */
export interface DetectionResult {
  detected: AgentPlatform;
  config?: AgentConfig;
  suggestions: string[];
}

/**
 * Platform-specific paths
 */
export const PLATFORM_PATHS: Record<AgentPlatform, {
  configFiles: string[];
  envVars: string[];
  settingsKeys: string[];
}> = {
  'claude-code': {
    configFiles: ['.claude/settings.json', '.claude/settings.local.json'],
    envVars: ['CLAUDE_CODE_VERSION', 'ANTHROPIC_API_KEY'],
    settingsKeys: ['apiKey', 'model', 'apiUrl']
  },
  'openclaw': {
    configFiles: ['.openclaw/config.json', '.openclaw/settings.json'],
    envVars: ['OPENCLAW_VERSION', 'OPENCLAW_API_KEY', 'OPENCLAW_MODEL'],
    settingsKeys: ['model', 'apiKey', 'baseUrl']
  },
  'cline': {
    configFiles: ['.cline/config.json'],
    envVars: ['CLINE_VERSION'],
    settingsKeys: ['model', 'apiKey']
  },
  'cursor': {
    configFiles: ['.cursor/settings.json'],
    envVars: ['CURSOR_API_KEY'],
    settingsKeys: ['model']
  },
  'windsurf': {
    configFiles: ['.windsurf/config.json'],
    envVars: ['WINDSURF_API_KEY'],
    settingsKeys: ['model']
  },
  'unknown': {
    configFiles: [],
    envVars: [],
    settingsKeys: []
  }
};
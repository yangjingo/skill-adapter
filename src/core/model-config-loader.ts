/**
 * Model Config Loader - Automatic model configuration detection and loading
 *
 * Scans configuration files and environment variables to automatically
 * detect the AI model configuration for evolution operations.
 *
 * Priority:
 * 1. Claude Code settings (~/.claude/settings.json)
 * 2. OpenClaw settings (~/.openclaw/config.json)
 * 3. Environment variables (ANTHROPIC_*, OPENCLAW_*)
 * 4. Manual configuration (sa config set model.*)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Model configuration for AI operations
 */
export interface ModelConfig {
  provider: 'anthropic' | 'openclaw' | 'custom';
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Configuration source information
 */
export interface ConfigSource {
  type: 'claude-code' | 'openclaw' | 'env' | 'manual' | 'default';
  path?: string;
  details?: string;
}

/**
 * Load result with guidance
 */
export interface LoadResult {
  success: boolean;
  config?: ModelConfig;
  source?: ConfigSource;
  guidance?: string;
  warnings?: string[];
}

/**
 * Model Config Loader
 */
export class ModelConfigLoader {
  private static instance: ModelConfigLoader;
  private cachedConfig: ModelConfig | null = null;
  private cachedSource: ConfigSource | null = null;

  // Path constants
  private readonly CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
  private readonly CLAUDE_LOCAL_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.local.json');
  private readonly OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'config.json');
  private readonly OPENCLAW_SETTINGS_PATH = path.join(os.homedir(), '.openclaw', 'settings.json');

  private constructor() {}

  static getInstance(): ModelConfigLoader {
    if (!ModelConfigLoader.instance) {
      ModelConfigLoader.instance = new ModelConfigLoader();
    }
    return ModelConfigLoader.instance;
  }

  /**
   * Load model configuration with automatic detection
   */
  load(): LoadResult {
    const warnings: string[] = [];

    // 1. Try Claude Code settings
    const claudeCodeResult = this.loadFromClaudeCode();
    if (claudeCodeResult.success) {
      this.cachedConfig = claudeCodeResult.config!;
      this.cachedSource = claudeCodeResult.source || null;
      return claudeCodeResult;
    }
    if (claudeCodeResult.warnings) {
      warnings.push(...claudeCodeResult.warnings);
    }

    // 2. Try OpenClaw settings
    const openClawResult = this.loadFromOpenClaw();
    if (openClawResult.success) {
      this.cachedConfig = openClawResult.config!;
      this.cachedSource = openClawResult.source || null;
      return openClawResult;
    }

    // 3. Try environment variables
    const envResult = this.loadFromEnv();
    if (envResult.success) {
      this.cachedConfig = envResult.config!;
      this.cachedSource = envResult.source || null;
      return envResult;
    }

    // 4. No configuration found - return guidance
    return {
      success: false,
      warnings,
      guidance: this.generateConfigGuidance()
    };
  }

  /**
   * Load from Claude Code settings
   */
  private loadFromClaudeCode(): LoadResult {
    const warnings: string[] = [];

    // Try settings.json first, then settings.local.json
    const configPaths = [this.CLAUDE_SETTINGS_PATH, this.CLAUDE_LOCAL_SETTINGS_PATH];

    for (const configPath of configPaths) {
      if (!fs.existsSync(configPath)) continue;

      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const settings = JSON.parse(content);

        // Claude Code stores config in "env" section
        const env = settings.env || {};

        const apiKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY;
        const baseUrl = env.ANTHROPIC_BASE_URL;
        const modelId = env.ANTHROPIC_DEFAULT_SONNET_MODEL || env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

        if (apiKey) {
          const config: ModelConfig = {
            provider: baseUrl ? 'custom' : 'anthropic',
            modelId,
            apiKey,
            baseUrl,
            maxTokens: 4096
          };

          return {
            success: true,
            config,
            source: {
              type: 'claude-code',
              path: configPath,
              details: baseUrl
                ? `Using custom endpoint: ${baseUrl}`
                : 'Using Anthropic API directly'
            }
          };
        }
      } catch (error) {
        warnings.push(`Failed to parse ${configPath}: ${error}`);
      }
    }

    return { success: false, warnings };
  }

  /**
   * Load from OpenClaw settings
   */
  private loadFromOpenClaw(): LoadResult {
    const warnings: string[] = [];
    const configPaths = [this.OPENCLAW_CONFIG_PATH, this.OPENCLAW_SETTINGS_PATH];

    for (const configPath of configPaths) {
      if (!fs.existsSync(configPath)) continue;

      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const settings = JSON.parse(content);

        const apiKey = settings.apiKey || settings.openclawApiKey;
        const baseUrl = settings.baseUrl || settings.apiUrl;
        const modelId = settings.model || 'default';

        if (apiKey || baseUrl) {
          const config: ModelConfig = {
            provider: 'openclaw',
            modelId,
            apiKey: apiKey || '',
            baseUrl,
            maxTokens: 4096
          };

          return {
            success: true,
            config,
            source: {
              type: 'openclaw',
              path: configPath
            }
          };
        }
      } catch (error) {
        warnings.push(`Failed to parse ${configPath}: ${error}`);
      }
    }

    return { success: false, warnings };
  }

  /**
   * Load from environment variables
   */
  private loadFromEnv(): LoadResult {
    // Check Anthropic env vars
    const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    const modelId = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
                    process.env.ANTHROPIC_MODEL ||
                    'claude-sonnet-4-6';

    if (apiKey) {
      const config: ModelConfig = {
        provider: baseUrl ? 'custom' : 'anthropic',
        modelId,
        apiKey,
        baseUrl,
        maxTokens: 4096
      };

      return {
        success: true,
        config,
        source: {
          type: 'env',
          details: 'Environment variables'
        }
      };
    }

    // Check OpenClaw env vars
    const openClawKey = process.env.OPENCLAW_API_KEY;
    const openClawUrl = process.env.OPENCLAW_API_URL;
    const openClawModel = process.env.OPENCLAW_MODEL;

    if (openClawKey || openClawUrl) {
      const config: ModelConfig = {
        provider: 'openclaw',
        modelId: openClawModel || 'default',
        apiKey: openClawKey || '',
        baseUrl: openClawUrl,
        maxTokens: 4096
      };

      return {
        success: true,
        config,
        source: {
          type: 'env',
          details: 'OpenClaw environment variables'
        }
      };
    }

    return { success: false };
  }

  /**
   * Generate configuration guidance for users
   */
  private generateConfigGuidance(): string {
    return `
╔══════════════════════════════════════════════════════════════════════════════╗
║                      📋 Model Configuration Guide                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  Skill-Adapter needs an AI model to power the evolution system.               ║
║                                                                               ║
║  Option 1: Claude Code (Recommended)                                          ║
║  ─────────────────────────────────────                                        ║
║  Create ~/.claude/settings.json:                                              ║
║                                                                               ║
║  {                                                                            ║
║    "env": {                                                                   ║
║      "ANTHROPIC_AUTH_TOKEN": "your-api-key",                                 ║
║      "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6"                   ║
║    }                                                                          ║
║  }                                                                            ║
║                                                                               ║
║  Option 2: Using Custom Endpoint (e.g., Alibaba Cloud DashScope)              ║
║  ─────────────────────────────────────────────────────────────────            ║
║  {                                                                            ║
║    "env": {                                                                   ║
║      "ANTHROPIC_AUTH_TOKEN": "your-token",                                   ║
║      "ANTHROPIC_BASE_URL": "https://coding.dashscope.aliyuncs.com/apps/anthropic", ║
║      "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5"                               ║
║    }                                                                          ║
║  }                                                                            ║
║                                                                               ║
║  Option 3: Environment Variables                                              ║
║  ─────────────────────────────────────                                        ║
║  export ANTHROPIC_AUTH_TOKEN="your-api-key"                                  ║
║  export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-4-6"                   ║
║  export ANTHROPIC_BASE_URL="https://api.anthropic.com"  # optional           ║
║                                                                               ║
║  Option 4: Skill-Adapter Config                                               ║
║  ─────────────────────────────────                                            ║
║  sa config set model.apiKey your-api-key                                     ║
║  sa config set model.modelId claude-sonnet-4-6                               ║
║  sa config set model.baseUrl https://api.anthropic.com  # optional           ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
`.trim();
  }

  /**
   * Get cached configuration
   */
  getCachedConfig(): ModelConfig | null {
    return this.cachedConfig;
  }

  /**
   * Create Anthropic client from configuration
   */
  createClient(): Anthropic | null {
    const result = this.load();

    if (!result.success || !result.config) {
      return null;
    }

    const config = result.config;

    return new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  /**
   * Test model connection
   */
  async testConnection(): Promise<{ success: boolean; message: string; model?: string }> {
    const result = this.load();

    if (!result.success) {
      return {
        success: false,
        message: result.guidance || 'No model configuration found.'
      };
    }

    const config = result.config!;

    try {
      const client = this.createClient();

      if (!client) {
        return {
          success: false,
          message: 'Failed to create API client.'
        };
      }

      // Simple test: list models or make a minimal request
      const response = await client.messages.create({
        model: config.modelId,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "OK"' }]
      });

      return {
        success: true,
        message: `Successfully connected to ${config.provider} API`,
        model: config.modelId
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }

  /**
   * Get configuration status for display
   */
  getStatus(): { configured: boolean; source?: string; model?: string; endpoint?: string } {
    const result = this.load();

    if (!result.success || !result.config) {
      return { configured: false };
    }

    return {
      configured: true,
      source: result.source?.type,
      model: result.config.modelId,
      endpoint: result.config.baseUrl || 'https://api.anthropic.com'
    };
  }
}

// Export singleton
export const modelConfigLoader = ModelConfigLoader.getInstance();
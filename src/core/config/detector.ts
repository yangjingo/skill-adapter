/**
 * Agent Detector - Automatic agent platform detection and configuration
 *
 * Detects the current agent environment and loads appropriate configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AgentPlatform,
  AgentConfig,
  ModelConfig,
  DetectionResult,
  PLATFORM_PATHS
} from '../../types/config';

/**
 * AgentDetector class for automatic platform detection
 */
export class AgentDetector {
  private detectedPlatform: AgentPlatform | null = null;
  private cachedConfig: AgentConfig | null = null;

  /**
   * Detect the current agent platform
   */
  detect(): AgentPlatform {
    if (this.detectedPlatform) {
      return this.detectedPlatform;
    }

    // Check in order of priority
    const platforms: AgentPlatform[] = ['claude-code', 'openclaw', 'cline', 'cursor', 'windsurf'];

    for (const platform of platforms) {
      if (this.checkPlatform(platform)) {
        this.detectedPlatform = platform;
        return platform;
      }
    }

    this.detectedPlatform = 'unknown';
    return 'unknown';
  }

  /**
   * Check if running on a specific platform
   */
  private checkPlatform(platform: AgentPlatform): boolean {
    const platformInfo = PLATFORM_PATHS[platform];

    // Check environment variables
    for (const envVar of platformInfo.envVars) {
      if (process.env[envVar]) {
        return true;
      }
    }

    // Check config files
    for (const configFile of platformInfo.configFiles) {
      const fullPath = path.resolve(configFile);
      if (fs.existsSync(fullPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the agent configuration
   */
  getConfig(): DetectionResult {
    const platform = this.detect();
    const suggestions: string[] = [];

    if (platform === 'unknown') {
      suggestions.push('No agent platform detected. Set up Claude Code, OpenClaw, or another supported agent.');
      return {
        detected: platform,
        suggestions
      };
    }

    const config = this.loadPlatformConfig(platform);

    if (!config.model?.modelId) {
      suggestions.push(`Consider configuring a model for ${platform}`);
    }

    if (!config.model?.apiKey && platform !== 'openclaw') {
      suggestions.push('API key not found. Set it in environment or settings.');
    }

    this.cachedConfig = config;

    return {
      detected: platform,
      config,
      suggestions
    };
  }

  /**
   * Load platform-specific configuration
   */
  private loadPlatformConfig(platform: AgentPlatform): AgentConfig {
    const platformInfo = PLATFORM_PATHS[platform];
    const config: AgentConfig = {
      platform,
      capabilities: this.getCapabilities(platform)
    };

    // Find and load config file
    for (const configFile of platformInfo.configFiles) {
      const fullPath = path.resolve(configFile);
      if (fs.existsSync(fullPath)) {
        config.settingsPath = fullPath;
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const settings = JSON.parse(content);

          // Extract model configuration
          config.model = this.extractModelConfig(platform, settings);
          config.version = settings.version;
        } catch (error) {
          console.warn(`Failed to parse config file: ${fullPath}`);
        }
        break;
      }
    }

    // Override with environment variables
    config.model = this.applyEnvOverrides(platform, config.model);

    return config;
  }

  /**
   * Extract model configuration from settings
   */
  private extractModelConfig(platform: AgentPlatform, settings: Record<string, unknown>): ModelConfig {
    const modelConfig: ModelConfig = {
      provider: 'anthropic',
      modelId: ''
    };

    switch (platform) {
      case 'claude-code':
        modelConfig.provider = 'anthropic';
        modelConfig.modelId = (settings.model as string) || 'claude-sonnet-4-6';
        modelConfig.apiKey = (settings.apiKey as string) || process.env.ANTHROPIC_API_KEY;
        break;

      case 'openclaw':
        modelConfig.provider = 'openclaw';
        modelConfig.modelId = (settings.model as string) || process.env.OPENCLAW_MODEL || 'default';
        modelConfig.baseUrl = (settings.baseUrl as string) || process.env.OPENCLAW_API_URL;
        break;

      case 'cline':
        modelConfig.provider = 'anthropic';
        modelConfig.modelId = (settings.model as string) || 'claude-sonnet-4-6';
        modelConfig.apiKey = (settings.apiKey as string) || process.env.ANTHROPIC_API_KEY;
        break;

      default:
        modelConfig.modelId = 'default';
    }

    return modelConfig;
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvOverrides(platform: AgentPlatform, existing?: ModelConfig): ModelConfig {
    const modelConfig = existing || { provider: 'anthropic' as const, modelId: '' };

    switch (platform) {
      case 'claude-code':
        if (process.env.ANTHROPIC_API_KEY) {
          modelConfig.apiKey = process.env.ANTHROPIC_API_KEY;
        }
        if (process.env.ANTHROPIC_MODEL) {
          modelConfig.modelId = process.env.ANTHROPIC_MODEL;
        }
        break;

      case 'openclaw':
        if (process.env.OPENCLAW_MODEL) {
          modelConfig.modelId = process.env.OPENCLAW_MODEL;
        }
        if (process.env.OPENCLAW_API_URL) {
          modelConfig.baseUrl = process.env.OPENCLAW_API_URL;
        }
        break;
    }

    return modelConfig;
  }

  /**
   * Get platform capabilities
   */
  private getCapabilities(platform: AgentPlatform): string[] {
    const capabilities: Record<AgentPlatform, string[]> = {
      'claude-code': ['file-operations', 'bash', 'web-search', 'mcp', 'agents'],
      'openclaw': ['file-operations', 'bash', 'web-search', 'mcp', 'agents'],
      'cline': ['file-operations', 'bash', 'web-search'],
      'cursor': ['file-operations', 'code-completion'],
      'windsurf': ['file-operations', 'code-completion'],
      'unknown': []
    };

    return capabilities[platform] || [];
  }

  /**
   * Get cached configuration
   */
  getCachedConfig(): AgentConfig | null {
    return this.cachedConfig;
  }

  /**
   * Check if model is configured
   */
  isModelConfigured(): boolean {
    const config = this.getConfig();
    return !!(config.config?.model?.modelId);
  }

  /**
   * Get recommended model for platform
   */
  getRecommendedModel(platform: AgentPlatform): string {
    const recommendations: Record<AgentPlatform, string> = {
      'claude-code': 'claude-sonnet-4-6',
      'openclaw': 'default',
      'cline': 'claude-sonnet-4-6',
      'cursor': 'gpt-4',
      'windsurf': 'claude-sonnet-4-6',
      'unknown': 'default'
    };

    return recommendations[platform] || 'default';
  }

  /**
   * Prompt user for configuration if needed
   */
  async ensureConfigured(): Promise<AgentConfig> {
    const result = this.getConfig();

    if (result.detected === 'unknown') {
      throw new Error('No agent platform detected. Please run within Claude Code, OpenClaw, or another supported agent.');
    }

    if (!result.config?.model?.modelId) {
      // Use recommended model
      const recommendedModel = this.getRecommendedModel(result.detected);
      console.log(`\n💡 No model configured for ${result.detected}.`);
      console.log(`   Recommended model: ${recommendedModel}`);
      console.log(`   Using recommended model as default.\n`);

      if (!result.config) {
        result.config = {
          platform: result.detected,
          capabilities: this.getCapabilities(result.detected)
        };
      }

      result.config.model = {
        provider: result.detected === 'openclaw' ? 'openclaw' : 'anthropic',
        modelId: recommendedModel
      };
    }

    return result.config;
  }
}

// Singleton instance
export const agentDetector = new AgentDetector();
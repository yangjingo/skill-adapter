/**
 * Config Manager - User preferences management for Skill-Adapter
 *
 * Stores configuration in ~/.skill-adapter/config.json
 *
 * Supported preferences:
 * - autoEvolve: "always" | "ask" | "preview" - Auto evolution behavior
 * - outputLevel: "simple" | "verbose" | "debug" - Output verbosity
 * - backupEnabled: boolean - Auto backup before modifications
 */

import * as fs from 'fs';
import * as path from 'path';

export interface UserPreferences {
  autoEvolve: 'always' | 'ask' | 'preview';
  outputLevel: 'simple' | 'verbose' | 'debug';
  backupEnabled: boolean;
}

export interface SkillAdapterConfig {
  preferences: UserPreferences;
  recentSkills?: string[];  // Recently used skills
  lastUsed?: string;  // ISO timestamp
}

const DEFAULT_CONFIG: SkillAdapterConfig = {
  preferences: {
    autoEvolve: 'ask',
    outputLevel: 'simple',
    backupEnabled: true
  }
};

export class ConfigManager {
  private configPath: string;
  private config: SkillAdapterConfig;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const configDir = path.join(homeDir, '.skill-adapter');

    // Ensure directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    this.configPath = path.join(configDir, 'config.json');
    this.config = this.load();
  }

  /**
   * Load configuration from file
   */
  private load(): SkillAdapterConfig {
    if (fs.existsSync(this.configPath)) {
      try {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(content);

        // Merge with defaults (for new fields)
        return {
          ...DEFAULT_CONFIG,
          ...loaded,
          preferences: {
            ...DEFAULT_CONFIG.preferences,
            ...(loaded.preferences || {})
          }
        };
      } catch {
        return { ...DEFAULT_CONFIG };
      }
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Save configuration to file
   */
  private save(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  /**
   * Get all preferences
   */
  getPreferences(): UserPreferences {
    return { ...this.config.preferences };
  }

  /**
   * Get a single preference value
   */
  get<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
    return this.config.preferences[key];
  }

  /**
   * Set a preference value
   */
  set<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void {
    this.config.preferences[key] = value;
    this.save();
  }

  /**
   * Get full config
   */
  getConfig(): SkillAdapterConfig {
    return { ...this.config };
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
  }

  /**
   * Check if this is first time using evolve (no evolution records)
   */
  isFirstTimeEvolve(db: { getRecords: (skill: string) => unknown[] }): boolean {
    // Check if config indicates first time
    return this.config.preferences.autoEvolve === 'ask' &&
           !this.config.recentSkills?.length;
  }

  /**
   * Record a skill as recently used
   */
  recordSkillUsage(skillName: string): void {
    const recent = this.config.recentSkills || [];

    // Remove if already exists
    const filtered = recent.filter(s => s !== skillName);

    // Add to front
    this.config.recentSkills = [skillName, ...filtered].slice(0, 10);
    this.config.lastUsed = new Date().toISOString();

    this.save();
  }

  /**
   * Get recent skills list
   */
  getRecentSkills(): string[] {
    return this.config.recentSkills || [];
  }
}

// Singleton instance
export const configManager = new ConfigManager();
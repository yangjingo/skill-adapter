/**
 * Discovery Types - Type definitions for skill discovery and recommendation
 *
 * Defines interfaces for remote skill discovery, insight extraction, and recommendations
 */

import { RegistryType } from './sharing';

/**
 * Remote skill from a registry
 */
export interface RemoteSkill {
  name: string;
  owner: string;
  repository: string;
  description: string;
  platform: RegistryType;
  stats: SkillStats;
  tags: string[];
  url: string;
  installed?: boolean;
  installedVersion?: string;
}

/**
 * Skill statistics
 */
export interface SkillStats {
  downloads: number;
  change24h: number;
  changePercent?: number;
  rating?: number;
  stars?: number;
}

/**
 * Skill insight extracted from a remote skill
 */
export interface SkillInsight {
  id: string;
  skillName: string;
  source: RemoteSkill;
  extractedAt: Date;
  bestPractices: string[];
  patterns: SkillPattern[];
  improvements: ImprovementSuggestion[];
  applicableTo: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Skill pattern identified in a remote skill
 */
export interface SkillPattern {
  name: string;
  description: string;
  type: 'instruction' | 'constraint' | 'workflow' | 'tool-usage' | 'error-handling';
  examples: string[];
  applicability: string;
}

/**
 * Improvement suggestion for local skills
 */
export interface ImprovementSuggestion {
  id: string;
  category: 'efficiency' | 'clarity' | 'safety' | 'compatibility' | 'user-experience';
  priority: 'high' | 'medium' | 'low';
  description: string;
  implementation: string;
  expectedBenefit: string;
  relatedPatterns: string[];
}

/**
 * Discovery result from searching registries
 */
export interface DiscoveryResult {
  query: string;
  timestamp: Date;
  skills: RemoteSkill[];
  insights: SkillInsight[];
  recommendations: SkillRecommendation[];
  platform: RegistryType;
  cached: boolean;
}

/**
 * Skill recommendation for local skills
 */
export interface SkillRecommendation {
  id: string;
  localSkill: string;
  suggestedRemote: RemoteSkill[];
  reason: string;
  confidence: number;  // 0-100
  improvements: string[];
}

/**
 * Discovery options
 */
export interface DiscoveryOptions {
  platforms?: RegistryType[];
  limit?: number;
  includeInsights?: boolean;
  minDownloads?: number;
  tags?: string[];
  excludeInstalled?: boolean;
}

/**
 * Insight extraction options
 */
export interface InsightExtractionOptions {
  extractPatterns?: boolean;
  extractBestPractices?: boolean;
  maxPatterns?: number;
  maxBestPractices?: number;
  focusAreas?: SkillPattern['type'][];
}

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  rank: number;
  skill: RemoteSkill;
  change: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * Leaderboard type
 */
export type LeaderboardType = 'hot' | 'trending' | 'all-time';

/**
 * Skill comparison result
 */
export interface SkillComparison {
  local: {
    name: string;
    version: string;
    metrics: Record<string, number>;
  };
  remote: {
    name: string;
    version: string;
    metrics: Record<string, number>;
  };
  differences: {
    metric: string;
    localValue: number;
    remoteValue: number;
    recommendation: string;
  }[];
  suggestions: string[];
}
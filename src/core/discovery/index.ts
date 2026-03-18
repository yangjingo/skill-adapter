/**
 * Skill Discovery Module - Main entry point
 *
 * Provides skill discovery, insight extraction, and recommendation functionality
 */

export { PlatformFetcher, platformFetcher } from './fetcher';
export { SkillAnalyzer, skillAnalyzer } from './analyzer';
export { RecommendationEngine, recommendationEngine } from './recommender';
export { SkillsCliWrapper, skillsCli } from './skills-cli-wrapper';
export type { SkillInfo, SkillsAddOptions, RemoteSkillInfo } from './skills-cli-wrapper';

// Re-export types
export * from '../../types/discovery';
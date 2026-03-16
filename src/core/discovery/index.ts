/**
 * Skill Discovery Module - Main entry point
 *
 * Provides skill discovery, insight extraction, and recommendation functionality
 */

export { PlatformFetcher, platformFetcher } from './fetcher';
export { SkillAnalyzer, skillAnalyzer } from './analyzer';
export { RecommendationEngine, recommendationEngine } from './recommender';

// Re-export types
export * from '../../types/discovery';
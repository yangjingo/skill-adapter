/**
 * Skill Sharing Module - Main entry point
 *
 * Provides skill package export and PR sharing functionality
 */

export { SkillPackageManager, skillPackageManager } from './package';
export { SkillExporter, skillExporter } from './exporter';
export { shareByPr, DEFAULT_PR_REPO } from './pr-share';

// Re-export types
export * from '../../types/sharing';

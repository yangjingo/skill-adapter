/**
 * Version Types - Type definitions for semantic versioning with evolution tags
 *
 * Defines version management based on evolution metrics
 */

/**
 * Evolution type for version changes
 */
export type EvolutionType =
  | 'cost-reduction'      // Cost reduction (token/call decrease)
  | 'accuracy-improvement' // Accuracy improvement
  | 'feature-addition'    // New features added
  | 'security-fix'        // Security fixes
  | 'performance-boost'   // Performance improvements
  | 'user-experience'     // User experience improvements
  | 'breaking-change';    // Breaking changes

/**
 * Version bump rule based on evolution type
 */
export interface VersionRule {
  evolutionType: EvolutionType;
  bumpType: 'major' | 'minor' | 'patch';
  tagSuffix: string;
  description: string;
}

/**
 * Version tag with metadata
 */
export interface VersionTag {
  version: string;        // e.g., "1.2.3"
  tag: string;            // e.g., "v1.2.0-cost-reduction-15p"
  evolutionType: EvolutionType;
  metrics: VersionMetrics;
  timestamp: Date;
  message: string;
}

/**
 * Metrics that trigger version changes
 */
export interface VersionMetrics {
  tokenReduction?: number;    // Token reduction percentage
  callReduction?: number;     // Call reduction percentage
  accuracyImprovement?: number; // Accuracy improvement percentage
  newFeatures?: string[];     // New features added
  securityIssues?: number;    // Number of security issues fixed
  breakingChanges?: string[]; // List of breaking changes
}

/**
 * Version change result
 */
export interface VersionChange {
  previousVersion: string;
  newVersion: string;
  newTag: string;
  bumpType: 'major' | 'minor' | 'patch';
  evolutionType: EvolutionType;
  changeSummary: string;
}

/**
 * Predefined version rules
 */
export const VERSION_RULES: VersionRule[] = [
  {
    evolutionType: 'breaking-change',
    bumpType: 'major',
    tagSuffix: 'breaking',
    description: 'Breaking changes that require user migration'
  },
  {
    evolutionType: 'feature-addition',
    bumpType: 'minor',
    tagSuffix: 'feature',
    description: 'New features added, backward compatible'
  },
  {
    evolutionType: 'cost-reduction',
    bumpType: 'minor',
    tagSuffix: 'cost',
    description: 'Token or call cost reduction'
  },
  {
    evolutionType: 'accuracy-improvement',
    bumpType: 'minor',
    tagSuffix: 'accuracy',
    description: 'Improved accuracy or quality'
  },
  {
    evolutionType: 'performance-boost',
    bumpType: 'minor',
    tagSuffix: 'perf',
    description: 'Performance improvements'
  },
  {
    evolutionType: 'user-experience',
    bumpType: 'minor',
    tagSuffix: 'ux',
    description: 'User experience improvements'
  },
  {
    evolutionType: 'security-fix',
    bumpType: 'patch',
    tagSuffix: 'security',
    description: 'Security vulnerability fixes'
  }
];
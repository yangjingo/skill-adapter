/**
 * Version Manager - Semantic versioning with evolution-based tags
 *
 * Automatically calculates version bumps based on evolution metrics
 */

import {
  EvolutionType,
  VersionTag,
  VersionMetrics,
  VersionChange,
  VERSION_RULES
} from '../../types/versioning';

/**
 * VersionManager class for semantic versioning with evolution tags
 */
export class VersionManager {
  private versionHistory: Map<string, VersionTag[]>;

  constructor() {
    this.versionHistory = new Map();
  }

  /**
   * Calculate new version based on metrics
   */
  calculateNewVersion(
    currentVersion: string,
    metrics: VersionMetrics
  ): VersionChange {
    const evolutionType = this.determineEvolutionType(metrics);
    const rule = VERSION_RULES.find(r => r.evolutionType === evolutionType);

    if (!rule) {
      throw new Error(`Unknown evolution type: ${evolutionType}`);
    }

    const newVersion = this.bumpVersion(currentVersion, rule.bumpType);
    const newTag = this.generateTag(newVersion, evolutionType, metrics);
    const changeSummary = this.generateChangeSummary(evolutionType, metrics);

    return {
      previousVersion: currentVersion,
      newVersion,
      newTag,
      bumpType: rule.bumpType,
      evolutionType,
      changeSummary
    };
  }

  /**
   * Determine evolution type from metrics
   */
  determineEvolutionType(metrics: VersionMetrics): EvolutionType {
    // Breaking changes have highest priority
    if (metrics.breakingChanges && metrics.breakingChanges.length > 0) {
      return 'breaking-change';
    }

    // New features
    if (metrics.newFeatures && metrics.newFeatures.length > 0) {
      return 'feature-addition';
    }

    // Security fixes
    if (metrics.securityIssues && metrics.securityIssues > 0) {
      return 'security-fix';
    }

    // Cost reduction (significant if > 10%)
    if (metrics.tokenReduction && metrics.tokenReduction > 10) {
      return 'cost-reduction';
    }
    if (metrics.callReduction && metrics.callReduction > 10) {
      return 'cost-reduction';
    }

    // Accuracy improvement
    if (metrics.accuracyImprovement && metrics.accuracyImprovement > 0) {
      return 'accuracy-improvement';
    }

    // Default to performance boost
    return 'performance-boost';
  }

  /**
   * Bump version number
   */
  bumpVersion(version: string, bumpType: 'major' | 'minor' | 'patch'): string {
    const parts = version.split('.').map(Number);

    // Ensure we have 3 parts
    while (parts.length < 3) {
      parts.push(0);
    }

    switch (bumpType) {
      case 'major':
        parts[0] += 1;
        parts[1] = 0;
        parts[2] = 0;
        break;
      case 'minor':
        parts[1] += 1;
        parts[2] = 0;
        break;
      case 'patch':
        parts[2] += 1;
        break;
    }

    return parts.join('.');
  }

  /**
   * Generate version tag
   */
  generateTag(
    version: string,
    evolutionType: EvolutionType,
    metrics: VersionMetrics
  ): string {
    const rule = VERSION_RULES.find(r => r.evolutionType === evolutionType);
    let tag = `v${version}`;

    // Add type suffix
    if (rule) {
      tag += `-${rule.tagSuffix}`;
    }

    // Add metric-specific suffix
    switch (evolutionType) {
      case 'cost-reduction':
        const reduction = metrics.tokenReduction || metrics.callReduction || 0;
        tag += `-${Math.round(reduction)}p`;
        break;
      case 'accuracy-improvement':
        if (metrics.accuracyImprovement) {
          tag += `-${Math.round(metrics.accuracyImprovement)}p`;
        }
        break;
      case 'security-fix':
        if (metrics.securityIssues) {
          tag += `-${metrics.securityIssues}`;
        }
        break;
      case 'feature-addition':
        if (metrics.newFeatures && metrics.newFeatures.length > 0) {
          // Use first feature name (sanitized)
          const featureName = metrics.newFeatures[0]
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 20);
          tag += `-${featureName}`;
        }
        break;
      case 'breaking-change':
        if (metrics.breakingChanges && metrics.breakingChanges.length > 0) {
          tag += `-${metrics.breakingChanges.length}`;
        }
        break;
    }

    return tag;
  }

  /**
   * Generate human-readable change summary
   */
  generateChangeSummary(evolutionType: EvolutionType, metrics: VersionMetrics): string {
    switch (evolutionType) {
      case 'breaking-change':
        return `Breaking changes: ${metrics.breakingChanges?.join(', ') || 'multiple changes'}. Migration required.`;
      case 'feature-addition':
        return `New features: ${metrics.newFeatures?.join(', ') || 'new capabilities'}`;
      case 'cost-reduction':
        const reduction = metrics.tokenReduction || metrics.callReduction || 0;
        return `Cost reduced by ${Math.round(reduction)}% (${metrics.tokenReduction ? 'tokens' : 'calls'})`;
      case 'accuracy-improvement':
        return `Accuracy improved by ${Math.round(metrics.accuracyImprovement || 0)}%`;
      case 'security-fix':
        return `Fixed ${metrics.securityIssues || 1} security issue(s)`;
      case 'performance-boost':
        return 'Performance improvements';
      case 'user-experience':
        return 'User experience improvements';
      default:
        return 'General improvements';
    }
  }

  /**
   * Record version in history
   */
  recordVersion(skillName: string, tag: VersionTag): void {
    const history = this.versionHistory.get(skillName) || [];
    history.push(tag);
    this.versionHistory.set(skillName, history);
  }

  /**
   * Get version history for a skill
   */
  getVersionHistory(skillName: string): VersionTag[] {
    return this.versionHistory.get(skillName) || [];
  }

  /**
   * Get latest version for a skill
   */
  getLatestVersion(skillName: string): VersionTag | null {
    const history = this.getVersionHistory(skillName);
    if (history.length === 0) return null;
    return history[history.length - 1];
  }

  /**
   * Compare two versions
   */
  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }

  /**
   * Check if version is valid semantic version
   */
  isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/.test(version);
  }

  /**
   * Parse version tag to extract version and type
   */
  parseTag(tag: string): { version: string; evolutionType?: EvolutionType } | null {
    // Match patterns like v1.2.3-cost-15p or v1.2.3-feature-name
    const match = tag.match(/^v?(\d+\.\d+\.\d+)(?:-([a-z-]+))?$/i);
    if (!match) return null;

    const version = match[1];
    const suffix = match[2];

    // Determine evolution type from suffix
    let evolutionType: EvolutionType | undefined;
    if (suffix) {
      for (const rule of VERSION_RULES) {
        if (suffix.startsWith(rule.tagSuffix)) {
          evolutionType = rule.evolutionType;
          break;
        }
      }
    }

    return { version, evolutionType };
  }

  /**
   * Suggest next version based on changes
   */
  suggestVersion(
    currentVersion: string,
    changes: { type: 'breaking' | 'feature' | 'fix'; description: string }[]
  ): VersionChange {
    // Determine most significant change type
    const hasBreaking = changes.some(c => c.type === 'breaking');
    const hasFeature = changes.some(c => c.type === 'feature');
    const hasFix = changes.some(c => c.type === 'fix');

    let metrics: VersionMetrics = {};

    if (hasBreaking) {
      metrics.breakingChanges = changes
        .filter(c => c.type === 'breaking')
        .map(c => c.description);
    } else if (hasFeature) {
      metrics.newFeatures = changes
        .filter(c => c.type === 'feature')
        .map(c => c.description);
    } else if (hasFix) {
      metrics.securityIssues = changes.filter(c => c.type === 'fix').length;
    }

    return this.calculateNewVersion(currentVersion, metrics);
  }
}

// Singleton instance
export const versionManager = new VersionManager();
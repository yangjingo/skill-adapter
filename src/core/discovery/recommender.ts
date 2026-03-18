/**
 * Skill Recommender - Recommends skills based on local skill analysis
 *
 * Compares local skills with remote skills and provides recommendations
 */

import {
  RemoteSkill,
  SkillInsight,
  SkillRecommendation,
  DiscoveryResult,
  DiscoveryOptions,
  SkillComparison
} from '../../types/discovery';
import { PlatformFetcher, platformFetcher } from './fetcher';
import { SkillAnalyzer, skillAnalyzer } from './analyzer';
import { EvolutionDatabase } from '../database';

/**
 * RecommendationEngine class
 */
export class RecommendationEngine {
  private fetcher: PlatformFetcher;
  private analyzer: SkillAnalyzer;
  private db: EvolutionDatabase;

  constructor(db?: EvolutionDatabase) {
    this.fetcher = platformFetcher;
    this.analyzer = skillAnalyzer;
    this.db = db || new EvolutionDatabase('evolution.db');
  }

  /**
   * Get recommendations for local skills
   */
  async getRecommendations(localSkills?: string[]): Promise<SkillRecommendation[]> {
    const recommendations: SkillRecommendation[] = [];

    // Get local skills from database
    const records = this.db.getAllRecords();
    const skillNames = localSkills || [...new Set(records.map(r => r.skillName))];

    // Fetch popular remote skills
    const leaderboard = await this.fetcher.fetchHot('skills-sh', 30);
    const remoteSkills = leaderboard.map(entry => entry.skill);

    for (const localSkill of skillNames) {
      const suggestion = await this.findMatchingRemoteSkills(localSkill, remoteSkills);
      if (suggestion) {
        recommendations.push(suggestion);
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Discover skills with insights
   */
  async discover(
    query: string,
    options: DiscoveryOptions = {}
  ): Promise<DiscoveryResult> {
    const skills = await this.fetcher.search(query, options);
    const insights: SkillInsight[] = [];
    const recommendations: SkillRecommendation[] = [];

    // Extract insights for top skills
    if (options.includeInsights) {
      for (const skill of skills.slice(0, 5)) {
        try {
          const insight = await this.analyzer.extractInsights(skill);
          insights.push(insight);
        } catch (error) {
          console.error(`Failed to extract insights for ${skill.name}: ${error}`);
        }
      }
    }

    return {
      query,
      timestamp: new Date(),
      skills,
      insights,
      recommendations,
      platform: options.platforms?.[0] || 'skills-sh',
      cached: false
    };
  }

  /**
   * Get insights for a specific remote skill
   */
  async getInsight(skillName: string, platform?: 'skills-sh'): Promise<SkillInsight | null> {
    const skills = await this.fetcher.search(skillName, {
      platforms: platform ? [platform] : ['skills-sh'],
      limit: 1
    });

    if (skills.length === 0) {
      return null;
    }

    return this.analyzer.extractInsights(skills[0]);
  }

  /**
   * Compare local skill with remote skill
   */
  async compare(localSkillName: string, remoteSkillName: string): Promise<SkillComparison | null> {
    const localRecords = this.db.getRecords(localSkillName);
    if (localRecords.length === 0) {
      return null;
    }

    const remoteSkills = await this.fetcher.search(remoteSkillName, { limit: 1 });
    if (remoteSkills.length === 0) {
      return null;
    }

    const remoteSkill = remoteSkills[0];
    const localRecord = localRecords[localRecords.length - 1];

    // Get insights for comparison
    const insight = await this.analyzer.extractInsights(remoteSkill);

    return {
      local: {
        name: localSkillName,
        version: localRecord.version,
        metrics: {
          evolutionCount: localRecords.length
        }
      },
      remote: {
        name: remoteSkill.name,
        version: remoteSkill.stats.downloads > 10000 ? 'popular' : 'new',
        metrics: {
          downloads: remoteSkill.stats.downloads,
          rating: remoteSkill.stats.rating || 0
        }
      },
      differences: this.calculateDifferences(localRecord, remoteSkill, insight),
      suggestions: insight.improvements.map(i => i.description)
    };
  }

  /**
   * Find matching remote skills for a local skill
   */
  private async findMatchingRemoteSkills(
    localSkill: string,
    remoteSkills: RemoteSkill[]
  ): Promise<SkillRecommendation | null> {
    // Extract keywords from local skill name
    const localKeywords = localSkill.split(/[-_]/).filter(k => k.length > 2);

    // Score remote skills by relevance
    const scored = remoteSkills.map(remote => ({
      remote,
      score: this.calculateRelevanceScore(localKeywords, remote)
    }));

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Get top matches
    const topMatches = scored.slice(0, 3).filter(s => s.score > 0);

    if (topMatches.length === 0) {
      return null;
    }

    const suggestions = topMatches.slice(0, 3).map(s => s.remote);

    return {
      id: `rec_${localSkill}_${Date.now()}`,
      localSkill,
      suggestedRemote: suggestions,
      reason: this.generateReason(localSkill, suggestions[0]),
      confidence: topMatches[0].score,
      improvements: []
    };
  }

  /**
   * Calculate relevance score between local skill and remote skill
   */
  private calculateRelevanceScore(localKeywords: string[], remote: RemoteSkill): number {
    let score = 0;

    // Check name similarity
    const remoteName = remote.name.toLowerCase();
    for (const keyword of localKeywords) {
      if (remoteName.includes(keyword.toLowerCase())) {
        score += 30;
      }
    }

    // Check tag similarity
    for (const tag of remote.tags) {
      for (const keyword of localKeywords) {
        if (tag.toLowerCase().includes(keyword.toLowerCase())) {
          score += 10;
        }
      }
    }

    // Boost by popularity
    if (remote.stats.downloads > 100000) {
      score += 20;
    } else if (remote.stats.downloads > 10000) {
      score += 10;
    }

    // Boost by rating
    if (remote.stats.rating && remote.stats.rating > 4.5) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Generate reason for recommendation
   */
  private generateReason(localSkill: string, remote: RemoteSkill): string {
    const reasons: string[] = [];

    if (remote.stats.downloads > 100000) {
      reasons.push(`highly popular with ${remote.stats.downloads.toLocaleString()} downloads`);
    }

    if (remote.stats.rating && remote.stats.rating > 4.5) {
      reasons.push(`highly rated (${remote.stats.rating}/5)`);
    }

    if (remote.tags.some(t => localSkill.toLowerCase().includes(t.toLowerCase()))) {
      reasons.push('similar functionality');
    }

    if (reasons.length === 0) {
      reasons.push('similar purpose and may offer improvement insights');
    }

    return `${remote.name} is ${reasons.join(', ')}`;
  }

  /**
   * Calculate differences between local and remote skills
   */
  private calculateDifferences(
    localRecord: { version: string; telemetryData: string },
    remoteSkill: RemoteSkill,
    insight: SkillInsight
  ): SkillComparison['differences'] {
    const differences: SkillComparison['differences'] = [];

    // Add pattern differences
    if (insight.patterns.length > 0) {
      differences.push({
        metric: 'Patterns',
        localValue: 0,
        remoteValue: insight.patterns.length,
        recommendation: `Remote skill has ${insight.patterns.length} identifiable patterns that could improve your skill`
      });
    }

    // Add best practice differences
    if (insight.bestPractices.length > 0) {
      differences.push({
        metric: 'Best Practices',
        localValue: 0,
        remoteValue: insight.bestPractices.length,
        recommendation: `Consider adopting ${insight.bestPractices.length} best practices from this skill`
      });
    }

    // Add popularity comparison
    differences.push({
      metric: 'Downloads',
      localValue: 0,
      remoteValue: remoteSkill.stats.downloads,
      recommendation: remoteSkill.stats.downloads > 10000
        ? 'This is a popular skill worth learning from'
        : 'This skill is newer and may have innovative approaches'
    });

    return differences;
  }
}

// Singleton instance
export const recommendationEngine = new RecommendationEngine();
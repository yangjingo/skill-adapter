/**
 * Platform Fetcher - Fetches skill data from skills.sh and ClawHub
 *
 * Handles API calls and data retrieval from external skill registries
 */

import {
  RemoteSkill,
  DiscoveryOptions,
  LeaderboardEntry,
  LeaderboardType
} from '../../types/discovery';
import { RegistryType, RegistryEntry } from '../../types/sharing';

/**
 * Platform endpoint configuration
 */
interface PlatformEndpoint {
  base: string;
  skills: string;
  search: string;
  popular?: string;
  trending?: string;
  hot?: string;
  all?: string;
}

/**
 * API endpoints for different platforms
 */
const PLATFORM_ENDPOINTS: Record<RegistryType, PlatformEndpoint> = {
  clawhub: {
    base: 'https://clawhub.ai',
    skills: '/api/skills',
    search: '/api/skills',
    popular: '/api/skills?sort=downloads',
    trending: '/api/skills?sort=updated'
  },
  'skills-sh': {
    base: 'https://skills.sh',
    skills: '/api/skills',
    search: '/api/search',
    hot: '/api/hot',
    trending: '/api/trending',
    all: '/api/all'
  },
  custom: {
    base: '',
    skills: '/api/skills',
    search: '/api/search'
  }
};

/**
 * PlatformFetcher class
 */
export class PlatformFetcher {
  private cache: Map<string, { data: unknown; timestamp: number }>;
  private cacheTTL: number;
  private timeout: number;

  constructor(cacheTTL: number = 300000, timeout: number = 10000) {
    this.cache = new Map();
    this.cacheTTL = cacheTTL;
    this.timeout = timeout;
  }

  /**
   * Fetch hot skills from platforms
   */
  async fetchHot(platform: RegistryType = 'skills-sh', limit: number = 20): Promise<LeaderboardEntry[]> {
    const skills = await this.fetchLeaderboard('hot', platform, limit);
    return this.convertToLeaderboard(skills);
  }

  /**
   * Fetch trending skills from platforms
   */
  async fetchTrending(platform: RegistryType = 'skills-sh', limit: number = 20): Promise<LeaderboardEntry[]> {
    const skills = await this.fetchLeaderboard('trending', platform, limit);
    return this.convertToLeaderboard(skills);
  }

  /**
   * Fetch all-time popular skills
   */
  async fetchAllTime(platform: RegistryType = 'clawhub', limit: number = 20): Promise<LeaderboardEntry[]> {
    const skills = await this.fetchLeaderboard('all-time', platform, limit);
    return this.convertToLeaderboard(skills);
  }

  /**
   * Search for skills
   */
  async search(
    query: string,
    options: DiscoveryOptions = {}
  ): Promise<RemoteSkill[]> {
    const platforms = options.platforms || ['clawhub', 'skills-sh'];
    const results: RemoteSkill[] = [];

    for (const platform of platforms) {
      try {
        const platformResults = await this.searchPlatform(query, platform, options);
        results.push(...platformResults);
      } catch (error) {
        console.error(`Search failed for ${platform}: ${error}`);
      }
    }

    // Sort by downloads and limit
    return results
      .sort((a, b) => b.stats.downloads - a.stats.downloads)
      .slice(0, options.limit || 20);
  }

  /**
   * Fetch a specific skill's content
   */
  async fetchSkillContent(skill: RemoteSkill): Promise<string> {
    const cacheKey = `content:${skill.platform}:${skill.name}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached as string;
    }

    try {
      // Try to fetch the skill content from the registry
      const endpoints = PLATFORM_ENDPOINTS[skill.platform];
      const url = `${endpoints.base}/api/skills/${encodeURIComponent(skill.name)}/content`;

      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.statusText}`);
      }

      const data = await response.json();
      const dataObj = data as Record<string, unknown>;
      const rawContent = dataObj.content || dataObj.systemPrompt || '';
      const content = typeof rawContent === 'string' ? rawContent : String(rawContent);

      this.setCache(cacheKey, content);
      return content;
    } catch (error) {
      console.error(`Failed to fetch skill content: ${error}`);
      return '';
    }
  }

  /**
   * Fetch leaderboard from a platform
   */
  private async fetchLeaderboard(
    type: LeaderboardType,
    platform: RegistryType,
    limit: number
  ): Promise<RemoteSkill[]> {
    const cacheKey = `leaderboard:${platform}:${type}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return (cached as RemoteSkill[]).slice(0, limit);
    }

    const endpoints = PLATFORM_ENDPOINTS[platform];
    let url: string;

    if (platform === 'skills-sh') {
      const pathMap: Record<string, string> = {
        'hot': endpoints.hot || '/api/hot',
        'trending': endpoints.trending || '/api/trending',
        'all-time': endpoints.all || '/api'
      };
      url = `${endpoints.base}${pathMap[type]}`;
    } else {
      const pathMap: Record<string, string> = {
        'hot': endpoints.popular || '/api/skills?sort=downloads',
        'trending': endpoints.trending || '/api/skills?sort=updated',
        'all-time': endpoints.skills || '/api/skills'
      };
      url = `${endpoints.base}${pathMap[type]}?limit=${limit}`;
    }

    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
      }

      const data = await response.json();
      const skills = this.parsePlatformData(data, platform);

      this.setCache(cacheKey, skills);
      return skills.slice(0, limit);
    } catch (error) {
      console.error(`Failed to fetch leaderboard from ${platform}: ${error}`);
      return this.getMockLeaderboardData(type, limit);
    }
  }

  /**
   * Search a specific platform
   */
  private async searchPlatform(
    query: string,
    platform: RegistryType,
    options: DiscoveryOptions
  ): Promise<RemoteSkill[]> {
    const cacheKey = `search:${platform}:${query}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached as RemoteSkill[];
    }

    const endpoints = PLATFORM_ENDPOINTS[platform];
    const url = `${endpoints.base}${endpoints.search}?q=${encodeURIComponent(query)}`;

    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      const skills = this.parsePlatformData(data, platform);

      this.setCache(cacheKey, skills);
      return skills;
    } catch (error) {
      console.error(`Search failed on ${platform}: ${error}`);
      return this.getMockSearchResults(query, platform);
    }
  }

  /**
   * Parse platform-specific data into RemoteSkill format
   */
  private parsePlatformData(data: unknown, platform: RegistryType): RemoteSkill[] {
    const skills: RemoteSkill[] = [];

    // Handle different response formats
    let items: unknown[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (obj.skills && Array.isArray(obj.skills)) {
        items = obj.skills;
      } else if (obj.results && Array.isArray(obj.results)) {
        items = obj.results;
      }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Record<string, unknown>;
      skills.push({
        name: String(item.name || item.skill_name || ''),
        owner: String(item.author || item.owner || 'unknown'),
        repository: String(item.repository || `${item.owner}/${item.name}`),
        description: String(item.description || ''),
        platform,
        stats: {
          downloads: Number(item.downloads || item.install_count || 0),
          change24h: Number(item.change_1h || item.change_24h || 0),
          changePercent: item.change_percent ? Number(item.change_percent) : undefined,
          rating: item.rating ? Number(item.rating) : undefined,
          stars: item.stars ? Number(item.stars) : undefined
        },
        tags: Array.isArray(item.tags || item.keywords) ? (item.tags || item.keywords) as string[] : [],
        url: String(item.url || `https://${platform === 'clawhub' ? 'clawhub.ai' : 'skills.sh'}/skills/${item.name}`)
      });
    }

    return skills;
  }

  /**
   * Convert skills to leaderboard entries
   */
  private convertToLeaderboard(skills: RemoteSkill[]): LeaderboardEntry[] {
    return skills.map((skill, index) => ({
      rank: index + 1,
      skill,
      change: skill.stats.change24h,
      trend: skill.stats.change24h > 0 ? 'up' : skill.stats.change24h < 0 ? 'down' : 'stable'
    }));
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): unknown | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cache
   */
  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Get mock leaderboard data for testing/offline
   */
  private getMockLeaderboardData(type: LeaderboardType, limit: number): RemoteSkill[] {
    const mockSkills: RemoteSkill[] = [
      {
        name: 'find-skills',
        owner: 'vercel-labs',
        repository: 'vercel-labs/skills',
        description: 'Discover and find relevant skills for your agent',
        platform: 'skills-sh',
        stats: { downloads: 752, change24h: 327 },
        tags: ['discovery', 'search', 'skills'],
        url: 'https://skills.sh/vercel-labs/skills/find-skills'
      },
      {
        name: 'skill-creator',
        owner: 'anthropics',
        repository: 'anthropics/skills',
        description: 'Create new skills and improve existing skills',
        platform: 'skills-sh',
        stats: { downloads: 145, change24h: 80 },
        tags: ['skill', 'creator', 'development'],
        url: 'https://skills.sh/anthropics/skills/skill-creator'
      },
      {
        name: 'frontend-design',
        owner: 'anthropics',
        repository: 'anthropics/skills',
        description: 'Create distinctive, production-grade frontend interfaces',
        platform: 'skills-sh',
        stats: { downloads: 153, change24h: 51 },
        tags: ['frontend', 'design', 'ui'],
        url: 'https://skills.sh/anthropics/skills/frontend-design'
      },
      {
        name: 'self-improving-agent',
        owner: 'pskoett',
        repository: 'pskoett/self-improving-agent',
        description: 'Captures learnings and corrections for continuous improvement',
        platform: 'clawhub',
        stats: { downloads: 227000, change24h: 500, rating: 4.9 },
        tags: ['agent', 'learning', 'improvement'],
        url: 'https://clawhub.ai/skills/self-improving-agent'
      },
      {
        name: 'api-gateway',
        owner: 'byungkyu',
        repository: 'byungkyu/api-gateway',
        description: 'Connect to 100+ APIs with managed OAuth',
        platform: 'clawhub',
        stats: { downloads: 44800, change24h: 200, rating: 4.5 },
        tags: ['api', 'oauth', 'integration'],
        url: 'https://clawhub.ai/skills/api-gateway'
      }
    ];

    return mockSkills.slice(0, limit);
  }

  /**
   * Get mock search results for testing/offline
   */
  private getMockSearchResults(query: string, platform: RegistryType): RemoteSkill[] {
    const allSkills = this.getMockLeaderboardData('hot', 10);
    const lowerQuery = query.toLowerCase();

    return allSkills.filter(skill =>
      skill.name.toLowerCase().includes(lowerQuery) ||
      skill.description.toLowerCase().includes(lowerQuery) ||
      skill.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
}

// Singleton instance
export const platformFetcher = new PlatformFetcher();
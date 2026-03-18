/**
 * Platform Fetcher - Fetches skill data from skills.sh
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
  leaderboard?: string;
}

/**
 * API endpoints for different platforms
 */
const PLATFORM_ENDPOINTS: Record<RegistryType, PlatformEndpoint> = {
  'skills-sh': {
    base: 'https://skills.sh',
    skills: '/api/skills',
    search: '/api/search',
    hot: '/api/leaderboard/hot',
    trending: '/api/leaderboard/trending',
    all: '/api/leaderboard/all',
    leaderboard: '/api/leaderboard'
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
   * Fetch hot skills from skills.sh
   */
  async fetchHot(platform: string = 'skills-sh', limit: number = 20): Promise<LeaderboardEntry[]> {
    const skills = await this.fetchLeaderboard('hot', 'skills-sh', limit);

    // If no results, return mock data
    if (skills.length === 0) {
      return this.convertToLeaderboard(this.getMockLeaderboardData('hot', limit));
    }

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
  async fetchAllTime(platform: RegistryType = 'skills-sh', limit: number = 20): Promise<LeaderboardEntry[]> {
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
    const platforms = options.platforms || ['skills-sh'];
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
      // skills.sh uses /api/leaderboard/* endpoints
      const pathMap: Record<string, string> = {
        'hot': endpoints.leaderboard || '/api/leaderboard/hot',
        'trending': '/api/leaderboard/trending',
        'all-time': '/api/leaderboard/all'
      };
      url = `${endpoints.base}${pathMap[type]}`;
    } else {
      url = `${endpoints.base}/api/leaderboard`;
    }

    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        // Return empty array silently - caller will combine with other platforms
        return [];
      }

      const data = await response.json();
      const skills = this.parsePlatformData(data, platform);

      this.setCache(cacheKey, skills);
      return skills.slice(0, limit);
    } catch (error) {
      // Return empty array silently - caller will combine with other platforms
      return [];
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
      // Use source field (skills.sh API) or repository or construct from owner
      const repoValue = item.source || item.repository || (item.owner ? `${item.owner}/${item.name}` : '');
      skills.push({
        name: String(item.skillId || item.name || item.skill_name || ''),
        owner: String(item.source ? String(item.source).split('/')[0] : (item.author || item.owner || 'unknown')),
        repository: repoValue ? String(repoValue) : '',
        description: String(item.description || ''),
        platform,
        stats: {
          downloads: Number(item.installs || item.downloads || item.install_count || 0),
          change24h: Number(item.change_1h || item.change_24h || 0),
          changePercent: item.change_percent ? Number(item.change_percent) : undefined,
          rating: item.rating ? Number(item.rating) : undefined,
          stars: item.stars ? Number(item.stars) : undefined
        },
        tags: Array.isArray(item.tags || item.keywords) ? (item.tags || item.keywords) as string[] : [],
        url: String(item.url || `https://skills.sh/${repoValue}/${item.skillId || item.name}`)
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
   * Data sourced from skills.sh real listings (curated page)
   */
  private getMockLeaderboardData(type: LeaderboardType, limit: number, platform?: RegistryType): RemoteSkill[] {
    // Real skills from skills.sh curated page (updated 2026-03-17)
    const skills: RemoteSkill[] = [
      {
        name: 'find-skills',
        owner: 'vercel-labs',
        repository: 'vercel-labs/skills',
        description: 'Discover and find relevant skills for your agent',
        platform: 'skills-sh',
        stats: { downloads: 581900, change24h: 0 },
        tags: ['discovery', 'search', 'skills'],
        url: 'https://skills.sh/vercel-labs/skills/find-skills'
      },
      {
        name: 'web-design-guidelines',
        owner: 'vercel-labs',
        repository: 'vercel-labs/agent-skills',
        description: 'Web design guidelines and best practices for modern applications',
        platform: 'skills-sh',
        stats: { downloads: 171400, change24h: 0 },
        tags: ['design', 'web', 'guidelines'],
        url: 'https://skills.sh/vercel-labs/agent-skills/web-design-guidelines'
      },
      {
        name: 'vercel-react-best-practices',
        owner: 'vercel-labs',
        repository: 'vercel-labs/agent-skills',
        description: 'React best practices for Vercel deployments',
        platform: 'skills-sh',
        stats: { downloads: 216900, change24h: 0 },
        tags: ['react', 'vercel', 'best-practices'],
        url: 'https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices'
      },
      {
        name: 'frontend-design',
        owner: 'anthropics',
        repository: 'anthropics/skills',
        description: 'Create distinctive, production-grade frontend interfaces',
        platform: 'skills-sh',
        stats: { downloads: 164500, change24h: 0 },
        tags: ['frontend', 'design', 'ui'],
        url: 'https://skills.sh/anthropics/skills/frontend-design'
      },
      {
        name: 'skill-creator',
        owner: 'anthropics',
        repository: 'anthropics/skills',
        description: 'Create new skills and improve existing skills',
        platform: 'skills-sh',
        stats: { downloads: 86700, change24h: 0 },
        tags: ['skill', 'creator', 'development'],
        url: 'https://skills.sh/anthropics/skills/skill-creator'
      },
      {
        name: 'vercel-composition-patterns',
        owner: 'vercel-labs',
        repository: 'vercel-labs/agent-skills',
        description: 'Vercel composition patterns for scalable applications',
        platform: 'skills-sh',
        stats: { downloads: 87300, change24h: 0 },
        tags: ['vercel', 'patterns', 'architecture'],
        url: 'https://skills.sh/vercel-labs/agent-skills/vercel-composition-patterns'
      },
      {
        name: 'pdf',
        owner: 'anthropics',
        repository: 'anthropics/skills',
        description: 'Work with PDF files - extract, create, and manipulate',
        platform: 'skills-sh',
        stats: { downloads: 40200, change24h: 0 },
        tags: ['pdf', 'document', 'extraction'],
        url: 'https://skills.sh/anthropics/skills/pdf'
      },
      {
        name: 'pptx',
        owner: 'anthropics',
        repository: 'anthropics/skills',
        description: 'Create and edit PowerPoint presentations',
        platform: 'skills-sh',
        stats: { downloads: 35900, change24h: 0 },
        tags: ['pptx', 'powerpoint', 'presentation'],
        url: 'https://skills.sh/anthropics/skills/pptx'
      },
      {
        name: 'docx',
        owner: 'anthropics',
        repository: 'anthropics/skills',
        description: 'Create and edit Word documents',
        platform: 'skills-sh',
        stats: { downloads: 31700, change24h: 0 },
        tags: ['docx', 'word', 'document'],
        url: 'https://skills.sh/anthropics/skills/docx'
      },
      {
        name: 'xlsx',
        owner: 'anthropics',
        repository: 'anthropics/skills',
        description: 'Create and edit Excel spreadsheets',
        platform: 'skills-sh',
        stats: { downloads: 29100, change24h: 0 },
        tags: ['xlsx', 'excel', 'spreadsheet'],
        url: 'https://skills.sh/anthropics/skills/xlsx'
      }
    ];

    return skills.slice(0, limit);
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
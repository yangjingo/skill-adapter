/**
 * Skill Registry - Registry client for skill discovery and publishing
 *
 * Integrates with ClawHub and skills.sh for skill discovery and sharing
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  RegistryEntry,
  RegistrySearchOptions,
  RegistryConfig,
  RegistryType,
  SkillPackage,
  PublishedSkill
} from '../../types/sharing';

/**
 * Default registry configurations
 */
const DEFAULT_REGISTRIES: Record<RegistryType, RegistryConfig> = {
  clawhub: {
    url: 'https://clawhub.ai',
    name: 'ClawHub',
    cachePath: '.cache/clawhub',
    cacheTTL: 3600000 // 1 hour
  },
  'skills-sh': {
    url: 'https://skills.sh',
    name: 'skills.sh',
    cachePath: '.cache/skills-sh',
    cacheTTL: 3600000
  },
  custom: {
    url: '',
    name: 'Custom Registry',
    cachePath: '.cache/custom',
    cacheTTL: 3600000
  }
};

/**
 * SkillRegistry class
 */
export class SkillRegistry {
  private config: Map<RegistryType, RegistryConfig>;
  private cache: Map<string, { data: unknown; timestamp: number }>;
  private defaultRegistry: RegistryType;

  constructor() {
    this.config = new Map();
    this.cache = new Map();
    this.defaultRegistry = 'clawhub';

    // Initialize with default configs
    for (const [type, config] of Object.entries(DEFAULT_REGISTRIES)) {
      this.config.set(type as RegistryType, config);
    }
  }

  /**
   * Search for skills in the registry
   */
  async search(options: RegistrySearchOptions = {}, registryType?: RegistryType): Promise<RegistryEntry[]> {
    const registry = registryType || this.defaultRegistry;
    const config = this.config.get(registry);

    if (!config) {
      throw new Error(`Unknown registry: ${registry}`);
    }

    // Check cache first
    const cacheKey = this.getCacheKey('search', options);
    const cached = this.getFromCache(cacheKey, config.cacheTTL);
    if (cached) {
      return cached as RegistryEntry[];
    }

    // Build URL based on registry type
    let url: string;
    if (registry === 'clawhub') {
      url = this.buildClawHubSearchUrl(config.url, options);
    } else {
      url = this.buildSkillsShSearchUrl(config.url, options);
    }

    try {
      const response = await fetch(url, {
        headers: this.getHeaders(config)
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      const entries = this.parseSearchResults(data, registry);

      // Cache results
      this.setCache(cacheKey, entries);

      return entries;
    } catch (error) {
      console.error(`Search error: ${error}`);
      return this.getMockSearchResults(options);
    }
  }

  /**
   * Get detailed info about a skill
   */
  async getSkillInfo(name: string, registryType?: RegistryType): Promise<RegistryEntry | null> {
    const registry = registryType || this.defaultRegistry;
    const config = this.config.get(registry);

    if (!config) {
      throw new Error(`Unknown registry: ${registry}`);
    }

    const cacheKey = this.getCacheKey('skill', name);
    const cached = this.getFromCache(cacheKey, config.cacheTTL);
    if (cached) {
      return cached as RegistryEntry;
    }

    try {
      const url = `${config.url}/api/skills/${name}`;
      const response = await fetch(url, {
        headers: this.getHeaders(config)
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const entry = this.parseSkillEntry(data, registry);

      this.setCache(cacheKey, entry);
      return entry;
    } catch {
      return this.getMockSkillInfo(name);
    }
  }

  /**
   * Get available versions for a skill
   */
  async getVersions(name: string, registryType?: RegistryType): Promise<string[]> {
    const entry = await this.getSkillInfo(name, registryType);
    return entry?.versions || [];
  }

  /**
   * Download a skill from the registry
   */
  async download(name: string, version?: string, registryType?: RegistryType): Promise<SkillPackage> {
    const registry = registryType || this.defaultRegistry;
    const config = this.config.get(registry);

    if (!config) {
      throw new Error(`Unknown registry: ${registry}`);
    }

    const versionPath = version ? `/${version}` : '';
    const url = `${config.url}/api/skills/${name}${versionPath}/download`;

    try {
      const response = await fetch(url, {
        headers: this.getHeaders(config)
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseSkillPackage(data);
    } catch (error) {
      console.error(`Download error: ${error}`);
      throw new Error(`Failed to download skill: ${name}`);
    }
  }

  /**
   * Publish a skill to the registry
   */
  async publish(skillPackage: SkillPackage, registryType?: RegistryType): Promise<PublishedSkill> {
    const registry = registryType || this.defaultRegistry;
    const config = this.config.get(registry);

    if (!config) {
      throw new Error(`Unknown registry: ${registry}`);
    }

    if (!config.authToken) {
      throw new Error('Authentication required for publishing. Set authToken in registry config.');
    }

    const url = `${config.url}/api/skills`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.getHeaders(config),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(skillPackage)
      });

      if (!response.ok) {
        throw new Error(`Publish failed: ${response.statusText}`);
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        registryId: String(data.id || ''),
        registry,
        name: skillPackage.manifest.name,
        version: skillPackage.manifest.version,
        publishedAt: new Date(),
        url: `${config.url}/skills/${skillPackage.manifest.name}`
      };
    } catch (error) {
      throw new Error(`Failed to publish skill: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get popular/trending skills
   */
  async getPopular(type: 'hot' | 'trending' | 'all' = 'all', limit: number = 20, registryType?: RegistryType): Promise<RegistryEntry[]> {
    return this.search({ sortBy: 'downloads', limit }, registryType);
  }

  /**
   * Configure a registry
   */
  configureRegistry(type: RegistryType, config: Partial<RegistryConfig>): void {
    const existing = this.config.get(type) || DEFAULT_REGISTRIES[type];
    this.config.set(type, { ...existing, ...config } as RegistryConfig);
  }

  /**
   * Set authentication token for a registry
   */
  setAuthToken(type: RegistryType, token: string): void {
    const config = this.config.get(type);
    if (config) {
      config.authToken = token;
    }
  }

  /**
   * Clear cache
   */
  clearCache(registryType?: RegistryType): void {
    if (registryType) {
      const prefix = `${registryType}:`;
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Build ClawHub search URL
   */
  private buildClawHubSearchUrl(baseUrl: string, options: RegistrySearchOptions): string {
    const params = new URLSearchParams();
    if (options.query) params.set('search', options.query);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.sortBy) params.set('sort', options.sortBy);
    return `${baseUrl}/api/skills?${params.toString()}`;
  }

  /**
   * Build skills.sh search URL
   */
  private buildSkillsShSearchUrl(baseUrl: string, options: RegistrySearchOptions): string {
    if (options.query) {
      return `${baseUrl}/api/search?q=${encodeURIComponent(options.query)}`;
    }
    const sortMap: Record<string, string> = {
      downloads: 'all',
      updated: 'trending',
      name: 'all',
      rating: 'all'
    };
    const sortBy = options.sortBy || 'downloads';
    return `${baseUrl}/api/${sortMap[sortBy] || 'all'}`;
  }

  /**
   * Get headers for requests
   */
  private getHeaders(config: RegistryConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    if (config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
    }
    return headers;
  }

  /**
   * Parse search results from API
   */
  private parseSearchResults(data: unknown, registry: RegistryType): RegistryEntry[] {
    // Handle different API response formats
    const results: RegistryEntry[] = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        results.push(this.parseSkillEntry(item, registry));
      }
    } else if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (obj.skills && Array.isArray(obj.skills)) {
        for (const item of obj.skills) {
          results.push(this.parseSkillEntry(item, registry));
        }
      }
    }

    return results;
  }

  /**
   * Parse a single skill entry
   */
  private parseSkillEntry(data: unknown, registry: RegistryType): RegistryEntry {
    const obj = data as Record<string, unknown>;
    return {
      id: String(obj.id || obj.name || ''),
      name: String(obj.name || ''),
      latestVersion: String(obj.version || obj.latest_version || '1.0.0'),
      versions: Array.isArray(obj.versions) ? obj.versions as string[] : [String(obj.version || '1.0.0')],
      author: String(obj.author || obj.owner || 'unknown'),
      description: String(obj.description || ''),
      tags: Array.isArray(obj.tags || obj.keywords) ? (obj.tags || obj.keywords) as string[] : [],
      downloads: Number(obj.downloads || obj.install_count || 0),
      rating: obj.rating ? Number(obj.rating) : undefined,
      verified: Boolean(obj.verified || obj.highlighted),
      publishedAt: new Date(String(obj.publishedAt || obj.created_at || Date.now())),
      updatedAt: new Date(String(obj.updatedAt || obj.updated_at || Date.now())),
      homepage: obj.homepage ? String(obj.homepage) : undefined,
      repository: obj.repository ? String(obj.repository) : undefined
    };
  }

  /**
   * Parse skill package from API
   */
  private parseSkillPackage(data: unknown): SkillPackage {
    const obj = data as Record<string, unknown>;
    return {
      id: String(obj.id || ''),
      manifest: obj.manifest as SkillPackage['manifest'],
      content: obj.content as SkillPackage['content'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };
  }

  /**
   * Get cache key
   */
  private getCacheKey(operation: string, params: unknown): string {
    return `${this.defaultRegistry}:${operation}:${JSON.stringify(params)}`;
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string, ttl: number): unknown | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
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
   * Get mock search results for testing/offline
   */
  private getMockSearchResults(options: RegistrySearchOptions): RegistryEntry[] {
    const mockSkills: RegistryEntry[] = [
      {
        id: 'skill-1',
        name: 'code-reviewer',
        latestVersion: '1.2.0',
        versions: ['1.0.0', '1.1.0', '1.2.0'],
        author: '@anthropics',
        description: 'AI-powered code review assistant',
        tags: ['code', 'review', 'quality'],
        downloads: 15420,
        rating: 4.8,
        verified: true,
        publishedAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-03-01')
      },
      {
        id: 'skill-2',
        name: 'self-improving-agent',
        latestVersion: '2.0.0',
        versions: ['1.0.0', '1.5.0', '2.0.0'],
        author: '@pskoett',
        description: 'Captures learnings and corrections for continuous improvement',
        tags: ['agent', 'learning', 'improvement'],
        downloads: 227000,
        rating: 4.9,
        verified: true,
        publishedAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-03-10')
      },
      {
        id: 'skill-3',
        name: 'frontend-design',
        latestVersion: '1.0.0',
        versions: ['1.0.0'],
        author: '@anthropics',
        description: 'Create distinctive, production-grade frontend interfaces',
        tags: ['frontend', 'design', 'ui'],
        downloads: 15300,
        rating: 4.7,
        verified: true,
        publishedAt: new Date('2024-01-20'),
        updatedAt: new Date('2024-02-15')
      }
    ];

    // Filter by query if provided
    if (options.query) {
      const query = options.query.toLowerCase();
      return mockSkills.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags.some(t => t.toLowerCase().includes(query))
      ).slice(0, options.limit || 20);
    }

    return mockSkills.slice(0, options.limit || 20);
  }

  /**
   * Get mock skill info for testing/offline
   */
  private getMockSkillInfo(name: string): RegistryEntry | null {
    const results = this.getMockSearchResults({});
    return results.find(s => s.name === name) || null;
  }
}

// Singleton instance
export const skillRegistry = new SkillRegistry();
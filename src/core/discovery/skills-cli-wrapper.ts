/**
 * Skills CLI Wrapper - Wraps the official skills.sh CLI
 *
 * This module provides a programmatic interface to the skills.sh CLI.
 * Part of the integration with the skills.sh ecosystem.
 *
 * @see https://skills.sh
 * @see https://github.com/vercel-labs/skills
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Skill information from skills CLI
 */
export interface SkillInfo {
  name: string;
  version?: string;
  path?: string;
  installed?: boolean;
  source?: string;
}

/**
 * Options for skills add command
 */
export interface SkillsAddOptions {
  skill?: string;      // --skill <name>
  agent?: string[];    // --agent <agents>
  global?: boolean;    // --global
  yes?: boolean;       // --yes
}

/**
 * Remote skill from search results
 */
export interface RemoteSkillInfo {
  name: string;
  owner: string;
  repository: string;
  description: string;
  downloads?: number;
}

/**
 * SkillsCliWrapper - Wraps the official skills.sh CLI
 *
 * This class provides methods to interact with installed skills
 * and the skills.sh registry through the official CLI.
 */
export class SkillsCliWrapper {
  private skillsPath: string;
  private globalSkillsPath: string;

  constructor() {
    // Default paths where skills CLI installs skills
    this.skillsPath = path.join(os.homedir(), '.claude', 'skills');
    this.globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
  }

  /**
   * Check if skills CLI is available
   */
  isAvailable(): boolean {
    try {
      execSync('skills --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Install a skill using the official CLI
   *
   * @param source - The source to install from (e.g., "vercel-labs/agent-skills")
   * @param options - Installation options
   * @returns Result with success status and output
   */
  async add(source: string, options: SkillsAddOptions = {}): Promise<{ success: boolean; output: string; skillName?: string }> {
    const args = ['add', source];

    if (options.skill) {
      args.push('--skill', options.skill);
    }
    if (options.global) {
      args.push('--global');
    }
    if (options.yes) {
      args.push('--yes');
    }
    if (options.agent && options.agent.length > 0) {
      for (const agent of options.agent) {
        args.push('--agent', agent);
      }
    }

    try {
      const output = execSync(`skills ${args.join(' ')}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Extract skill name from source or options
      const skillName = options.skill || source.split('/').pop() || source;

      return {
        success: true,
        output: output,
        skillName
      };
    } catch (error) {
      const err = error as { stderr?: string; message?: string };
      return {
        success: false,
        output: err.stderr || err.message || 'Unknown error'
      };
    }
  }

  /**
   * List installed skills
   *
   * @param options - List options
   * @returns Array of installed skills
   */
  async list(options: { global?: boolean; agent?: string[] } = {}): Promise<SkillInfo[]> {
    const args = ['ls', '--json'];

    if (options.global) {
      args.push('--global');
    }
    if (options.agent && options.agent.length > 0) {
      for (const agent of options.agent) {
        args.push('--agent', agent);
      }
    }

    try {
      const output = execSync(`skills ${args.join(' ')}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const data = JSON.parse(output);
      return this.parseListOutput(data);
    } catch {
      // Fallback: scan skills directory directly
      return this.scanSkillsDirectory();
    }
  }

  /**
   * Remove an installed skill
   *
   * @param skillName - Name of the skill to remove
   * @param options - Remove options
   */
  async remove(skillName: string, options: { global?: boolean } = {}): Promise<{ success: boolean; output: string }> {
    const args = ['remove', skillName];

    if (options.global) {
      args.push('--global');
    }

    try {
      const output = execSync(`skills ${args.join(' ')}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      return { success: true, output };
    } catch (error) {
      const err = error as { stderr?: string; message?: string };
      return { success: false, output: err.stderr || err.message || 'Unknown error' };
    }
  }

  /**
   * Get skill content from installed skills
   *
   * This reads the SKILL.md or skill.md file from an installed skill.
   *
   * @param skillName - Name of the skill
   * @returns The skill content or null if not found
   */
  async getSkillContent(skillName: string): Promise<string | null> {
    // First, try to find the skill in the installed skills
    const skills = await this.list();

    const found = skills.find(s =>
      s.name === skillName ||
      s.name.toLowerCase() === skillName.toLowerCase()
    );

    if (found && found.path) {
      // Try different file names
      const possibleFiles = [
        'SKILL.md',
        'skill.md',
        'prompt.md',
        'README.md'
      ];

      for (const file of possibleFiles) {
        const filePath = path.join(found.path, file);
        if (fs.existsSync(filePath)) {
          return fs.readFileSync(filePath, 'utf-8');
        }
      }
    }

    // Fallback: scan the skills directory directly
    return this.findSkillContentDirect(skillName);
  }

  /**
   * Get the installation path for a skill
   *
   * @param skillName - Name of the skill
   * @returns The path or null if not found
   */
  getSkillPath(skillName: string): string | null {
    // Check common locations
    const locations = [
      this.skillsPath,
      this.globalSkillsPath,
      // Project-level skills
      path.join(process.cwd(), '.claude', 'skills')
    ];

    for (const loc of locations) {
      if (!fs.existsSync(loc)) continue;

      const entries = fs.readdirSync(loc, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.toLowerCase() === skillName.toLowerCase()) {
          return path.join(loc, entry.name);
        }
      }
    }

    return null;
  }

  /**
   * Find skill content by directly scanning the skills directory
   */
  private findSkillContentDirect(skillName: string): string | null {
    const skillPath = this.getSkillPath(skillName);

    if (skillPath) {
      const possibleFiles = ['SKILL.md', 'skill.md', 'prompt.md', 'README.md'];

      for (const file of possibleFiles) {
        const filePath = path.join(skillPath, file);
        if (fs.existsSync(filePath)) {
          return fs.readFileSync(filePath, 'utf-8');
        }
      }
    }

    return null;
  }

  /**
   * Parse the output from skills ls --json
   */
  private parseListOutput(data: unknown): SkillInfo[] {
    const skills: SkillInfo[] = [];

    if (!data) return skills;

    // Handle array format
    if (Array.isArray(data)) {
      for (const item of data) {
        skills.push({
          name: String(item.name || item.skillId || ''),
          version: item.version ? String(item.version) : undefined,
          path: item.path ? String(item.path) : undefined,
          installed: true,
          source: item.source ? String(item.source) : undefined
        });
      }
    }
    // Handle object with skills array
    else if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      const items = (obj.skills || obj.results || []) as unknown[];

      for (const item of items) {
        const itemObj = item as Record<string, unknown>;
        skills.push({
          name: String(itemObj.name || itemObj.skillId || ''),
          version: itemObj.version ? String(itemObj.version) : undefined,
          path: itemObj.path ? String(itemObj.path) : undefined,
          installed: true,
          source: itemObj.source ? String(itemObj.source) : undefined
        });
      }
    }

    return skills;
  }

  /**
   * Scan the skills directory directly as a fallback
   */
  private scanSkillsDirectory(): SkillInfo[] {
    const skills: SkillInfo[] = [];

    const locations = [
      this.skillsPath,
      this.globalSkillsPath,
      path.join(process.cwd(), '.claude', 'skills')
    ];

    for (const loc of locations) {
      if (!fs.existsSync(loc)) continue;

      const entries = fs.readdirSync(loc, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = path.join(loc, entry.name);
          skills.push({
            name: entry.name,
            path: skillDir,
            installed: true
          });
        }
      }
    }

    return skills;
  }

  /**
   * Check if a skill is installed
   *
   * @param skillName - Name of the skill
   * @returns True if the skill is installed
   */
  async isInstalled(skillName: string): Promise<boolean> {
    const skills = await this.list();
    return skills.some(s =>
      s.name === skillName ||
      s.name.toLowerCase() === skillName.toLowerCase()
    );
  }

  /**
   * Get the version of an installed skill
   *
   * @param skillName - Name of the skill
   * @returns The version or null if not found
   */
  async getVersion(skillName: string): Promise<string | null> {
    const skills = await this.list();
    const found = skills.find(s =>
      s.name === skillName ||
      s.name.toLowerCase() === skillName.toLowerCase()
    );
    return found?.version || null;
  }
}

// Singleton instance
export const skillsCli = new SkillsCliWrapper();
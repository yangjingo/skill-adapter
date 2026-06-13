import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface SkillInfo {
  name: string;
  version?: string;
  path?: string;
  installed?: boolean;
  source?: string;
}

export class SkillsStore {
  private skillsPath: string;
  private globalSkillsPath: string;

  constructor() {
    this.skillsPath = path.join(os.homedir(), '.claude', 'skills');
    this.globalSkillsPath = path.join(os.homedir(), '.claude', 'skills');
  }

  async list(): Promise<SkillInfo[]> {
    return this.scanSkillsDirectory();
  }

  async getSkillContent(skillName: string): Promise<string | null> {
    const skillPath = this.getSkillPath(skillName);
    if (!skillPath) return null;

    const possibleFiles = ['SKILL.md', 'skill.md', 'prompt.md', 'README.md'];
    for (const file of possibleFiles) {
      const filePath = path.join(skillPath, file);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
    }

    return null;
  }

  getSkillPath(skillName: string): string | null {
    for (const loc of this.getSkillLocations()) {
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

  async isInstalled(skillName: string): Promise<boolean> {
    return this.getSkillPath(skillName) !== null;
  }

  async getVersion(skillName: string): Promise<string | null> {
    const skillPath = this.getSkillPath(skillName);
    if (!skillPath) return null;
    const pkgPath = path.join(skillPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return pkg.version || null;
      } catch { /* ignore */ }
    }
    return null;
  }

  private getSkillLocations(): string[] {
    return [...new Set([
      this.skillsPath,
      this.globalSkillsPath,
      path.join(process.cwd(), '.claude', 'skills')
    ].map((p) => path.resolve(p)))];
  }

  private scanSkillsDirectory(): SkillInfo[] {
    const skills: SkillInfo[] = [];
    const seen = new Set<string>();

    for (const loc of this.getSkillLocations()) {
      if (!fs.existsSync(loc)) continue;

      const entries = fs.readdirSync(loc, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = path.join(loc, entry.name);
        const key = skillDir.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        skills.push({
          name: entry.name,
          path: skillDir,
          installed: true
        });
      }
    }

    return skills;
  }
}

export const skillsStore = new SkillsStore();

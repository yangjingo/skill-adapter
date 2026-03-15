/**
 * Patcher - Skill injection engine
 *
 * Manages Skill System Prompt modifications, supports patch application/rollback, version management
 */

export interface SkillPatch {
  id: string;
  skillName: string;
  version: string;
  timestamp: Date;
  type: 'insert' | 'replace' | 'append';
  target: string;  // Target section or pattern
  content: string;
  description: string;
  active: boolean;
}

export interface SkillVersion {
  version: string;
  timestamp: Date;
  promptHash: string;
  patches: string[];  // Patch IDs
}

export class SkillPatcher {
  private patches: Map<string, SkillPatch> = new Map();
  private versions: Map<string, SkillVersion[]> = new Map();
  private currentVersion: Map<string, string> = new Map();

  /**
   * Create a new patch
   */
  createPatch(patch: Omit<SkillPatch, 'id' | 'timestamp' | 'active'>): SkillPatch {
    const id = this.generatePatchId();
    const newPatch: SkillPatch = {
      ...patch,
      id,
      timestamp: new Date(),
      active: true
    };

    this.patches.set(id, newPatch);
    return newPatch;
  }

  /**
   * Apply a patch to a skill's system prompt
   */
  applyPatch(skillName: string, prompt: string, patchId: string): string {
    const patch = this.patches.get(patchId);
    if (!patch) {
      throw new Error(`Patch ${patchId} not found`);
    }

    let modifiedPrompt = prompt;

    switch (patch.type) {
      case 'insert':
        modifiedPrompt = this.insertContent(prompt, patch.target, patch.content);
        break;
      case 'replace':
        modifiedPrompt = this.replaceContent(prompt, patch.target, patch.content);
        break;
      case 'append':
        modifiedPrompt = prompt + '\n\n' + patch.content;
        break;
    }

    // Update version tracking
    this.updateVersion(skillName, patchId);

    return modifiedPrompt;
  }

  /**
   * Rollback a patch
   */
  rollbackPatch(patchId: string): boolean {
    const patch = this.patches.get(patchId);
    if (!patch) {
      return false;
    }

    patch.active = false;
    return true;
  }

  /**
   * Get all patches for a skill
   */
  getPatches(skillName: string): SkillPatch[] {
    return Array.from(this.patches.values())
      .filter(p => p.skillName === skillName && p.active);
  }

  /**
   * Get version history for a skill
   */
  getVersionHistory(skillName: string): SkillVersion[] {
    return this.versions.get(skillName) || [];
  }

  /**
   * Get current version for a skill
   */
  getCurrentVersion(skillName: string): string {
    return this.currentVersion.get(skillName) || '1.0.0';
  }

  /**
   * Set current version for a skill
   */
  setCurrentVersion(skillName: string, version: string): void {
    this.currentVersion.set(skillName, version);
  }

  /**
   * Insert content at a target location
   */
  private insertContent(prompt: string, target: string, content: string): string {
    const index = prompt.indexOf(target);
    if (index === -1) {
      // Target not found, append to end
      return prompt + '\n\n' + content;
    }
    return prompt.slice(0, index) + content + '\n' + prompt.slice(index);
  }

  /**
   * Replace target content
   */
  private replaceContent(prompt: string, target: string, content: string): string {
    return prompt.replace(target, content);
  }

  /**
   * Update version tracking
   */
  private updateVersion(skillName: string, patchId: string): void {
    const currentVer = this.getCurrentVersion(skillName);
    const newVersion = this.incrementVersion(currentVer);

    const versions = this.versions.get(skillName) || [];
    versions.push({
      version: newVersion,
      timestamp: new Date(),
      promptHash: '',  // Would be calculated from actual prompt
      patches: [patchId]
    });

    this.versions.set(skillName, versions);
    this.setCurrentVersion(skillName, newVersion);
  }

  /**
   * Increment semantic version
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
  }

  /**
   * Generate unique patch ID
   */
  private generatePatchId(): string {
    return `patch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export patches for persistence
   */
  exportPatches(): SkillPatch[] {
    return Array.from(this.patches.values());
  }

  /**
   * Import patches from persistence
   */
  importPatches(patches: SkillPatch[]): void {
    for (const patch of patches) {
      this.patches.set(patch.id, patch);
    }
  }
}

// Singleton instance
export const skillPatcher = new SkillPatcher();
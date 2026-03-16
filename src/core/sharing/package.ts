/**
 * Skill Package Manager - Package creation, validation, and signing
 *
 * Handles skill package bundling, validation, integrity checking
 */

import * as crypto from 'crypto';
import {
  SkillPackage,
  SkillManifest,
  SkillContent,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  PackageFile
} from '../../types/sharing';

/**
 * SkillPackageManager class
 */
export class SkillPackageManager {
  /**
   * Create a new skill package
   */
  create(
    name: string,
    content: SkillContent,
    manifest: Partial<SkillManifest>
  ): SkillPackage {
    const fullManifest: SkillManifest = {
      name,
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      author: manifest.author || '',
      license: manifest.license || 'MIT',
      keywords: manifest.keywords || [],
      repository: manifest.repository,
      homepage: manifest.homepage,
      main: manifest.main || 'skill.md',
      compatibility: manifest.compatibility || {
        platforms: ['claude-code', 'openclaw']
      }
    };

    const now = new Date();
    const id = this.generateId(name);

    const skillPackage: SkillPackage = {
      id,
      manifest: fullManifest,
      content,
      metadata: {
        createdAt: now,
        updatedAt: now
      }
    };

    // Calculate checksum
    skillPackage.metadata.checksum = this.calculateChecksum(skillPackage);

    return skillPackage;
  }

  /**
   * Validate a skill package
   */
  validate(skillPackage: SkillPackage): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate manifest
    const manifestErrors = this.validateManifest(skillPackage.manifest);
    errors.push(...manifestErrors);

    // Validate content
    const contentErrors = this.validateContent(skillPackage.content);
    errors.push(...contentErrors);

    // Check for warnings
    if (!skillPackage.manifest.description) {
      warnings.push({
        code: 'MISSING_DESCRIPTION',
        message: 'Skill package lacks a description',
        recommendation: 'Add a description to help users understand the skill'
      });
    }

    if (!skillPackage.manifest.keywords || skillPackage.manifest.keywords.length === 0) {
      warnings.push({
        code: 'MISSING_KEYWORDS',
        message: 'Skill package has no keywords',
        recommendation: 'Add keywords to improve discoverability'
      });
    }

    if (!skillPackage.content.constraints || skillPackage.content.constraints.length === 0) {
      warnings.push({
        code: 'NO_CONSTRAINTS',
        message: 'Skill has no workspace constraints defined',
        recommendation: 'Consider adding constraints for better security'
      });
    }

    // Validate checksum if present
    if (skillPackage.metadata.checksum) {
      const currentChecksum = this.calculateChecksum(skillPackage);
      if (currentChecksum !== skillPackage.metadata.checksum) {
        errors.push({
          code: 'CHECKSUM_MISMATCH',
          message: 'Package checksum does not match content'
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Sign a package with a private key
   */
  sign(skillPackage: SkillPackage, privateKey: string): SkillPackage {
    const dataToSign = this.serializeForSigning(skillPackage);
    const sign = crypto.createSign('SHA256');
    sign.update(dataToSign);
    sign.end();

    const signature = sign.sign(privateKey, 'base64');

    return {
      ...skillPackage,
      signature: `sha256:${signature}`
    };
  }

  /**
   * Verify package signature
   */
  verifySignature(skillPackage: SkillPackage, publicKey: string): boolean {
    if (!skillPackage.signature) {
      return false;
    }

    try {
      const signature = skillPackage.signature.replace('sha256:', '');
      const dataToVerify = this.serializeForSigning(skillPackage);
      const verify = crypto.createVerify('SHA256');
      verify.update(dataToVerify);
      verify.end();

      return verify.verify(publicKey, signature, 'base64');
    } catch {
      return false;
    }
  }

  /**
   * Calculate package checksum
   */
  calculateChecksum(skillPackage: SkillPackage): string {
    const data = JSON.stringify({
      manifest: skillPackage.manifest,
      content: skillPackage.content
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Pack multiple files into a single package
   */
  pack(files: PackageFile[], manifest: Partial<SkillManifest>): SkillPackage {
    // Find main file
    const mainFile = files.find(f => f.path === manifest.main) || files[0];

    const content: SkillContent = {
      systemPrompt: mainFile.content.toString(),
      metadata: {}
    };

    // Parse additional files for patches, constraints, etc.
    for (const file of files) {
      if (file.path !== mainFile.path) {
        // Could parse patches, constraints from additional files
        content.metadata![file.path] = file.content.toString();
      }
    }

    return this.create(manifest.name || 'unnamed-skill', content, manifest);
  }

  /**
   * Unpack a package into individual files
   */
  unpack(skillPackage: SkillPackage): PackageFile[] {
    const files: PackageFile[] = [];

    // Main skill file
    files.push({
      path: skillPackage.manifest.main,
      content: skillPackage.content.systemPrompt
    });

    // Manifest file
    files.push({
      path: 'skill.json',
      content: JSON.stringify(skillPackage.manifest, null, 2)
    });

    // Additional metadata files
    if (skillPackage.content.metadata) {
      for (const [key, value] of Object.entries(skillPackage.content.metadata)) {
        files.push({
          path: key,
          content: JSON.stringify(value, null, 2)
        });
      }
    }

    return files;
  }

  /**
   * Generate unique package ID
   */
  private generateId(name: string): string {
    const hash = crypto.createHash('md5')
      .update(`${name}-${Date.now()}`)
      .digest('hex')
      .substring(0, 12);
    return `skill_${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${hash}`;
  }

  /**
   * Validate manifest fields
   */
  private validateManifest(manifest: SkillManifest): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!manifest.name || manifest.name.trim() === '') {
      errors.push({
        code: 'MISSING_NAME',
        message: 'Skill name is required',
        field: 'manifest.name'
      });
    }

    if (!manifest.version) {
      errors.push({
        code: 'MISSING_VERSION',
        message: 'Skill version is required',
        field: 'manifest.version'
      });
    } else if (!this.isValidVersion(manifest.version)) {
      errors.push({
        code: 'INVALID_VERSION',
        message: 'Version must follow semantic versioning (e.g., 1.0.0)',
        field: 'manifest.version'
      });
    }

    if (manifest.name && !this.isValidName(manifest.name)) {
      errors.push({
        code: 'INVALID_NAME',
        message: 'Name can only contain lowercase letters, numbers, and hyphens',
        field: 'manifest.name'
      });
    }

    return errors;
  }

  /**
   * Validate content fields
   */
  private validateContent(content: SkillContent): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!content.systemPrompt || content.systemPrompt.trim() === '') {
      errors.push({
        code: 'EMPTY_CONTENT',
        message: 'Skill content (systemPrompt) cannot be empty',
        field: 'content.systemPrompt'
      });
    }

    // Check for minimum content length
    if (content.systemPrompt && content.systemPrompt.length < 50) {
      errors.push({
        code: 'CONTENT_TOO_SHORT',
        message: 'Skill content is too short. Provide meaningful instructions.',
        field: 'content.systemPrompt'
      });
    }

    return errors;
  }

  /**
   * Check if version is valid semantic version
   */
  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version);
  }

  /**
   * Check if name is valid
   */
  private isValidName(name: string): boolean {
    return /^[a-z0-9-_]+$/.test(name);
  }

  /**
   * Serialize package for signing (exclude signature and checksum)
   */
  private serializeForSigning(skillPackage: SkillPackage): string {
    const { signature, metadata, ...rest } = skillPackage;
    const { checksum, ...restMetadata } = metadata;
    return JSON.stringify({ ...rest, metadata: restMetadata });
  }
}

// Singleton instance
export const skillPackageManager = new SkillPackageManager();
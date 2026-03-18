/**
 * Sharing Types - Type definitions for skill sharing functionality
 *
 * Defines interfaces for skill packages, registry integration, and import/export
 */

import { SkillPatch } from '../core/patcher';
import { WorkspaceConstraint } from '../core/workspace';
import { SecurityScanResult } from './security';

/**
 * Skill manifest (similar to package.json)
 */
export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  keywords: string[];
  repository?: string;
  homepage?: string;
  main: string;
  compatibility: {
    minVersion?: string;
    maxVersion?: string;
    platforms: SkillPlatform[];
  };
}

/**
 * Supported skill platforms
 */
export type SkillPlatform = 'claude-code' | 'openclaw' | 'cline' | 'cursor' | 'windsurf' | 'generic';

/**
 * Skill content structure
 */
export interface SkillContent {
  systemPrompt: string;
  patches?: SkillPatch[];
  constraints?: WorkspaceConstraint[];
  dependencies?: SkillDependency[];
  metadata?: Record<string, unknown>;
}

/**
 * Skill package - Complete skill bundle for sharing
 */
export interface SkillPackage {
  id: string;
  manifest: SkillManifest;
  content: SkillContent;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    securityScan?: SecurityScanResult;
    checksum?: string;
  };
  signature?: string;
}

/**
 * Skill dependency reference
 */
export interface SkillDependency {
  name: string;
  version: string;
  type: 'required' | 'optional';
  source?: string;
}

/**
 * Registry entry - Skill listing from a registry
 */
export interface RegistryEntry {
  id: string;
  name: string;
  latestVersion: string;
  versions: string[];
  author: string;
  description: string;
  tags: string[];
  downloads: number;
  rating?: number;
  verified: boolean;
  publishedAt: Date;
  updatedAt: Date;
  homepage?: string;
  repository?: string;
}

/**
 * Registry search options
 */
export interface RegistrySearchOptions {
  query?: string;
  tags?: string[];
  author?: string;
  sortBy?: 'downloads' | 'rating' | 'updated' | 'name';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  platform?: SkillPlatform;
}

/**
 * Skill import options
 */
export interface SkillImportOptions {
  overwrite?: boolean;
  validateSignature?: boolean;
  validateSecurity?: boolean;
  importPatches?: boolean;
  importConstraints?: boolean;
  importDependencies?: boolean;
  targetPath?: string;
  rename?: string;
}

/**
 * Skill export options
 */
export interface SkillExportOptions {
  format: 'json' | 'yaml' | 'zip';
  includePatches?: boolean;
  includeConstraints?: boolean;
  includeHistory?: boolean;
  includeSecurityScan?: boolean;
  includeReadme?: boolean;
  sign?: boolean;
  outputPath?: string;
  pretty?: boolean;
}

/**
 * Registry configuration
 */
export interface RegistryConfig {
  url: string;
  name: string;
  authToken?: string;
  cachePath: string;
  cacheTTL: number;
  timeout?: number;
}

/**
 * Registry type
 */
export type RegistryType = 'skills-sh' | 'custom';

/**
 * Published skill info
 */
export interface PublishedSkill {
  registryId: string;
  registry: RegistryType;
  name: string;
  version: string;
  publishedAt: Date;
  url: string;
}

/**
 * Validation result for skill packages
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  recommendation?: string;
}

/**
 * Package file for bundling
 */
export interface PackageFile {
  path: string;
  content: string | Buffer;
  encoding?: 'utf-8' | 'binary';
}

/**
 * Export format
 */
export type ExportFormat = 'json' | 'yaml' | 'zip';

/**
 * Import source
 */
export interface ImportSource {
  type: 'file' | 'url' | 'registry';
  path?: string;
  url?: string;
  registry?: RegistryType;
  name?: string;
  version?: string;
}
/**
 * Skill Exporter - Export and import functionality for skills
 *
 * Handles JSON/YAML/ZIP export and import of skill packages
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import archiver from 'archiver';
import {
  SkillPackage,
  SkillExportOptions,
  SkillImportOptions,
  ValidationResult
} from '../../types/sharing';
import { SkillPackageManager, skillPackageManager } from './package';
import { SecurityEvaluator, securityEvaluator } from '../security';

/**
 * SkillExporter class
 */
export class SkillExporter {
  private packageManager: SkillPackageManager;
  private securityEvaluator: SecurityEvaluator;

  constructor() {
    this.packageManager = skillPackageManager;
    this.securityEvaluator = securityEvaluator;
  }

  /**
   * Export a skill to JSON format
   */
  exportToJson(skillPackage: SkillPackage, options: SkillExportOptions = { format: 'json' }): string {
    const exportData = this.prepareExport(skillPackage, options);
    const indent = options.pretty !== false ? 2 : 0;
    return JSON.stringify(exportData, null, indent);
  }

  /**
   * Export a skill to YAML format
   */
  exportToYaml(skillPackage: SkillPackage, options: SkillExportOptions = { format: 'yaml' }): string {
    const exportData = this.prepareExport(skillPackage, options);
    return yaml.dump(exportData, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: true
    });
  }

  /**
   * Export a skill to a file
   */
  exportToFile(skillPackage: SkillPackage, filePath: string, options: SkillExportOptions = { format: 'json' }): void {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (options.format === 'zip' || filePath.endsWith('.zip')) {
      this.exportToZip(skillPackage, filePath, options);
      return;
    }

    const content = options.format === 'yaml'
      ? this.exportToYaml(skillPackage, options)
      : this.exportToJson(skillPackage, options);

    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * Export a skill to ZIP format
   */
  exportToZip(skillPackage: SkillPackage, filePath: string, options: SkillExportOptions = { format: 'zip' }): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`ZIP created: ${filePath}`);
    });
    archive.on('error', (err: Error) => {
      throw err;
    });

    archive.pipe(output);

    // Add skill.json (manifest)
    archive.append(JSON.stringify(skillPackage.manifest, null, 2), { name: 'skill.json' });

    // Add skill.md (system prompt)
    archive.append(skillPackage.content.systemPrompt, { name: 'skill.md' });

    // Add README.md
    if (options.includeReadme !== false) {
      const readme = this.generateReadme(skillPackage);
      archive.append(readme, { name: 'README.md' });
    }

    // Add patches if present
    if (options.includePatches !== false && skillPackage.content.patches?.length) {
      archive.append(JSON.stringify(skillPackage.content.patches, null, 2), { name: 'patches.json' });
    }

    // Add constraints if present
    if (options.includeConstraints !== false && skillPackage.content.constraints?.length) {
      archive.append(JSON.stringify(skillPackage.content.constraints, null, 2), { name: 'constraints.json' });
    }

    // Add metadata
    archive.append(JSON.stringify({
      createdAt: skillPackage.metadata.createdAt,
      updatedAt: skillPackage.metadata.updatedAt,
      checksum: skillPackage.metadata.checksum,
      securityScan: options.includeSecurityScan ? skillPackage.metadata.securityScan : undefined
    }, null, 2), { name: 'metadata.json' });

    archive.finalize();
  }

  /**
   * Export an OpenClaw skill directory to ZIP
   */
  exportOpenClawSkill(skillPath: string, outputPath: string): void {
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill path not found: ${skillPath}`);
    }

    const skillName = path.basename(skillPath);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    // Read SKILL.md content
    let systemPrompt = '';
    if (fs.existsSync(skillMdPath)) {
      systemPrompt = fs.readFileSync(skillMdPath, 'utf-8');
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`ZIP created: ${outputPath}`);
    });
    archive.on('error', (err: Error) => {
      throw err;
    });

    archive.pipe(output);

    // Add entire skill directory
    archive.directory(skillPath, skillName);

    // Add skill.json manifest
    const manifest = {
      name: skillName,
      version: '1.0.0',
      description: `OpenClaw skill: ${skillName}`,
      author: 'OpenClaw',
      license: 'MIT',
      main: 'SKILL.md',
      compatibility: {
        platforms: ['openclaw', 'claude-code']
      }
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: path.join(skillName, 'skill.json') });

    // Add README
    const readme = `# ${skillName}

OpenClaw Skill Package

## Structure
- \`SKILL.md\` - Main skill prompt
- \`reference/\` - Reference documents
- \`scripts/\` - Executable scripts
- \`tests/\` - Test files
- \`evals/\` - Evaluation configs

## Usage
Import with: \`sa get ${skillName}\`

---
Exported from OpenClaw by Skill-Adapter v1.2.0
`;
    archive.append(readme, { name: path.join(skillName, 'README.md') });

    archive.finalize();
  }

  /**
   * Export all OpenClaw skills to a directory
   */
  exportAllOpenClawSkills(outputDir: string): string[] {
    const openClawSkillsPath = this.findOpenClawSkillsPath();
    if (!openClawSkillsPath) {
      throw new Error('OpenClaw skills folder not found');
    }

    const skills = fs.readdirSync(openClawSkillsPath).filter(f => {
      const skillPath = path.join(openClawSkillsPath, f);
      return fs.statSync(skillPath).isDirectory();
    });

    const exported: string[] = [];
    for (const skillName of skills) {
      const skillPath = path.join(openClawSkillsPath, skillName);
      const outputPath = path.join(outputDir, `${skillName}.zip`);
      try {
        this.exportOpenClawSkill(skillPath, outputPath);
        exported.push(skillName);
      } catch (err) {
        console.error(`Failed to export ${skillName}:`, err);
      }
    }

    return exported;
  }

  /**
   * Find OpenClaw skills path
   */
  private findOpenClawSkillsPath(): string | null {
    const possiblePaths = [
      path.join(process.env.USERPROFILE || '', '.openclaw', 'skills'),
      path.join(process.env.APPDATA || '', 'openclaw', 'skills'),
      path.join(process.env.HOME || '', 'Library', 'Application Support', 'openclaw', 'skills'),
      path.join(process.env.HOME || '', '.openclaw', 'skills'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Generate README content
   */
  private generateReadme(skillPackage: SkillPackage): string {
    const m = skillPackage.manifest;
    return `# ${m.name}

${m.description || 'A skill package for AI assistants.'}

## Information

- **Version**: ${m.version}
- **Author**: ${m.author || 'Unknown'}
- **License**: ${m.license}
- **Keywords**: ${m.keywords?.join(', ') || 'None'}

## Compatibility

Platforms: ${m.compatibility?.platforms?.join(', ') || 'claude-code, openclaw'}

## Usage

Import this skill using:
\`\`\`bash
sa get ${m.name}
\`\`\`

## Files

- \`skill.json\` - Skill manifest
- \`skill.md\` - System prompt
- \`README.md\` - This file

---
Generated by Skill-Adapter v1.2.0
`;
  }

  /**
   * Import a skill from JSON
   */
  importFromJson(jsonContent: string, options: SkillImportOptions = {}): SkillPackage {
    try {
      const data = JSON.parse(jsonContent);
      return this.processImport(data, options);
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Import a skill from YAML
   */
  importFromYaml(yamlContent: string, options: SkillImportOptions = {}): SkillPackage {
    try {
      const data = yaml.load(yamlContent);
      return this.processImport(data as Record<string, unknown>, options);
    } catch (error) {
      throw new Error(`Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Import a skill from a file
   */
  importFromFile(filePath: string, options: SkillImportOptions = {}): SkillPackage {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      return this.importFromYaml(content, options);
    }

    return this.importFromJson(content, options);
  }

  /**
   * Import a skill from URL
   */
  async importFromUrl(url: string, options: SkillImportOptions = {}): Promise<SkillPackage> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      const urlPath = new URL(url).pathname;

      if (urlPath.endsWith('.yaml') || urlPath.endsWith('.yml')) {
        return this.importFromYaml(content, options);
      }

      return this.importFromJson(content, options);
    } catch (error) {
      throw new Error(`Failed to import from URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate a skill package
   */
  validate(skillPackage: SkillPackage): ValidationResult {
    return this.packageManager.validate(skillPackage);
  }

  /**
   * Create a skill package from existing data
   */
  createPackage(
    name: string,
    content: { systemPrompt: string; patches?: unknown[]; constraints?: unknown[] },
    manifest: Partial<{ version: string; description: string; author: string; license: string; keywords: string[] }>
  ): SkillPackage {
    return this.packageManager.create(name, {
      systemPrompt: content.systemPrompt,
      patches: content.patches as never[],
      constraints: content.constraints as never[]
    }, manifest);
  }

  /**
   * Prepare export data based on options
   */
  private prepareExport(skillPackage: SkillPackage, options: SkillExportOptions): Record<string, unknown> {
    const exportData: Record<string, unknown> = {
      manifest: skillPackage.manifest,
      content: {} as Record<string, unknown>
    };

    // Always include system prompt
    (exportData.content as Record<string, unknown>).systemPrompt = skillPackage.content.systemPrompt;

    // Conditionally include patches
    if (options.includePatches !== false && skillPackage.content.patches) {
      (exportData.content as Record<string, unknown>).patches = skillPackage.content.patches;
    }

    // Conditionally include constraints
    if (options.includeConstraints !== false && skillPackage.content.constraints) {
      (exportData.content as Record<string, unknown>).constraints = skillPackage.content.constraints;
    }

    // Conditionally include dependencies
    if (skillPackage.content.dependencies) {
      (exportData.content as Record<string, unknown>).dependencies = skillPackage.content.dependencies;
    }

    // Add metadata
    exportData.metadata = {
      createdAt: skillPackage.metadata.createdAt,
      updatedAt: skillPackage.metadata.updatedAt
    };

    // Conditionally include checksum
    if (skillPackage.metadata.checksum) {
      (exportData.metadata as Record<string, unknown>).checksum = skillPackage.metadata.checksum;
    }

    // Conditionally include signature
    if (options.sign && skillPackage.signature) {
      exportData.signature = skillPackage.signature;
    }

    return exportData;
  }

  /**
   * Process imported data
   */
  private processImport(data: Record<string, unknown>, options: SkillImportOptions): SkillPackage {
    // Validate required fields
    if (!data.manifest) {
      throw new Error('Invalid skill package: missing manifest');
    }
    if (!data.content) {
      throw new Error('Invalid skill package: missing content');
    }

    const manifest = data.manifest as Record<string, unknown>;
    const content = data.content as Record<string, unknown>;

    // Validate security if requested
    if (options.validateSecurity && content.systemPrompt) {
      const securityResult = this.securityEvaluator.scan(
        content.systemPrompt as string,
        manifest.name as string
      );
      if (!securityResult.passed) {
        throw new Error(`Security validation failed: ${securityResult.riskAssessment.summary}`);
      }
    }

    // Validate signature if requested
    if (options.validateSignature && data.signature) {
      // Would need public key for verification
      console.warn('Signature validation requires public key');
    }

    // Create package
    const skillPackage: SkillPackage = {
      id: (data.id as string) || this.generateId(),
      manifest: manifest as unknown as SkillPackage['manifest'],
      content: {
        systemPrompt: content.systemPrompt as string,
        patches: options.importPatches !== false ? (content.patches as SkillPackage['content']['patches']) : undefined,
        constraints: options.importConstraints !== false ? (content.constraints as SkillPackage['content']['constraints']) : undefined,
        dependencies: options.importDependencies !== false ? (content.dependencies as SkillPackage['content']['dependencies']) : undefined
      },
      metadata: {
        createdAt: new Date((data.metadata as Record<string, unknown>)?.createdAt as string || Date.now()),
        updatedAt: new Date((data.metadata as Record<string, unknown>)?.updatedAt as string || Date.now()),
        checksum: (data.metadata as Record<string, unknown>)?.checksum as string
      },
      signature: data.signature as string
    };

    // Validate package
    const validation = this.packageManager.validate(skillPackage);
    if (!validation.valid) {
      throw new Error(`Invalid skill package: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Rename if requested
    if (options.rename) {
      skillPackage.manifest.name = options.rename;
    }

    return skillPackage;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const skillExporter = new SkillExporter();
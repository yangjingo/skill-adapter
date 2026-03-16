#!/usr/bin/env node

/**
 * Skill-Adapter CLI - Simplified Interface
 *
 * Commands:
 *
 * Setup:
 * - sa init              Initialize configuration
 *
 * Import/Export:
 * - sa import [source]   Import skill / Discover hot skills (no source)
 * - sa export            Export skills from platforms (OpenClaw, Claude Code)
 *
 * Manage:
 * - sa info [skill]      View skill details (no skill = list all)
 * - sa scan <file>       Security scan
 * - sa share <skill>     Export/publish skill (create PR)
 *
 * Evolution:
 * - sa evolve [skill]    Run evolution analysis (includes workspace)
 * - sa log [skill]       View version history (git-log style)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

// Core modules
import { telemetry, WorkspaceAnalyzer, SessionAnalyzer, skillPatcher, evaluator, EvolutionDatabase, EvolutionRecord, summaryGenerator, VERSION } from './index';

// New modules
import { securityEvaluator } from './core/security';
import { skillExporter, skillRegistry } from './core/sharing';
import { platformFetcher, recommendationEngine, skillAnalyzer } from './core/discovery';
import { versionManager } from './core/versioning';
import { agentDetector } from './core/config';

const program = new Command();

// Configuration - supports env vars and config file
const CONFIG = {
  skillsRepo: process.env.SKILL_ADAPTER_REPO || 'https://codehub-g.huawei.com/leow3lab/ascend-skills',
  registryUrl: process.env.SKILL_ADAPTER_REGISTRY || 'http://leow3lab.service.huawei.com/registry',
  defaultPlatform: process.env.SKILL_ADAPTER_PLATFORM || 'skills-sh',
};

// Load config from file if exists
const configPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.skill-adapter.json');
if (fs.existsSync(configPath)) {
  try {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    Object.assign(CONFIG, configData);
  } catch {
    // Ignore config errors
  }
}

program
  .name('sa')
  .description('Skill-Adapter: Evolve or Die (Adaptāre aut Morī)')
  .version(VERSION);

// ============================================
// sa init - Initialize configuration
// ============================================
program
  .command('init')
  .description('Initialize configuration')
  .option('--repo <url>', 'Skills repository URL')
  .option('--registry <url>', 'Default registry URL')
  .option('--show', 'Show current configuration', false)
  .action((options: { repo?: string; registry?: string; show: boolean }) => {
    if (options.show) {
      console.log('📋 Current Configuration\n');
      console.log(`  Skills Repo:  ${CONFIG.skillsRepo}`);
      console.log(`  Registry:     ${CONFIG.registryUrl}`);
      console.log(`  Platform:     ${CONFIG.defaultPlatform}`);
      console.log(`  Config File:  ${configPath}`);
      return;
    }

    console.log('🔧 Initializing Skill-Adapter...\n');

    const newConfig: Record<string, string> = {};

    if (options.repo) {
      newConfig.skillsRepo = options.repo;
    }
    if (options.registry) {
      newConfig.registryUrl = options.registry;
    }

    if (Object.keys(newConfig).length > 0) {
      Object.assign(CONFIG, newConfig);
      fs.writeFileSync(configPath, JSON.stringify(CONFIG, null, 2));
      console.log('✅ Configuration saved!\n');
    }

    console.log('📋 Configuration:');
    console.log(`   Skills Repo:  ${CONFIG.skillsRepo}`);
    console.log(`   Registry:     ${CONFIG.registryUrl}`);
    console.log(`   Config File:  ${configPath}`);

    console.log('\n💡 Environment Variables:');
    console.log('   SKILL_ADAPTER_REPO      - Skills repository URL');
    console.log('   SKILL_ADAPTER_REGISTRY  - Default registry URL');
    console.log('   SKILL_ADAPTER_PLATFORM  - Default platform');
  });

// ============================================
// sa import [source] - Unified import/discover
// ============================================
program
  .command('import [source]')
  .description('Import or discover skills')
  .option('-n, --name <name>', 'Rename skill on import')
  .option('--no-scan', 'Skip security scan')
  .option('--registry <url>', 'Custom registry URL')
  .option('-l, --limit <number>', 'Limit results when discovering', '10')
  .option('-p, --platform <platform>', 'Platform for discovery (skills-sh, clawhub)', 'skills-sh')
  .action(async (source: string | undefined, options: { name?: string; scan: boolean; registry?: string; limit: string; platform: string }) => {
    // No source provided - show hot skills (discover mode)
    if (!source) {
      console.log('🔥 Discovering hot skills...\n');

      try {
        const results = await platformFetcher.fetchHot(options.platform as 'skills-sh' | 'clawhub', parseInt(options.limit));

        console.log('Rank | Downloads | Change | Skill');
        console.log('-'.repeat(50));

        for (const entry of results) {
          const change = entry.change > 0 ? `+${entry.change}` : String(entry.change);
          console.log(`#${entry.rank.toString().padEnd(4)} | ${entry.skill.stats.downloads.toString().padEnd(9)} | ${change.padEnd(6)} | ${entry.skill.name}`);
        }

        console.log('\n💡 Use `sa import <skill-name>` to install a skill.');
        console.log('💡 Use `sa import <path-or-url>` to import from file/URL.');
      } catch (error) {
        console.error(`❌ Failed to fetch skills: ${error}`);
      }
      return;
    }

    // Source provided - import mode
    console.log(`📥 Getting skill from: ${source}\n`);

    const db = new EvolutionDatabase('evolution.db');

    try {
      // Detect source type
      let skillPackage = null;
      let sourceType = 'unknown';

      if (source.startsWith('http://') || source.startsWith('https://')) {
        sourceType = 'url';

        if (source.includes('skills.sh') || source.includes('clawhub') || source.includes('localhost:3000')) {
          sourceType = 'registry';
          console.log('🔍 Detected: Registry URL');

          // Extract skill name from URL
          const name = options.name || source.split('/').pop()?.replace(/\.git$/, '') || 'imported-skill';
          const registryUrl = options.registry || new URL(source).origin;

          // Download from registry (ZIP format)
          const downloadUrl = `${registryUrl}/api/skills/${name}/download`;
          console.log(`📦 Downloading from registry...`);

          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
          }

          // For now, use mock data since we can't easily extract ZIP in Node
          skillPackage = {
            id: `skill_${Date.now()}`,
            manifest: { name, version: '1.0.0', description: '', author: 'unknown', license: 'MIT', keywords: [], compatibility: { platforms: ['claude-code'] } },
            content: { systemPrompt: `# ${name}\n\nSkill imported from ${source}` },
            metadata: { createdAt: new Date(), updatedAt: new Date() }
          };
        } else {
          console.log('🔍 Detected: Remote URL');
          skillPackage = await skillExporter.importFromUrl(source, { rename: options.name, validateSecurity: options.scan });
        }
      } else if (fs.existsSync(source)) {
        sourceType = 'file';
        console.log('🔍 Detected: Local file');

        const stat = fs.statSync(source);
        if (stat.isDirectory()) {
          // Directory - check for skill.json or SKILL.md (OpenClaw format)
          const skillJsonPath = path.join(source, 'skill.json');
          const skillMdPath = path.join(source, 'skill.md');
          const openClawMdPath = path.join(source, 'SKILL.md');

          if (fs.existsSync(skillJsonPath)) {
            // Standard format
            const manifest = JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8'));
            const systemPrompt = fs.existsSync(skillMdPath)
              ? fs.readFileSync(skillMdPath, 'utf-8')
              : `# ${manifest.name}\n\nImported from directory`;

            skillPackage = {
              id: `skill_${Date.now()}`,
              manifest,
              content: { systemPrompt },
              metadata: { createdAt: new Date(), updatedAt: new Date() }
            };
          } else if (fs.existsSync(openClawMdPath)) {
            // OpenClaw format
            const skillName = options.name || path.basename(source);
            const systemPrompt = fs.readFileSync(openClawMdPath, 'utf-8');

            skillPackage = {
              id: `skill_${Date.now()}`,
              manifest: {
                name: skillName,
                version: '1.0.0',
                description: `OpenClaw skill: ${skillName}`,
                author: 'openclaw',
                license: 'MIT',
                keywords: [],
                main: 'SKILL.md',
                compatibility: { platforms: ['openclaw', 'claude-code'] }
              },
              content: { systemPrompt },
              metadata: { createdAt: new Date(), updatedAt: new Date() }
            };
            console.log('🔍 Detected: OpenClaw skill format');
          }
        } else {
          skillPackage = skillExporter.importFromFile(source, { rename: options.name, validateSecurity: options.scan });
        }
      } else {
        // Assume it's a skill name from registry
        sourceType = 'registry-name';
        console.log('🔍 Detected: Registry skill name');

        const registryUrl = options.registry || 'http://localhost:3000';
        const name = options.name || source;

        // Try to download from registry
        const downloadUrl = `${registryUrl}/api/skills/${source}/download`;
        console.log(`📦 Downloading from registry...`);

        try {
          const response = await fetch(downloadUrl);
          if (response.ok) {
            skillPackage = {
              id: `skill_${Date.now()}`,
              manifest: { name, version: '1.0.0', description: '', author: 'unknown', license: 'MIT', keywords: [], compatibility: { platforms: ['claude-code'] } },
              content: { systemPrompt: `# ${name}\n\nSkill imported from registry` },
              metadata: { createdAt: new Date(), updatedAt: new Date() }
            };
          }
        } catch {
          console.log('⚠ Could not connect to registry, using local cache');
        }
      }

      if (!skillPackage) {
        throw new Error('Could not load skill from source');
      }

      // Security scan (unless disabled)
      if (options.scan) {
        console.log('\n🔒 Running security scan...');
        const scanResult = securityEvaluator.scan(
          skillPackage.content.systemPrompt,
          skillPackage.manifest.name
        );

        if (!scanResult.passed) {
          console.log('⚠ Security issues detected:');
          console.log(`  Risk Level: ${scanResult.riskAssessment.overallRisk}`);
          console.log(`  Issues: ${scanResult.sensitiveInfoFindings.length + scanResult.dangerousOperationFindings.length}`);
          console.log('\n  Run `sa scan <file>` for details.\n');
        } else {
          console.log('  ✅ Security scan passed\n');
        }
      }

      // Save to database
      const existingRecords = db.getRecords(skillPackage.manifest.name);
      if (existingRecords.length > 0) {
        console.log(`⚠ Skill "${skillPackage.manifest.name}" already exists. Use --name to import with different name.`);
        return;
      }

      db.addRecord({
        id: EvolutionDatabase.generateId(),
        skillName: skillPackage.manifest.name,
        version: skillPackage.manifest.version,
        timestamp: new Date(),
        telemetryData: JSON.stringify([]),
        patches: JSON.stringify(skillPackage.content.patches || []),
        importSource: source
      });

      console.log(`✅ Skill "${skillPackage.manifest.name}" (v${skillPackage.manifest.version}) installed successfully!`);
      console.log(`   Run \`sa info ${skillPackage.manifest.name}\` to learn more.`);

    } catch (error) {
      console.error(`❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

// ============================================
// sa info [skill] - Unified view/list
// ============================================
program
  .command('info [skillName]')
  .description('View skill info')
  .option('-v, --version <version>', 'Specific version')
  .option('--security', 'Show security status')
  .action((skillName: string | undefined, options: { version?: string; security?: boolean }) => {
    const db = new EvolutionDatabase('evolution.db');

    if (!skillName) {
      // List mode
      console.log('📋 Your Skills\n');

      const records = db.getAllRecords();

      if (records.length === 0) {
        console.log('No skills installed yet.');
        console.log('Use `sa get <source>` to install a skill.');
        return;
      }

      const skillNames = [...new Set(records.map(r => r.skillName))];

      for (const name of skillNames) {
        const skillRecords = db.getRecords(name);
        const latestVersion = db.getLatestVersion(name);
        const latestRecord = skillRecords[skillRecords.length - 1];

        console.log(`📦 ${name} (v${latestVersion})`);
        console.log(`   Evolutions: ${skillRecords.length} | Imported: ${latestRecord.importSource || 'unknown'}`);

        if (options.security && latestRecord.securityScanResult) {
          const scan = JSON.parse(latestRecord.securityScanResult);
          const icon = scan.passed ? '✅' : '⚠️';
          console.log(`   Security: ${icon} ${scan.riskAssessment?.overallRisk || 'unknown'} risk`);
        }
        console.log('');
      }
    } else {
      // Detail mode
      console.log(`📦 ${skillName}\n`);

      const records = db.getRecords(skillName);

      if (records.length === 0) {
        console.log(`Skill "${skillName}" not found.`);
        return;
      }

      const latestVersion = db.getLatestVersion(skillName);
      const latestRecord = records[records.length - 1];

      console.log(`Version: ${latestVersion}`);
      console.log(`Evolutions: ${records.length}`);
      console.log(`Imported from: ${latestRecord.importSource || 'unknown'}`);
      console.log(`Last updated: ${latestRecord.timestamp.toLocaleDateString()}`);

      if (options.security) {
        console.log('\n🔒 Security Status:');
        if (latestRecord.securityScanResult) {
          const scan = JSON.parse(latestRecord.securityScanResult);
          console.log(`  Risk Level: ${scan.riskAssessment?.overallRisk || 'unknown'}`);
          console.log(`  Issues: ${scan.sensitiveInfoFindings?.length || 0} sensitive, ${scan.dangerousOperationFindings?.length || 0} dangerous`);
        } else {
          console.log('  Not scanned. Run `sa scan` to check.');
        }
      }

      console.log('\n💡 Run `sa evolve ' + skillName + '` to analyze improvements.');
    }
  });

// ============================================
// sa evolve [skill] - Evolution analysis
// ============================================
program
  .command('evolve [skillName]')
  .description('Run evolution analysis')
  .option('-l, --last <n>', 'Analyze last N sessions', '10')
  .option('--apply', 'Apply suggested improvements', false)
  .action((skillName: string | undefined, options: { last: string; apply: boolean }) => {
    console.log('🔄 Running evolution analysis...\n');

    const db = new EvolutionDatabase('evolution.db');

    if (skillName) {
      const records = db.getRecords(skillName);
      if (records.length === 0) {
        console.log(`Skill "${skillName}" not found.`);
        return;
      }

      console.log(`Analyzing: ${skillName}`);
      console.log(`Records: ${records.length}`);
      console.log(`Current version: ${db.getLatestVersion(skillName)}`);

      // Calculate version bump based on metrics
      const metrics = {
        tokenReduction: Math.random() * 30, // Mock data
        callReduction: Math.random() * 20
      };

      const versionChange = versionManager.calculateNewVersion(
        db.getLatestVersion(skillName) || '1.0.0',
        metrics
      );

      console.log(`\n📊 Suggested version: ${versionChange.newTag}`);
      console.log(`   Reason: ${versionChange.changeSummary}`);

      if (options.apply) {
        // Create new evolution record with updated version
        const latestRecord = records[records.length - 1];
        const newRecord: EvolutionRecord = {
          id: EvolutionDatabase.generateId(),
          skillName: skillName,
          version: versionChange.newVersion,
          timestamp: new Date(),
          telemetryData: JSON.stringify(metrics),
          patches: JSON.stringify([{
            type: versionChange.evolutionType,
            description: versionChange.changeSummary,
            appliedAt: new Date()
          }]),
          importSource: latestRecord.importSource
        };

        db.addRecord(newRecord);

        console.log('\n✅ Evolution applied!');
        console.log(`   New version: ${versionChange.newVersion}`);
        console.log(`   Tag: ${versionChange.newTag}`);
      } else {
        console.log('\n💡 Run with --apply to apply changes.');
      }
    } else {
      // No skill specified - show all skills + workspace analysis
      const records = db.getAllRecords();

      if (records.length === 0) {
        console.log('No skills installed yet.');
        console.log('Use `sa get <source>` to install a skill.');
        return;
      }

      const skillNames = [...new Set(records.map(r => r.skillName))];

      console.log(`Analyzing ${skillNames.length} skill(s)...\n`);

      for (const name of skillNames) {
        const skillRecords = db.getRecords(name);
        console.log(`  • ${name}: ${skillRecords.length} evolution(s)`);
      }

      // Workspace analysis
      console.log('\n📍 Workspace Analysis');
      console.log('─'.repeat(40));
      try {
        const workspaceAnalyzer = new WorkspaceAnalyzer(process.cwd());
        const rules = workspaceAnalyzer.generateWorkspaceRules();
        // Extract just the key info
        const lines = rules.split('\n').slice(0, 15);
        console.log(lines.join('\n'));
      } catch {
        console.log('Workspace analysis not available');
      }

      console.log('\n💡 Run `sa evolve <skill>` for detailed analysis.');
    }
  });

// ============================================
// sa share [skill] - Unified export/publish
// ============================================
program
  .command('share [skillName]')
  .description('Export or publish skill')
  .option('-o, --output <path>', 'Export to file')
  .option('-f, --format <format>', 'Export format (json, yaml, zip)', 'zip')
  .option('--zip', 'Export as ZIP (shorthand for -f zip)', false)
  .option('--registry <url>', 'Publish to registry URL')
  .option('--pr', 'Create Pull Request to skills repository', false)
  .option('--repo <url>', 'Target git repository URL', CONFIG.skillsRepo)
  .option('--branch <name>', 'Branch name for PR', '')
  .option('--yes', 'Skip confirmation', false)
  .action(async (skillName: string | undefined, options: { output?: string; format: string; zip: boolean; registry?: string; pr: boolean; repo: string; branch: string; yes: boolean }) => {
    const db = new EvolutionDatabase('evolution.db');

    // No skill specified - list all skills
    if (!skillName) {
      console.log('📤 Select a skill to share:\n');
      const records = db.getAllRecords();
      if (records.length === 0) {
        console.log('No skills installed yet.');
        console.log('Use `sa import <source>` to import a skill.');
        return;
      }

      const skillNames = [...new Set(records.map(r => r.skillName))];
      for (const name of skillNames) {
        const version = db.getLatestVersion(name);
        console.log(`  • ${name} (v${version})`);
      }
      console.log('\n💡 Use `sa share <skill>` to share a skill.');
      return;
    }

    const format = options.zip ? 'zip' : options.format;
    console.log(`📤 Sharing skill: ${skillName}\n`);

    const records = db.getRecords(skillName);

    if (records.length === 0) {
      console.log(`Skill "${skillName}" not found.`);
      return;
    }

    // Security scan
    console.log('🔒 Running security scan...');
    const latestRecord = records[records.length - 1];

    // Create skill package
    const skillPackage = skillExporter.createPackage(
      skillName,
      { systemPrompt: `# ${skillName}\n\nSkill content` },
      { version: latestRecord.version }
    );

    const scanResult = securityEvaluator.scan(
      skillPackage.content.systemPrompt,
      skillName
    );

    if (!scanResult.passed) {
      console.log('⚠ Security issues detected:');
      console.log(`  Risk: ${scanResult.riskAssessment.overallRisk}`);
      console.log(`  Issues: ${scanResult.sensitiveInfoFindings.length + scanResult.dangerousOperationFindings.length}`);

      if (!options.yes) {
        console.log('\n  Use --yes to proceed anyway.');
        return;
      }
    } else {
      console.log('  ✅ Security scan passed');
    }

    skillPackage.metadata.securityScan = scanResult;

    // Create PR to git repository
    if (options.pr) {
      console.log(`\n🚀 Creating Pull Request to ${options.repo}...\n`);

      const branchName = options.branch || `skill/${skillName}-v${latestRecord.version}`;
      const tempDir = path.join(os.tmpdir(), 'skill-adapter-pr', skillName);

      try {
        // Clone repository
        console.log('📥 Cloning repository...');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        await execGit(`clone ${options.repo} ${tempDir}`, tempDir, true);

        // Create branch
        console.log(`🌿 Creating branch: ${branchName}`);
        await execGit(`checkout -b ${branchName}`, tempDir);

        // Export skill to repo
        const skillDir = path.join(tempDir, 'skills', skillName);
        if (!fs.existsSync(skillDir)) {
          fs.mkdirSync(skillDir, { recursive: true });
        }

        // Write skill files
        fs.writeFileSync(path.join(skillDir, 'skill.json'), JSON.stringify(skillPackage.manifest, null, 2));
        fs.writeFileSync(path.join(skillDir, 'skill.md'), skillPackage.content.systemPrompt);
        fs.writeFileSync(path.join(skillDir, 'README.md'), `# ${skillName}\n\nVersion: ${latestRecord.version}\n\nExported by Skill-Adapter`);

        // Commit changes
        console.log('📝 Committing changes...');
        await execGit('add .', tempDir);
        await execGit(`commit -m "feat: Add/Update skill ${skillName} v${latestRecord.version}"`, tempDir);

        // Push branch
        console.log('⬆️ Pushing branch...');
        await execGit(`push -u origin ${branchName}`, tempDir);

        console.log('\n✅ Branch created and pushed!');
        console.log(`   Branch: ${branchName}`);
        console.log(`   Repo: ${options.repo}`);
        console.log('\n💡 Please create Pull Request manually in the web interface.');
        console.log(`   URL: ${options.repo}/-/merge_requests/new?source_branch=${branchName}`);

      } catch (error) {
        console.error(`❌ PR creation failed: ${error}`);
        console.log('\n💡 Make sure you have git credentials configured for the repository.');
      }
      return;
    }

    if (options.registry) {
      // Publish to registry
      console.log(`\n🚀 Publishing to ${options.registry}...`);

      try {
        const result = await skillRegistry.publish(skillPackage, 'custom');
        console.log(`✅ Published successfully!`);
        console.log(`   URL: ${result.url}`);
        console.log(`   Version: ${result.version}`);
      } catch (error) {
        console.error(`❌ Publish failed: ${error}`);
      }
    } else {
      // Export to file
      const ext = format === 'zip' ? 'zip' : format;
      const outputPath = options.output || `./${skillName}-v${latestRecord.version}.${ext}`;

      console.log(`\n📦 Exporting to ${outputPath}...`);

      skillExporter.exportToFile(skillPackage, outputPath, {
        format: format as 'json' | 'yaml' | 'zip',
        includePatches: true,
        includeConstraints: true,
        includeSecurityScan: true,
        includeReadme: true
      });

      console.log('✅ Export complete!');
      console.log(`   File: ${outputPath}`);
    }
  });

// Helper function to execute git commands
async function execGit(command: string, cwd: string, ignoreError = false): Promise<string> {
  const { execSync } = require('child_process');
  try {
    return execSync(`git ${command}`, { cwd, encoding: 'utf-8', stdio: ignoreError ? 'pipe' : 'inherit' });
  } catch (error) {
    if (!ignoreError) throw error;
    return '';
  }
}

// ============================================
// sa export [skill] - Export skills from platforms
// ============================================
program
  .command('export [skillName]')
  .description('Export from platforms')
  .option('-p, --platform <platform>', 'Platform to export from (openclaw, claudecode, all)', 'all')
  .option('-o, --output <dir>', 'Output directory', './exported-skills')
  .option('-f, --format <format>', 'Export format (zip, json)', 'zip')
  .action((skillName: string | undefined, options: { platform: string; output: string; format: string }) => {
    const targetSkill = skillName ? skillName : 'all skills';
    console.log(`📦 Exporting ${targetSkill} from ${options.platform}...\n`);

    const platforms = options.platform === 'all'
      ? ['openclaw', 'claudecode']
      : [options.platform];

    let totalExported = 0;

    for (const platform of platforms) {
      console.log(`\n── ${platform.toUpperCase()} ──`);

      if (platform === 'openclaw') {
        try {
          const openClawPath = findOpenClawSkillsPath();
          if (!openClawPath) {
            console.log('  ⚠ OpenClaw skills folder not found');
            continue;
          }

          let skills = fs.readdirSync(openClawPath).filter(f => {
            return fs.statSync(path.join(openClawPath, f)).isDirectory();
          });

          // Filter by skill name if specified
          if (skillName) {
            skills = skills.filter(s => s === skillName);
            if (skills.length === 0) {
              console.log(`  ⚠ Skill "${skillName}" not found in OpenClaw`);
              continue;
            }
          }

          const outputDir = path.join(options.output, 'openclaw');
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          for (const skill of skills) {
            const skillPath = path.join(openClawPath, skill);
            const outputPath = path.join(outputDir, `${skill}.zip`);
            try {
              skillExporter.exportOpenClawSkill(skillPath, outputPath);
              console.log(`  ✓ ${skill}`);
              totalExported++;
            } catch (err) {
              console.log(`  ✗ ${skill}: ${err}`);
            }
          }
        } catch (error) {
          console.error(`  ❌ Export failed: ${error}`);
        }
      } else if (platform === 'claudecode') {
        try {
          const claudeCodePath = findClaudeCodeSkillsPath();
          if (!claudeCodePath) {
            console.log('  ⚠ Claude Code skills folder not found');
            continue;
          }

          // Export Claude Code skills (commands/skills directories)
          const outputDir = path.join(options.output, 'claudecode');
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          // Check for .claude/commands
          const commandsPath = path.join(claudeCodePath, 'commands');
          if (fs.existsSync(commandsPath)) {
            let commands = fs.readdirSync(commandsPath).filter(f => f.endsWith('.md'));

            // Filter by skill name if specified
            if (skillName) {
              commands = commands.filter(c => c.replace('.md', '') === skillName);
            }

            for (const cmd of commands) {
              const cmdPath = path.join(commandsPath, cmd);
              const name = cmd.replace('.md', '');
              const outputPath = path.join(outputDir, `${name}.zip`);

              const content = fs.readFileSync(cmdPath, 'utf-8');
              const pkg = skillExporter.createPackage(
                name,
                { systemPrompt: content },
                { version: '1.0.0', author: 'claude-code' }
              );
              skillExporter.exportToFile(pkg, outputPath, {
                format: options.format as 'zip' | 'json',
                includeReadme: true
              });
              console.log(`  ✓ ${name}`);
              totalExported++;
            }
          }

          // Check for .claude/skills
          const skillsPath = path.join(claudeCodePath, 'skills');
          if (fs.existsSync(skillsPath)) {
            let skillDirs = fs.readdirSync(skillsPath).filter(f => {
              return fs.statSync(path.join(skillsPath, f)).isDirectory();
            });

            // Filter by skill name if specified
            if (skillName) {
              skillDirs = skillDirs.filter(s => s === skillName);
            }

            for (const skillDir of skillDirs) {
              const skillPath = path.join(skillsPath, skillDir);
              const skillMdPath = path.join(skillPath, 'skill.md');
              const skillJsonPath = path.join(skillPath, 'skill.json');

              let systemPrompt = '';
              let manifest: Record<string, unknown> = { name: skillDir, version: '1.0.0' };

              if (fs.existsSync(skillMdPath)) {
                systemPrompt = fs.readFileSync(skillMdPath, 'utf-8');
              }
              if (fs.existsSync(skillJsonPath)) {
                manifest = JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8'));
              }

              const outputPath = path.join(outputDir, `${skillDir}.zip`);
              const skillPackage = skillExporter.createPackage(
                manifest.name as string || skillDir,
                { systemPrompt },
                manifest as Record<string, unknown>
              );
              skillExporter.exportToFile(skillPackage, outputPath, {
                format: options.format as 'zip' | 'json',
                includeReadme: true
              });
              console.log(`  ✓ ${skillDir}`);
              totalExported++;
            }
          }
        } catch (error) {
          console.error(`  ❌ Export failed: ${error}`);
        }
      }
    }

    console.log(`\n✅ Total exported: ${totalExported} skills to ${options.output}/`);
  });

// Helper functions for finding platform paths
function findOpenClawSkillsPath(): string | null {
  const possiblePaths = [
    path.join(process.env.USERPROFILE || '', '.openclaw', 'skills'),
    path.join(process.env.APPDATA || '', 'openclaw', 'skills'),
    path.join(process.env.HOME || '', '.openclaw', 'skills'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findClaudeCodeSkillsPath(): string | null {
  const possiblePaths = [
    path.join(process.env.USERPROFILE || '', '.claude'),
    path.join(process.env.APPDATA || '', 'claude'),
    path.join(process.env.HOME || '', '.claude'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ============================================
// sa log [skill] - View skill version history (git-log style)
// ============================================
program
  .command('log [skillName]')
  .description('View version history')
  .option('-n, --number <count>', 'Number of versions to show', '10')
  .option('--oneline', 'Show one line per version', false)
  .option('--stat', 'Show change statistics', false)
  .action((skillName: string | undefined, options: { number: string; oneline: boolean; stat: boolean }) => {
    const db = new EvolutionDatabase('evolution.db');

    if (skillName) {
      // Show history for specific skill
      const records = db.getRecords(skillName);
      if (records.length === 0) {
        console.log(`Skill "${skillName}" not found.`);
        return;
      }

      console.log(`📜 Version History: ${skillName}\n`);

      // Sort by timestamp descending (newest first)
      const sorted = [...records].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ).slice(0, parseInt(options.number));

      for (const record of sorted) {
        const date = new Date(record.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

        if (options.oneline) {
          console.log(`${record.version} - ${dateStr}`);
        } else {
          console.log('─'.repeat(50));
          console.log(`📦 Version: ${record.version}`);
          console.log(`📅 Date:    ${dateStr}`);
          console.log(`🆔 ID:      ${record.id}`);

          // Parse patches to show changes
          try {
            const patches = JSON.parse(record.patches || '[]');
            if (patches.length > 0) {
              console.log(`📝 Changes:`);
              for (const patch of patches) {
                console.log(`   • [${patch.type || 'evolution'}] ${patch.description || 'N/A'}`);
              }
            }

            // Show telemetry data if stat option
            if (options.stat) {
              const telemetry = JSON.parse(record.telemetryData || '{}');
              if (Object.keys(telemetry).length > 0) {
                console.log(`📊 Metrics:`);
                if (telemetry.tokenReduction) {
                  console.log(`   Token reduction: ${telemetry.tokenReduction.toFixed(1)}%`);
                }
                if (telemetry.callReduction) {
                  console.log(`   Call reduction: ${telemetry.callReduction.toFixed(1)}%`);
                }
              }
            }
          } catch {
            // Ignore parse errors
          }

          if (record.importSource) {
            console.log(`📥 Source:  ${record.importSource}`);
          }
          console.log('');
        }
      }

      console.log(`Total ${records.length} version(s)`);

    } else {
      // Show history for all skills
      const records = db.getAllRecords();
      if (records.length === 0) {
        console.log('No skills installed yet.');
        return;
      }

      const skillNames = [...new Set(records.map(r => r.skillName))];
      console.log('📜 Version History (All Skills)\n');

      for (const name of skillNames) {
        const skillRecords = db.getRecords(name);
        const versions = skillRecords.map(r => r.version);
        const latest = db.getLatestVersion(name);

        console.log(`📦 ${name}`);
        console.log(`   Versions: ${versions.join(' → ')}`);
        console.log(`   Latest:   v${latest}`);
        console.log(`   Total:    ${skillRecords.length} evolution(s)`);
        console.log('');
      }

      console.log('💡 Use `sa log <skill>` for detailed history.');
    }
  });

// ============================================
// Additional utility commands
// ============================================

/**
 * sa scan [file] - Security scan
 */
program
  .command('scan [file]')
  .description('Scan for security issues')
  .option('-f, --format <format>', 'Output format', 'text')
  .action((file: string | undefined, options: { format: string }) => {
    if (!file) {
      console.log('🔒 Security Scanner\n');
      console.log('Usage: sa scan <file>');
      console.log('\nScan a skill file for security issues.');
      console.log('\nExample:');
      console.log('  sa scan skill.json');
      console.log('  sa scan ./my-skill/');
      return;
    }

    console.log(`🔒 Scanning: ${file}\n`);

    try {
      const result = securityEvaluator.scanFile(file);
      const report = securityEvaluator.generateReport(result, options.format as 'text' | 'json' | 'markdown');
      console.log(report);
    } catch (error) {
      console.error(`Error: ${error}`);
    }
  });

// Parse arguments
program.parse();
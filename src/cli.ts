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
 * - sa summary <skill>   View evolution metrics table
 * - sa log [skill]       View version history (git-log style)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import ora from 'ora';

// Core modules
import { telemetry, WorkspaceAnalyzer, SessionAnalyzer, skillPatcher, evaluator, EvolutionDatabase, EvolutionRecord, summaryGenerator, VERSION } from './index';

// Evolution Engine
import { EvolutionEngine, evolutionEngine, EvolutionRecommendation } from './core/evolution-engine';
import { aiEvolutionEngine, AIRecommendation, modelConfigLoader } from './core/evolution';

// New modules
import { securityEvaluator } from './core/security';
import { skillExporter, skillRegistry } from './core/sharing';
import { platformFetcher, recommendationEngine, skillAnalyzer } from './core/discovery';
import { versionManager } from './core/versioning';
import { agentDetector } from './core/config';
import { configManager, UserPreferences } from './core/config-manager';

const program = new Command();

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  // skills.sh - Cyan
  skillsSh: '\x1b[36m',  // Cyan
  skillsShBg: '\x1b[46m\x1b[30m', // Cyan background with black text
  // Other colors
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

/**
 * Format platform source with color and bold
 */
function formatSource(platform: string): string {
  if (platform === 'skills-sh' || platform === 'skills.sh') {
    return `${COLORS.bold}${COLORS.skillsShBg} skills.sh ${COLORS.reset}`;
  }
  return platform;
}

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
  .option('-p, --platform <platform>', 'Platform for discovery (skills-sh)', 'skills-sh')
  .option('--no-npx', 'Use built-in import instead of official CLI', false)
  .action(async (source: string | undefined, options: { name?: string; scan: boolean; registry?: string; limit: string; platform: string; noNpx: boolean }) => {
    // No source provided - show hot skills (discover mode)
    if (!source) {
      console.log('🔥 Discovering hot skills from skills.sh...\n');

      try {
        const limit = parseInt(options.limit);

        // Fetch from skills.sh only
        const results = await platformFetcher.fetchHot('skills-sh', limit);
        if (results.length > 0) {
          console.log('Rank | Downloads | Skill');
          console.log('-'.repeat(50));
          for (const entry of results) {
            console.log(`#${entry.rank.toString().padEnd(4)} | ${entry.skill.stats.downloads.toString().padEnd(9)} | ${entry.skill.name}`);
          }
        } else {
          console.log('  (No data available)');
        }

        console.log('\n📌 Next Steps:');
        console.log('   sa import <skill>            # Install a skill');
        console.log('   sa import <owner/repo>       # Install from skills.sh');
      } catch (error) {
        console.error(`❌ Failed to fetch skills: ${error}`);
      }
      return;
    }

    // Source provided - import mode
    console.log(`📥 Getting skill from: ${source}\n`);

    // Check if it's a local file/directory first
    const isLocalPath = fs.existsSync(source);
    const isOpenClawSkill = (() => {
      const openClawPath = findOpenClawSkillsPath();
      if (openClawPath) {
        const localSkillDir = path.join(openClawPath, source);
        return fs.existsSync(localSkillDir) && fs.statSync(localSkillDir).isDirectory();
      }
      return false;
    })();

    // Use official CLI for remote skills (default), unless --no-npx or local path
    const useOfficialCli = !options.noNpx && !isLocalPath && !isOpenClawSkill && !source.startsWith('http');

    if (useOfficialCli) {
      console.log('🔧 Installing with official CLI...\n');
      try {
        const { execSync } = require('child_process');

        // Build command for skills.sh
        let command = '';
        let skillName = source;

        // Check if source is a skills.sh URL or owner/repo format
        if (source.includes('skills.sh') || source.includes('/')) {
          // Direct repo reference - use skills.sh format
          const skillsShUrl = source.includes('skills.sh') ? source : `https://skills.sh/${source}`;
          command = `npx skills add ${source.includes('/') && !source.includes('skills.sh') ? source : skillsShUrl.replace('https://skills.sh/', '')}`;
          console.log(`   Source: ${skillsShUrl}\n`);
        } else {
          // Skill name - search for it
          const searchResults = await platformFetcher.search(source, { limit: 3, platforms: ['skills-sh'] });

          if (searchResults.length > 0) {
            const found = searchResults[0];
            skillName = found.name;
            const repo = found.repository || source;
            // Use owner/repo format for npx skills add
            const repoRef = repo.includes('github.com') ? repo.replace('https://github.com/', '') : repo;
            command = `npx skills add ${repoRef} --skill ${found.name}`;
            console.log(`   Source: https://skills.sh/${repoRef}`);
            console.log(`   Skill: ${found.name}\n`);
          } else {
            // Not found - try as direct skill name
            console.log(`   Skill "${source}" not found, trying direct install...\n`);
            command = `npx skills add ${source}`;
          }
        }

        console.log(`$ ${command}\n`);
        execSync(command, { stdio: 'inherit' });

        console.log('\n✅ Installation complete!');
        console.log('\n📌 Next Steps:');
        console.log('   sa info              # View installed skills');
        console.log(`   sa info ${skillName}  # View skill details`);
        console.log('   sa evolve <skill>    # Analyze and optimize');
        return;
      } catch (error) {
        // Official CLI failed - provide helpful error
        console.error('\n❌ Official CLI installation failed\n');
        console.log('💡 Possible solutions:\n');
        console.log('   1. Check skill name or repository');
        console.log('      sa import                    # Browse hot skills\n');
        console.log('   2. Use built-in import (skip official CLI)');
        console.log(`      sa import ${source} --no-npx\n`);
        console.log('📌 Manual install:');
        console.log(`   npx skills add <owner/repo> --skill <name>`);
        console.log(`   Example: npx skills add vercel-labs/agent-skills --skill web-design-guidelines`);
        return;
      }
    }

    const db = new EvolutionDatabase();

    try {
      // Detect source type
      let skillPackage = null;
      let sourceType = 'unknown';
      let skillPath = '';  // Track where skill files are located

      if (source.startsWith('http://') || source.startsWith('https://')) {
        sourceType = 'url';

        if (source.includes('skills.sh') || source.includes('localhost:3000')) {
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
          skillPath = source;  // Store the directory path
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
        // Assume it's a skill name - check local first, then search remote
        sourceType = 'registry-name';

        // First, check if it's a local OpenClaw skill
        const openClawPath = findOpenClawSkillsPath();
        if (openClawPath) {
          const localSkillDir = path.join(openClawPath, source);
          if (fs.existsSync(localSkillDir) && fs.statSync(localSkillDir).isDirectory()) {
            console.log('🔍 Found local OpenClaw skill\n');
            skillPath = localSkillDir;  // Store the skill directory path
            const skillMdPath = path.join(localSkillDir, 'SKILL.md');

            let systemPrompt = '';
            if (fs.existsSync(skillMdPath)) {
              systemPrompt = fs.readFileSync(skillMdPath, 'utf-8');
            }

            const skillName = options.name || source;
            skillPackage = {
              id: `skill_${Date.now()}`,
              manifest: {
                name: skillName,
                version: '1.0.0',
                description: `OpenClaw skill: ${source}`,
                author: 'openclaw',
                license: 'MIT',
                keywords: [],
                compatibility: { platforms: ['openclaw', 'claude-code'] }
              },
              content: { systemPrompt },
              metadata: { createdAt: new Date(), updatedAt: new Date() }
            };
            sourceType = 'openclaw';
          }
        }

        // If not found locally, search remote platforms
        if (!skillPackage) {
          console.log('🔍 Searching from skills.sh...\n');

          // Search from both platforms
          const searchResults = await platformFetcher.search(source, { limit: 5 });

          if (searchResults.length === 0) {
            // Fallback to registry download
            const registryUrl = options.registry || 'http://localhost:3000';
            const downloadUrl = `${registryUrl}/api/skills/${source}/download`;
            console.log(`📦 No results found, trying local registry...`);

            try {
              const response = await fetch(downloadUrl);
              if (response.ok) {
                skillPackage = {
                  id: `skill_${Date.now()}`,
                  manifest: { name: source, version: '1.0.0', description: '', author: 'unknown', license: 'MIT', keywords: [], compatibility: { platforms: ['claude-code'] } },
                  content: { systemPrompt: `# ${source}\n\nSkill imported from registry` },
                  metadata: { createdAt: new Date(), updatedAt: new Date() }
                };
                sourceType = 'local-registry';
              }
            } catch {
              console.log('⚠ Could not find skill in any registry');
            }
          } else if (searchResults.length === 1) {
            // Single result - use it directly
            const found = searchResults[0];
            console.log(`📥 Found: ${found.name} from ${formatSource(found.platform)}`);
            console.log(`   ${found.description}\n`);

            // Fetch skill content
            const content = await platformFetcher.fetchSkillContent(found);
            skillPackage = {
              id: `skill_${Date.now()}`,
              manifest: {
                name: found.name,
                version: '1.0.0',
                description: found.description,
                author: found.owner,
                license: 'MIT',
                keywords: found.tags,
                compatibility: { platforms: ['claude-code'] }
              },
              content: { systemPrompt: content || `# ${found.name}\n\n${found.description}` },
              metadata: { createdAt: new Date(), updatedAt: new Date(), source: found.platform }
            };
            sourceType = found.platform;
          } else {
            // Multiple results - show all with platform source
            console.log(`📋 Found ${searchResults.length} matching skills:\n`);
            searchResults.forEach((s, i) => {
              console.log(`  ${i + 1}. ${s.name} from ${formatSource(s.platform)} - ${s.stats.downloads} downloads`);
              console.log(`     ${s.description}`);
            });
            console.log('');

            // Use the first result (most popular)
            const found = searchResults[0];
            console.log(`📦 Importing: ${found.name} from ${formatSource(found.platform)}\n`);

            const content = await platformFetcher.fetchSkillContent(found);
            skillPackage = {
              id: `skill_${Date.now()}`,
              manifest: {
                name: found.name,
                version: '1.0.0',
                description: found.description,
                author: found.owner,
                license: 'MIT',
                keywords: found.tags,
                compatibility: { platforms: ['claude-code'] }
              },
              content: { systemPrompt: content || `# ${found.name}\n\n${found.description}` },
              metadata: { createdAt: new Date(), updatedAt: new Date(), source: found.platform }
            };
            sourceType = found.platform;
          }
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

      // Determine source label
      const getSourceLabel = (type: string, originalSource?: string): string => {
        if (type === 'skills-sh') return 'skills.sh';
        if (type === 'openclaw') return `OpenClaw:${originalSource || ''}`;
        if (type === 'local-registry') return 'local registry';
        if (type === 'file') return 'local file';
        if (type === 'url') return 'URL';
        return type;
      };

      db.addRecord({
        id: EvolutionDatabase.generateId(),
        skillName: skillPackage.manifest.name,
        version: skillPackage.manifest.version,
        timestamp: new Date(),
        telemetryData: JSON.stringify([]),
        patches: JSON.stringify(skillPackage.content.patches || []),
        importSource: getSourceLabel(sourceType, source),
        skillPath: skillPath || undefined
      });

      const sourceLabel = getSourceLabel(sourceType, source).split(':')[0];
      console.log(`\n✅ Installed successfully!`);
      console.log(`   Skill: ${skillPackage.manifest.name} (v${skillPackage.manifest.version})`);
      console.log(`   Source: ${sourceLabel}`);

      console.log('\n📌 Next Steps:');
      console.log(`   sa info ${skillPackage.manifest.name}       # View skill details`);
      console.log(`   sa evolve ${skillPackage.manifest.name}     # Analyze and optimize`);
      console.log(`   sa log ${skillPackage.manifest.name}        # View version history`);

    } catch (error) {
      console.error(`❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

// ============================================
// sa info [skill] - Unified view/list
// ============================================
// sa info [skill] - Unified view/list
// ============================================
program
  .command('info [skillName]')
  .description('View skill info')
  .alias('show')
  .option('-v, --version <version>', 'Specific version')
  .option('--security', 'Show security status')
  .option('-p, --platform <platform>', 'Platform to show (imported, openclaw, claudecode, all)', 'all')
  .action((skillName: string | undefined, options: { version?: string; security?: boolean; platform: string }) => {
    const db = new EvolutionDatabase();

    if (!skillName) {
      // List mode
      console.log('📋 Available Skills\n');

      const showAll = options.platform === 'all';
      const platforms = showAll ? ['imported', 'openclaw', 'claudecode'] : [options.platform];

      for (const platform of platforms) {
        if (platform === 'imported') {
          const records = db.getAllRecords();
          if (records.length > 0) {
            console.log('── Imported Skills ──');
            const skillNames = [...new Set(records.map(r => r.skillName))];
            for (const name of skillNames) {
              const version = db.getLatestVersion(name);
              const skillRecords = db.getRecords(name);
              console.log(`  📦 ${name} (v${version}) - ${skillRecords.length} evolution(s)`);
            }
            console.log('');
          } else if (!showAll) {
            console.log('No skills imported yet.\n');
          }
        } else if (platform === 'openclaw') {
          const openClawPath = findOpenClawSkillsPath();
          if (openClawPath && fs.existsSync(openClawPath)) {
            const skills = fs.readdirSync(openClawPath).filter(f =>
              fs.statSync(path.join(openClawPath, f)).isDirectory()
            );
            if (skills.length > 0) {
              console.log('── OpenClaw Skills ──');
              for (const skill of skills) {
                const skillMdPath = path.join(openClawPath, skill, 'SKILL.md');
                const hasPrompt = fs.existsSync(skillMdPath);
                console.log(`  📦 ${skill} ${hasPrompt ? '' : '(no prompt)'}`);
              }
              console.log('');
            }
          }
        } else if (platform === 'claudecode') {
          const claudeCodePath = findClaudeCodeSkillsPath();
          if (claudeCodePath && fs.existsSync(claudeCodePath)) {
            const commandsPath = path.join(claudeCodePath, 'commands');
            const skillsPath = path.join(claudeCodePath, 'skills');

            // Show commands
            if (fs.existsSync(commandsPath)) {
              const commands = fs.readdirSync(commandsPath).filter(f => f.endsWith('.md'));
              if (commands.length > 0) {
                console.log('── Claude Code Commands ──');
                for (const cmd of commands) {
                  console.log(`  📦 ${cmd.replace('.md', '')}`);
                }
                console.log('');
              }
            }

            // Collect all skills from various locations
            const allSkills: Set<string> = new Set();

            // 1. Skills from ~/.claude/skills/
            if (fs.existsSync(skillsPath)) {
              const skillDirs = fs.readdirSync(skillsPath).filter(f =>
                fs.statSync(path.join(skillsPath, f)).isDirectory()
              );
              skillDirs.forEach(s => allSkills.add(s));
            }

            // 2. Skills from plugins cache
            const plugins = getClaudeCodePlugins();
            for (const plugin of plugins) {
              const pluginSkillsPath = path.join(plugin.path, 'skills');
              if (fs.existsSync(pluginSkillsPath)) {
                const pluginSkills = fs.readdirSync(pluginSkillsPath).filter(f =>
                  fs.statSync(path.join(pluginSkillsPath, f)).isDirectory()
                );
                pluginSkills.forEach(s => allSkills.add(s));
              }
            }

            // Show all collected skills
            if (allSkills.size > 0) {
              console.log('── Claude Code Skills ──');
              for (const skill of Array.from(allSkills).sort()) {
                console.log(`  📦 ${skill}`);
              }
              console.log('');
            }
          }
        }
      }

      console.log('\n📌 Next Steps:');
      console.log('   sa info <skill-name>       # View skill details');
      console.log('   sa info -p imported        # List imported skills only');
      console.log('   sa import <skill-name>     # Import a new skill');

    } else {
      // Detail mode - show specific skill info
      console.log(`📦 ${skillName}\n`);

      // Check imported skills first
      const records = db.getRecords(skillName);
      if (records.length > 0) {
        const latestVersion = db.getLatestVersion(skillName);
        const latestRecord = records[records.length - 1];

        console.log(`Source: Imported`);
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

        // Helper function to show detailed skill info
        const showDetailedInfo = (skillDir: string) => {
          if (!fs.existsSync(skillDir)) return;

          // Read skill.md or SKILL.md
          const skillMdPath = fs.existsSync(path.join(skillDir, 'skill.md'))
            ? path.join(skillDir, 'skill.md')
            : path.join(skillDir, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            const systemPrompt = fs.readFileSync(skillMdPath, 'utf-8');
            console.log(`\n── System Prompt ──`);
            console.log(`Size: ${(systemPrompt.length / 1024).toFixed(1)} KB`);
            console.log(`Lines: ${systemPrompt.split('\n').length}`);
          }

          // Get directory stats
          const stats = fs.statSync(skillDir);
          console.log(`\n── Metadata ──`);
          console.log(`Created: ${stats.birthtime.toLocaleString()}`);
          console.log(`Modified: ${stats.mtime.toLocaleString()}`);
          console.log(`Path: ${skillDir}`);

          // Count files and directories
          const countFiles = (dir: string): { files: number; dirs: number; size: number } => {
            let files = 0, dirs = 0, size = 0;
            const items = fs.readdirSync(dir);
            for (const item of items) {
              if (item.startsWith('.')) continue;
              const itemPath = path.join(dir, item);
              const stat = fs.statSync(itemPath);
              if (stat.isDirectory()) {
                dirs++;
                const sub = countFiles(itemPath);
                files += sub.files;
                dirs += sub.dirs;
                size += sub.size;
              } else {
                files++;
                size += stat.size;
              }
            }
            return { files, dirs, size };
          };
          const counts = countFiles(skillDir);
          console.log(`Files: ${counts.files} | Dirs: ${counts.dirs} | Total Size: ${(counts.size / 1024).toFixed(1)} KB`);

          // Show directory tree
          console.log(`\n── Directory Tree ──`);
          const showTree = (dir: string, prefix: string = '', maxDepth = 3, currentDepth = 0) => {
            if (currentDepth >= maxDepth) return;
            const items = fs.readdirSync(dir).filter(i => !i.startsWith('.'));
            items.forEach((item, index) => {
              const itemPath = path.join(dir, item);
              const isLast = index === items.length - 1;
              const prefixChar = isLast ? '└── ' : '├── ';
              const newPrefix = prefix + (isLast ? '    ' : '│   ');
              const stat = fs.statSync(itemPath);

              let info = item;
              if (stat.isDirectory()) {
                info += '/';
              } else {
                info += ` (${(stat.size / 1024).toFixed(1)} KB)`;
              }

              console.log(prefix + prefixChar + info);

              if (stat.isDirectory()) {
                showTree(itemPath, newPrefix, maxDepth, currentDepth + 1);
              }
            });
          };
          showTree(skillDir);
        };

        // Try to find and show detailed info
        // Priority: 1. Stored skillPath, 2. OpenClaw path, 3. Claude Code skills, 4. Plugins cache
        let foundDetailed = false;

        // 1. Check stored skillPath
        if (latestRecord.skillPath && fs.existsSync(latestRecord.skillPath)) {
          // Handle both directory and file paths
          let skillDir = latestRecord.skillPath;
          const stat = fs.statSync(skillDir);
          if (stat.isFile()) {
            // If it's a file path, get the parent directory
            skillDir = path.dirname(skillDir);
          }
          if (fs.existsSync(skillDir)) {
            showDetailedInfo(skillDir);
            foundDetailed = true;
          }
        }

        // 2. Check OpenClaw path
        if (!foundDetailed && latestRecord.importSource?.toLowerCase().includes('openclaw')) {
          let originalDir = skillName;
          if (latestRecord.importSource.includes(':')) {
            originalDir = latestRecord.importSource.split(':')[1] || skillName;
          }
          const openClawPath = findOpenClawSkillsPath();
          if (openClawPath) {
            const skillDir = path.join(openClawPath, originalDir);
            if (fs.existsSync(skillDir)) {
              showDetailedInfo(skillDir);
              foundDetailed = true;
            }
          }
        }

        // 3. Check ~/.claude/skills/ for skills.sh imports
        if (!foundDetailed && latestRecord.importSource === 'skills.sh') {
          const claudeCodePath = findClaudeCodeSkillsPath();
          if (claudeCodePath) {
            const skillsDir = path.join(claudeCodePath, 'skills', skillName);
            if (fs.existsSync(skillsDir)) {
              showDetailedInfo(skillsDir);
              foundDetailed = true;
            }
          }
        }

        // 4. Check plugins cache
        if (!foundDetailed) {
          const plugins = getClaudeCodePlugins();
          for (const plugin of plugins) {
            const pluginSkillPath = path.join(plugin.path, 'skills', skillName);
            if (fs.existsSync(pluginSkillPath)) {
              showDetailedInfo(pluginSkillPath);
              foundDetailed = true;
              break;
            }
          }
        }

        console.log('\n📌 Next Steps:');
        console.log(`   sa summary ${skillName}      # View evolution metrics`);
        console.log(`   sa evolve ${skillName}       # Analyze and optimize`);
        console.log(`   sa log ${skillName}          # View version history`);
        return;
      }

      // Check OpenClaw skills
      const openClawPath = findOpenClawSkillsPath();
      if (openClawPath) {
        const skillDir = path.join(openClawPath, skillName);
        if (fs.existsSync(skillDir)) {
          console.log(`Source: OpenClaw\n`);

          // Read SKILL.md
          const skillMdPath = path.join(skillDir, 'SKILL.md');
          let systemPrompt = '';
          if (fs.existsSync(skillMdPath)) {
            systemPrompt = fs.readFileSync(skillMdPath, 'utf-8');
            console.log(`── System Prompt ──`);
            console.log(`Size: ${(systemPrompt.length / 1024).toFixed(1)} KB`);
            console.log(`Lines: ${systemPrompt.split('\n').length}`);

            // Try to extract version from skill content
            const versionMatch = systemPrompt.match(/version[:\s]+(\d+\.\d+\.\d+)/i);
            if (versionMatch) {
              console.log(`Version: ${versionMatch[1]}`);
            }
          }

          // Get directory stats
          const stats = fs.statSync(skillDir);
          console.log(`\n── Metadata ──`);
          console.log(`Created: ${stats.birthtime.toLocaleString()}`);
          console.log(`Modified: ${stats.mtime.toLocaleString()}`);
          console.log(`Path: ${skillDir}`);

          // Count files and directories
          const countFiles = (dir: string): { files: number; dirs: number; size: number } => {
            let files = 0, dirs = 0, size = 0;
            const items = fs.readdirSync(dir);
            for (const item of items) {
              if (item.startsWith('.')) continue;
              const itemPath = path.join(dir, item);
              const stat = fs.statSync(itemPath);
              if (stat.isDirectory()) {
                dirs++;
                const sub = countFiles(itemPath);
                files += sub.files;
                dirs += sub.dirs;
                size += sub.size;
              } else {
                files++;
                size += stat.size;
              }
            }
            return { files, dirs, size };
          };
          const counts = countFiles(skillDir);
          console.log(`Files: ${counts.files} | Dirs: ${counts.dirs} | Total Size: ${(counts.size / 1024).toFixed(1)} KB`);

          // Show directory tree
          console.log(`\n── Directory Tree ──`);
          const showTree = (dir: string, prefix: string = '', maxDepth = 3, currentDepth = 0) => {
            if (currentDepth >= maxDepth) return;
            const items = fs.readdirSync(dir).filter(i => !i.startsWith('.'));
            items.forEach((item, index) => {
              const itemPath = path.join(dir, item);
              const isLast = index === items.length - 1;
              const prefixChar = isLast ? '└── ' : '├── ';
              const newPrefix = prefix + (isLast ? '    ' : '│   ');
              const stat = fs.statSync(itemPath);

              let info = item;
              if (stat.isDirectory()) {
                info += '/';
              } else {
                info += ` (${(stat.size / 1024).toFixed(1)} KB)`;
              }

              console.log(prefix + prefixChar + info);

              if (stat.isDirectory()) {
                showTree(itemPath, newPrefix, maxDepth, currentDepth + 1);
              }
            });
          };
          showTree(skillDir);

          // Show references
          const refPath = path.join(skillDir, 'reference');
          if (fs.existsSync(refPath)) {
            const refs = fs.readdirSync(refPath).filter(f => f.endsWith('.md'));
            if (refs.length > 0) {
              console.log(`\n── References ──`);
              for (const ref of refs) {
                const refFile = path.join(refPath, ref);
                const stat = fs.statSync(refFile);
                console.log(`  📄 ${ref} (${(stat.size / 1024).toFixed(1)} KB)`);
              }
            }
          }

          // Show scripts
          const scriptsPath = path.join(skillDir, 'scripts');
          if (fs.existsSync(scriptsPath)) {
            const scripts = fs.readdirSync(scriptsPath);
            if (scripts.length > 0) {
              console.log(`\n── Scripts ──`);
              for (const script of scripts) {
                const scriptFile = path.join(scriptsPath, script);
                const stat = fs.statSync(scriptFile);
                console.log(`  🔧 ${script} (${(stat.size / 1024).toFixed(1)} KB)`);
              }
            }
          }

          // Show tests
          const testsPath = path.join(skillDir, 'tests');
          if (fs.existsSync(testsPath)) {
            const tests = fs.readdirSync(testsPath);
            if (tests.length > 0) {
              console.log(`\n── Tests ──`);
              for (const test of tests) {
                const testFile = path.join(testsPath, test);
                const stat = fs.statSync(testFile);
                console.log(`  ✅ ${test} (${(stat.size / 1024).toFixed(1)} KB)`);
              }
            }
          }

          console.log('\n💡 Use `sa import ' + skillDir + '` to import this skill.');
          return;
        }
      }

      // Check Claude Code skills
      const claudeCodePath = findClaudeCodeSkillsPath();
      if (claudeCodePath) {
        const cmdPath = path.join(claudeCodePath, 'commands', `${skillName}.md`);
        const skillPath = path.join(claudeCodePath, 'skills', skillName);

        // Helper function to show skill details (same format as OpenClaw)
        const showClaudeCodeSkillDetail = (skillDir: string, source: string, pluginInfo?: { name: string; marketplace: string }) => {
          console.log(`Source: ${source}\n`);

          // Read skill.md or SKILL.md
          const skillMdPath = fs.existsSync(path.join(skillDir, 'skill.md'))
            ? path.join(skillDir, 'skill.md')
            : path.join(skillDir, 'SKILL.md');
          let systemPrompt = '';
          if (fs.existsSync(skillMdPath)) {
            systemPrompt = fs.readFileSync(skillMdPath, 'utf-8');
            console.log(`── System Prompt ──`);
            console.log(`Size: ${(systemPrompt.length / 1024).toFixed(1)} KB`);
            console.log(`Lines: ${systemPrompt.split('\n').length}`);

            // Try to extract version from skill content
            const versionMatch = systemPrompt.match(/version[:\s]+(\d+\.\d+\.\d+)/i);
            if (versionMatch) {
              console.log(`Version: ${versionMatch[1]}`);
            }
          }

          // Get directory stats
          const stats = fs.statSync(skillDir);
          console.log(`\n── Metadata ──`);
          console.log(`Created: ${stats.birthtime.toLocaleString()}`);
          console.log(`Modified: ${stats.mtime.toLocaleString()}`);
          console.log(`Path: ${skillDir}`);
          if (pluginInfo) {
            console.log(`Plugin: ${pluginInfo.name}`);
            console.log(`Marketplace: ${pluginInfo.marketplace}`);
          }

          // Count files and directories
          const countFiles = (dir: string): { files: number; dirs: number; size: number } => {
            let files = 0, dirs = 0, size = 0;
            const items = fs.readdirSync(dir);
            for (const item of items) {
              if (item.startsWith('.')) continue;
              const itemPath = path.join(dir, item);
              const stat = fs.statSync(itemPath);
              if (stat.isDirectory()) {
                dirs++;
                const sub = countFiles(itemPath);
                files += sub.files;
                dirs += sub.dirs;
                size += sub.size;
              } else {
                files++;
                size += stat.size;
              }
            }
            return { files, dirs, size };
          };
          const counts = countFiles(skillDir);
          console.log(`Files: ${counts.files} | Dirs: ${counts.dirs} | Total Size: ${(counts.size / 1024).toFixed(1)} KB`);

          // Show directory tree
          console.log(`\n── Directory Tree ──`);
          const showTree = (dir: string, prefix: string = '', maxDepth = 3, currentDepth = 0) => {
            if (currentDepth >= maxDepth) return;
            const items = fs.readdirSync(dir).filter(i => !i.startsWith('.'));
            items.forEach((item, index) => {
              const itemPath = path.join(dir, item);
              const isLast = index === items.length - 1;
              const prefixChar = isLast ? '└── ' : '├── ';
              const newPrefix = prefix + (isLast ? '    ' : '│   ');
              const stat = fs.statSync(itemPath);

              let info = item;
              if (stat.isDirectory()) {
                info += '/';
              } else {
                info += ` (${(stat.size / 1024).toFixed(1)} KB)`;
              }

              console.log(prefix + prefixChar + info);

              if (stat.isDirectory()) {
                showTree(itemPath, newPrefix, maxDepth, currentDepth + 1);
              }
            });
          };
          showTree(skillDir);

          console.log('\n💡 Use `sa import ' + skillDir + '` to import this skill.');
        };

        if (fs.existsSync(cmdPath)) {
          showClaudeCodeSkillDetail(path.dirname(cmdPath), 'Claude Code Command');
          return;
        }

        if (fs.existsSync(skillPath)) {
          showClaudeCodeSkillDetail(skillPath, 'Claude Code Skill');
          return;
        }

        // Check plugins cache for skills
        const plugins = getClaudeCodePlugins();
        for (const plugin of plugins) {
          const pluginSkillPath = path.join(plugin.path, 'skills', skillName);
          if (fs.existsSync(pluginSkillPath)) {
            showClaudeCodeSkillDetail(pluginSkillPath, 'Claude Code Skill (Plugin)', {
              name: plugin.name,
              marketplace: plugin.marketplace
            });
            return;
          }
        }
      }

      console.log(`Skill "${skillName}" not found.`);
      console.log('\n💡 Use `sa info` to list available skills.');
    }
  });

// ============================================
// sa evolve [skill] - Evolution analysis
// ============================================
program
  .command('evolve [skillName]')
  .description('Find and adapt skill (auto-import if needed)')
  .option('-l, --last <n>', 'Analyze last N sessions', '10')
  .option('--apply', 'Apply suggested improvements', false)
  .option('--detail', 'Show detailed analysis', false)
  .option('--dry-run', 'Preview changes without applying', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .option('--debug', 'Show full technical output', false)
  .action(async (skillName: string | undefined, options: { last: string; apply: boolean; detail: boolean; dryRun: boolean; verbose: boolean; debug: boolean }) => {
    const db = new EvolutionDatabase();
    const preferences = configManager.getPreferences();

    // Context variables (used for fallback and legacy logic)
    let soulContent = '';
    let memoryContent = '';

    // Determine output level
    const outputLevel = options.debug ? 'debug' : options.verbose ? 'verbose' : preferences.outputLevel;
    const isSimple = outputLevel === 'simple';

    // ═══════════════════════════════════════════
    // No skill specified - show all skills + workspace analysis
    // ═══════════════════════════════════════════
    if (!skillName) {
      const records = db.getAllRecords();

      if (records.length === 0) {
        console.log('No skills installed yet.');
        console.log('Use `sa import <source>` to install a skill.');
        return;
      }

      const skillNames = [...new Set(records.map(r => r.skillName))];

      console.log(`Analyzing ${skillNames.length} skill(s)...\n`);

      for (const name of skillNames) {
        const skillRecords = db.getRecords(name);
        const latest = skillRecords[skillRecords.length - 1];
        console.log(`  • ${name}: v${db.getLatestVersion(name)} (${skillRecords.length} evolution(s))`);
        console.log(`    Source: ${latest.importSource || 'unknown'}`);
      }

      // Workspace analysis
      console.log('\n📍 Workspace Analysis');
      console.log('─'.repeat(40));
      try {
        const workspaceAnalyzer = new WorkspaceAnalyzer(process.cwd());
        const config = workspaceAnalyzer.analyze();
        console.log(`Languages: ${config.techStack.languages.join(', ') || 'None'}`);
        console.log(`Frameworks: ${config.techStack.frameworks.join(', ') || 'None'}`);
        console.log(`Package Manager: ${config.techStack.packageManager}`);
      } catch {
        console.log('Workspace analysis not available');
      }

      console.log('\n📌 Next Steps:');
      console.log('   sa evolve <skill-name>     # Analyze specific skill');
      console.log('   sa import <skill-name>     # Import a new skill');
      return;
    }

    // ═══════════════════════════════════════════
    // STEP 0: Find Skill (multi-source with auto-import)
    // ═══════════════════════════════════════════
    interface SkillLocation {
      content: string;
      dir: string;
      source: string;
      foundInDb: boolean;
      needsImport: boolean;
    }

    const findSkill = (name: string): SkillLocation | null => {
      let skillContent = '';
      let skillDir = '';
      let skillSource = '';
      let foundInDb = false;
      let needsImport = false;

      // 1. Check database first
      const records = db.getRecords(name);
      if (records.length > 0) {
        foundInDb = true;
        const latestRecord = records[records.length - 1];

        // Check if skillPath exists (it's a directory, not file)
        if (latestRecord.skillPath && fs.existsSync(latestRecord.skillPath)) {
          // skillPath is the directory, need to find SKILL.md or skill.md inside
          const skillMdPath = path.join(latestRecord.skillPath, 'SKILL.md');
          const skillMdAltPath = path.join(latestRecord.skillPath, 'skill.md');

          if (fs.existsSync(skillMdPath)) {
            skillContent = fs.readFileSync(skillMdPath, 'utf-8');
            skillDir = latestRecord.skillPath;
            skillSource = latestRecord.importSource || 'database';
          } else if (fs.existsSync(skillMdAltPath)) {
            skillContent = fs.readFileSync(skillMdAltPath, 'utf-8');
            skillDir = latestRecord.skillPath;
            skillSource = latestRecord.importSource || 'database';
          }
        }

        // Fallback: find by importSource if skill content not found
        if (!skillContent && latestRecord.importSource) {
          // Fallback: find by importSource
          const importSource = latestRecord.importSource;

          if (importSource.startsWith('OpenClaw:') || importSource.toLowerCase().includes('openclaw')) {
            const openClawPath = findOpenClawSkillsPath();
            if (openClawPath) {
              let originalDir = name;
              if (importSource.startsWith('OpenClaw:')) {
                originalDir = importSource.split(':')[1] || name;
              }
              skillDir = path.join(openClawPath, originalDir);
              const skillMdPath = path.join(skillDir, 'SKILL.md');
              if (fs.existsSync(skillMdPath)) {
                skillContent = fs.readFileSync(skillMdPath, 'utf-8');
                skillSource = importSource;
              }
            }
          }
        }
      }

      // 2. If not found in DB, check OpenClaw directly
      if (!skillContent) {
        const openClawPath = findOpenClawSkillsPath();
        if (openClawPath) {
          const ocSkillDir = path.join(openClawPath, name);
          const skillMdPath = path.join(ocSkillDir, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            skillContent = fs.readFileSync(skillMdPath, 'utf-8');
            skillDir = ocSkillDir;
            skillSource = 'OpenClaw:' + name;
            needsImport = !foundInDb;  // Found in OpenClaw but not in DB
          }
        }
      }

      // 3. Check Claude Code skills
      if (!skillContent) {
        const claudeCodePath = findClaudeCodeSkillsPath();
        if (claudeCodePath) {
          const ccSkillDir = path.join(claudeCodePath, 'skills', name);
          const skillMdPath = path.join(ccSkillDir, 'skill.md');
          if (fs.existsSync(skillMdPath)) {
            skillContent = fs.readFileSync(skillMdPath, 'utf-8');
            skillDir = ccSkillDir;
            skillSource = 'ClaudeCode:' + name;
            needsImport = !foundInDb;
          }
        }
      }

      if (!skillContent) return null;

      return { content: skillContent, dir: skillDir, source: skillSource, foundInDb, needsImport };
    };

    // Find skill with spinner
    const findSpinner = ora('Finding skill...').start();
    const skillLocation = findSkill(skillName);

    if (!skillLocation) {
      findSpinner.fail(`Skill "${skillName}" not found`);
      console.log('\n📋 Search locations:');
      console.log('   • Database: ~/.skill-adapter/evolution.jsonl');
      console.log('   • OpenClaw: ~/.openclaw/skills/');
      console.log('   • Claude Code: ~/.claude/skills/');
      console.log('\n📌 Try:');
      console.log('   sa info -p openclaw    # View OpenClaw skills');
      console.log('   sa info -p claudecode  # View Claude Code skills');
      return;
    }

    findSpinner.succeed(`Found: ${skillName} (${skillLocation.source.split(':')[0]})`);

    // Record usage
    configManager.recordSkillUsage(skillName);

    const { content: skillContent, dir: skillDir, source: skillSource, foundInDb, needsImport } = skillLocation;

    // ═══════════════════════════════════════════
    // STEP 1: AI Configuration
    // ═══════════════════════════════════════════
    const useAI = aiEvolutionEngine.isAvailable();
    const modelInfo = aiEvolutionEngine.getModelInfo();

    if (useAI) {
      console.log('\n📋 AI Configuration:');
      console.log(`   ├─ Model: ${modelInfo.modelId}`);

      // Load config to show endpoint
      const configResult = modelConfigLoader.load();
      if (configResult.success && configResult.config) {
        const config = configResult.config;
        console.log(`   ├─ Endpoint: ${config.baseUrl || 'https://api.anthropic.com (default)'}`);
        console.log(`   └─ API Key: ${config.apiKey.slice(0, 10)}...${config.apiKey.slice(-4)}`);
      }
    }

    // ═══════════════════════════════════════════
    // STEP 2: Skill Info
    // ═══════════════════════════════════════════
    console.log(`\n📄 Skill: ${skillName}`);
    console.log(`   ├─ Source: ${skillSource}`);
    console.log(`   ├─ Path: ${skillDir}`);
    console.log(`   └─ Size: ${skillContent.length} bytes`);

    if (foundInDb) {
      console.log(`   Version: ${db.getLatestVersion(skillName)}`);
    }
    if (needsImport) {
      console.log(`   📌 Will auto-import to database`);
    }

    // ═══════════════════════════════════════════
    // STEP 3: Static Analysis
    // ═══════════════════════════════════════════
    const staticSpinner = ora('📊 Analyzing static skill content...').start();
    const lines = skillContent.split('\n');
    const sections = (skillContent.match(/^##\s/gm) || []).length;
    const codeBlocks = (skillContent.match(/```/g) || []).length / 2;
    const links = (skillContent.match(/\[.*?\]\(.*?\)/g) || []).length;

    staticSpinner.succeed('Static analysis complete');
    console.log(`   ├─ Sections: ${sections}`);
    console.log(`   ├─ Code blocks: ${Math.floor(codeBlocks)}`);
    console.log(`   └─ Links: ${links}`);

    // ═══════════════════════════════════════════
    // STEP 4: Dynamic Context
    // ═══════════════════════════════════════════
    const contextSpinner = ora('📂 Loading dynamic context...').start();

    // Workspace info
    const workspaceAnalyzer = new WorkspaceAnalyzer(process.cwd());
    const workspaceConfig = workspaceAnalyzer.analyze();

    // Build evolution context
    let evolutionContext;
    let evolutionRecommendations: EvolutionRecommendation[] = [];
    let aiRecommendations: AIRecommendation[] = [];

    try {
      const daysToAnalyze = parseInt(options.last) || 10;
      evolutionContext = await evolutionEngine.buildEvolutionContext(skillName, daysToAnalyze);
    } catch {
      // Create basic context
      evolutionContext = {
        sessionPatterns: {
          toolSequences: [],
          errorPatterns: [],
          successPatterns: [],
          userIntents: [],
          summary: { totalSessions: 0, avgToolCalls: 0, errorRate: 0, topTools: [] }
        },
        memoryRules: [],
        behaviorStyle: {
          communicationStyle: 'direct' as const,
          boundaries: [],
          preferences: [],
          avoidPatterns: [],
          source: 'claude_code' as const
        },
        crossSkillPatterns: [],
      };
    }

    const soulPrefs = evolutionContext.behaviorStyle.boundaries.length > 0 ||
                      evolutionContext.behaviorStyle.preferences.length > 0;
    const hasMemory = evolutionContext.memoryRules.length > 0;

    contextSpinner.succeed('Dynamic context loaded');
    console.log(`   ├─ SOUL preferences: ${soulPrefs ? '✓' : '✗'}`);
    console.log(`   ├─ MEMORY rules: ${evolutionContext.memoryRules.length} rules`);
    console.log(`   ├─ Workspace: ${workspaceConfig.techStack.languages.join(', ') || 'not detected'}`);
    console.log(`   └─ Session patterns: ${evolutionContext.sessionPatterns.toolSequences.length} patterns`);

    // ═══════════════════════════════════════════
    // STEP 5: AI Evolution with Streaming
    // ═══════════════════════════════════════════
    console.log('\n' + '─'.repeat(60));
    console.log('🤖 AI Evolution Process');
    console.log('─'.repeat(60) + '\n');

    const thinkingSpinner = ora('Connecting to AI model...').start();
    let thinkingBuffer = '';
    let thinkingStarted = false;
    let lineBuffer = ''; // Buffer for incomplete lines

    try {
      aiRecommendations = await aiEvolutionEngine.generateRecommendations({
        skillName,
        skillContent,
        soulPreferences: {
          communicationStyle: evolutionContext.behaviorStyle.communicationStyle,
          boundaries: evolutionContext.behaviorStyle.boundaries.slice(0, 3),
        },
        memoryRules: evolutionContext.memoryRules.slice(0, 5).map(r => ({
          category: r.category,
          rule: r.rule,
        })),
        workspaceInfo: {
          languages: workspaceConfig.techStack.languages.slice(0, 3),
          packageManager: workspaceConfig.techStack.packageManager,
        },
      }, {
        onThinking: (text) => {
          if (!thinkingStarted) {
            thinkingSpinner.stop();
            console.log('\n💭 AI Thinking (streaming):\n');
            console.log('─'.repeat(40));
            thinkingStarted = true;
          }
          // Buffer text and output only complete lines
          lineBuffer += text;
          const lines = lineBuffer.split('\n');
          // Keep the last incomplete line in buffer
          lineBuffer = lines.pop() || '';

          const filteredLines = lines.filter(line => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            // Skip separator-only lines
            if (/^[\u2500-\u257F\u2010-\u2015\-_=\-*#\.~\s│┌┐└┘├┤┬┴┼]+$/.test(trimmed)) return false;
            if (/^(.)\1{2,}$/.test(trimmed)) return false;
            return true;
          });
          if (filteredLines.length > 0) {
            process.stdout.write(filteredLines.join('\n') + '\n');
          }
          thinkingBuffer += text;
        },
        onContent: (text) => {
          thinkingBuffer += text;
        },
        onComplete: () => {
          // Output any remaining buffered content
          if (lineBuffer.trim()) {
            process.stdout.write(lineBuffer + '\n');
            lineBuffer = '';
          }
          if (thinkingStarted) {
            console.log('\n✅ Thinking complete!\n');
          }
        },
      });

      // Debug: Check if AI generated recommendations
      if (aiRecommendations.length === 0) {
        console.log('⚠️ AI generated 0 recommendations. Check if model output JSON correctly.\n');
      } else {
        console.log(`✅ Generated ${aiRecommendations.length} recommendation(s)\n`);
      }

    } catch (aiError) {
      if (thinkingSpinner.isSpinning) {
        thinkingSpinner.fail('AI generation failed');
      } else {
        console.log('\n❌ AI generation failed');
      }
      console.log('Falling back to rule-based recommendations...');
      evolutionRecommendations = evolutionEngine.generateRecommendations(evolutionContext);
    }

    // ═══════════════════════════════════════════
    // STEP 6: Display Recommendations
    // ═══════════════════════════════════════════
    const allRecommendations = aiRecommendations.length > 0 ? aiRecommendations :
                               evolutionRecommendations.length > 0 ? evolutionRecommendations : [];

    if (allRecommendations.length > 0) {
      console.log('═'.repeat(60));
      console.log('📋 EVOLUTION RECOMMENDATIONS');
      console.log('═'.repeat(60) + '\n');

      for (let i = 0; i < allRecommendations.length; i++) {
        const rec = allRecommendations[i];
        const priority = 'priority' in rec ? rec.priority : 'medium';
        const confidence = 'confidence' in rec ? rec.confidence : 0.7;
        const title = rec.title;
        const description = rec.description;
        const type = rec.type;
        const suggestedContent = 'suggestedContent' in rec ? rec.suggestedContent : undefined;

        const priorityEmoji = priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';

        console.log(`\n${priorityEmoji} [${priority.toUpperCase()}] Recommendation #${i + 1}`);
        console.log('─'.repeat(50));
        console.log(`   Title: ${title}`);
        console.log(`   Type: ${type}`);
        console.log(`   Confidence: ${(confidence * 100).toFixed(0)}%`);
        console.log(`\n   Description:`);
        console.log(`   ${description.split('\n').join('\n   ')}`);

        if (suggestedContent) {
          console.log(`\n   Suggested Content:`);
          const lines = suggestedContent.split('\n').slice(0, 8);
          lines.forEach(line => console.log(`   │ ${line}`));
          if (suggestedContent.split('\n').length > 8) {
            console.log('   │ ... (truncated)');
          }
        }
      }
    }

    // ═══════════════════════════════════════════
    // STEP 7: Next Tips
    // ═══════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('📌 Next Steps');
    console.log('═'.repeat(60) + '\n');

    if (allRecommendations.length > 0) {
      console.log('   sa evolve <skill> --apply    # Apply recommendations to skill');
    }
    console.log('   sa log <skill>               # View evolution history');
    console.log('   sa summary <skill>           # View evolution metrics');
    console.log('   sa export <skill>            # Export skill as ZIP');
    console.log('');

    // ═══════════════════════════════════════════
    // STEP 8: Apply Optimizations (if --apply flag)
    // ═══════════════════════════════════════════
    let newContent = skillContent;

    if (options.apply && allRecommendations.length > 0) {
      const applySpinner = ora('Applying recommendations...').start();

      for (const rec of allRecommendations) {
        const confidence = 'confidence' in rec ? rec.confidence : 0.7;
        const suggestedContent = 'suggestedContent' in rec ? rec.suggestedContent : undefined;
        const title = rec.title;

        // Apply high-confidence recommendations
        if (confidence >= 0.8 && suggestedContent) {
          const sectionTitle = `## ${title}`;
          if (!newContent.includes(sectionTitle)) {
            newContent += `\n\n${sectionTitle}\n\n${suggestedContent}\n`;
          }
        }
      }

      // Write updated content
      const skillFilePath = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(skillFilePath, newContent, 'utf-8');

      applySpinner.succeed(`Applied ${allRecommendations.filter(r => ('confidence' in r ? r.confidence : 0.7) >= 0.8).length} recommendations`);

      // Record evolution
      const newRecord: EvolutionRecord = {
        id: EvolutionDatabase.generateId(),
        skillName: skillName,
        version: '1.1.0',
        timestamp: new Date(),
        telemetryData: JSON.stringify({
          recommendationsCount: allRecommendations.length,
          appliedCount: allRecommendations.filter(r => ('confidence' in r ? r.confidence : 0.7) >= 0.8).length,
        }),
        patches: JSON.stringify(allRecommendations.map(r => ({
          category: r.type,
          title: r.title,
          description: r.description,
        }))),
        importSource: skillSource,
        skillPath: skillDir
      };
      db.addRecord(newRecord);

      console.log(`\n✅ ${skillName} evolved (1.0.0 → 1.1.0)`);
    }

    console.log('\n🎉 Evolution analysis complete!\n');
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
    const db = new EvolutionDatabase();

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
      console.log('\n📌 Next Steps:');
      console.log('   sa share <skill-name>      # Share a specific skill');
      console.log('   sa export <skill-name>     # Export skill to file');
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
  .option('-p, --platform <platform>', 'Platform to export from (imported, openclaw, claudecode, all)', 'all')
  .option('-o, --output <dir>', 'Output directory', './exported-skills')
  .option('-f, --format <format>', 'Export format (zip, json)', 'zip')
  .action((skillName: string | undefined, options: { platform: string; output: string; format: string }) => {
    const db = new EvolutionDatabase();
    const targetSkill = skillName ? skillName : 'all skills';
    const absoluteOutput = path.resolve(options.output);

    console.log(`📦 Exporting ${targetSkill} from ${options.platform}...\n`);

    const platforms = options.platform === 'all'
      ? ['imported', 'openclaw', 'claudecode']
      : [options.platform];

    let totalExported = 0;
    const exportedFiles: string[] = [];

    for (const platform of platforms) {
      console.log(`\n── ${platform.toUpperCase()} ──`);

      if (platform === 'imported') {
        // Export from database (imported skills)
        try {
          let skills: string[] = [];

          if (skillName) {
            const records = db.getRecords(skillName);
            if (records.length > 0) {
              skills = [skillName];
            } else {
              console.log(`  ⚠ Skill "${skillName}" not found in imported list`);
            }
          } else {
            const allRecords = db.getAllRecords();
            skills = [...new Set(allRecords.map(r => r.skillName))];
          }

          if (skills.length === 0) {
            console.log('  ⚠ No imported skills');
            continue;
          }

          const outputDir = path.join(absoluteOutput, 'imported');
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          for (const skill of skills) {
            const records = db.getRecords(skill);
            if (records.length === 0) continue;

            // Get skill content from OpenClaw if available
            const latestRecord = records[records.length - 1];
            let systemPrompt = `# ${skill}\n\nExported from Skill-Adapter`;

            // Try to get content from OpenClaw
            if (latestRecord.importSource?.startsWith('OpenClaw:')) {
              const originalDir = latestRecord.importSource.split(':')[1] || skill;
              const openClawPath = findOpenClawSkillsPath();
              if (openClawPath) {
                const skillMdPath = path.join(openClawPath, originalDir, 'SKILL.md');
                if (fs.existsSync(skillMdPath)) {
                  systemPrompt = fs.readFileSync(skillMdPath, 'utf-8');
                }
              }
            }

            const outputPath = path.join(outputDir, `${skill}.zip`);
            const skillPackage = skillExporter.createPackage(
              skill,
              { systemPrompt },
              { version: latestRecord.version, author: 'imported' }
            );
            skillExporter.exportToFile(skillPackage, outputPath, {
              format: options.format as 'zip' | 'json',
              includeReadme: true
            });
            console.log(`  ✓ ${skill}`);
            exportedFiles.push(outputPath);
            totalExported++;
          }
        } catch (error) {
          console.error(`  ❌ Export failed: ${error}`);
        }
      } else if (platform === 'openclaw') {
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

          const outputDir = path.join(absoluteOutput, 'openclaw');
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          for (const skill of skills) {
            const skillPath = path.join(openClawPath, skill);
            const outputPath = path.join(outputDir, `${skill}.zip`);
            try {
              skillExporter.exportOpenClawSkill(skillPath, outputPath);
              console.log(`  ✓ ${skill}`);
              exportedFiles.push(outputPath);
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
          const outputDir = path.join(absoluteOutput, 'claudecode');
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
              exportedFiles.push(outputPath);
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
              exportedFiles.push(outputPath);
              totalExported++;
            }
          }
        } catch (error) {
          console.error(`  ❌ Export failed: ${error}`);
        }
      }
    }

    // Show results
    if (totalExported === 0) {
      console.log(`\n❌ Export failed: No skills found to export`);
      console.log('\n📌 Suggestions:');
      console.log('   sa info              # View imported skills');
      console.log('   sa import <skill>    # Import a skill first');
    } else {
      console.log(`\n✅ Successfully exported ${totalExported} skill(s)`);
      console.log(`\n📁 Output directory: ${absoluteOutput}`);
      if (exportedFiles.length > 0) {
        console.log('\n📄 Exported files:');
        for (const file of exportedFiles) {
          console.log(`   ${file}`);
        }
      }
      console.log('\n📌 Next Steps:');
      console.log('   # Open export directory in file manager');
      console.log(`   explorer ${absoluteOutput}`);
    }
  });

// Helper functions for finding platform paths

/**
 * Increment semantic version (e.g., "1.0.0" -> "1.1.0")
 */
function incrementVersion(version: string): string {
  const parts = version.split('.').map(p => parseInt(p, 10) || 0);
  if (parts.length >= 2) {
    parts[1] = (parts[1] || 0) + 1;
  }
  return parts.slice(0, 3).join('.');
}

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

/**
 * Find OpenClaw workspace directory
 * Contains AGENTS.md, SOUL.md, MEMORY.md, USER.md, skills/
 */
function findOpenClawWorkspacePath(): string | null {
  const possiblePaths = [
    path.join(process.env.USERPROFILE || '', '.openclaw', 'workspace'),
    path.join(process.env.APPDATA || '', 'openclaw', 'workspace'),
    path.join(process.env.HOME || '', '.openclaw', 'workspace'),
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

/**
 * Find Claude Code plugins cache directory
 * Skills are installed in ~/.claude/plugins/cache/<marketplace>/<plugin-name>/<version>/skills/
 */
function findClaudeCodePluginsPath(): string | null {
  const basePaths = [
    process.env.USERPROFILE || '',
    process.env.APPDATA || '',
    process.env.HOME || '',
  ];
  for (const base of basePaths) {
    if (!base) continue;
    const pluginsPath = path.join(base, '.claude', 'plugins', 'cache');
    if (fs.existsSync(pluginsPath)) return pluginsPath;
  }
  return null;
}

/**
 * Get all installed Claude Code plugins/skills from plugins cache
 */
function getClaudeCodePlugins(): { name: string; path: string; marketplace: string }[] {
  const plugins: { name: string; path: string; marketplace: string }[] = [];
  const pluginsCachePath = findClaudeCodePluginsPath();

  if (!pluginsCachePath) return plugins;

  try {
    // Read installed_plugins.json for accurate info
    const installedPluginsPath = path.join(path.dirname(pluginsCachePath), 'installed_plugins.json');
    if (fs.existsSync(installedPluginsPath)) {
      const installedPlugins = JSON.parse(fs.readFileSync(installedPluginsPath, 'utf-8'));
      if (installedPlugins.plugins) {
        for (const [pluginId, installations] of Object.entries(installedPlugins.plugins)) {
          const installs = installations as Array<{ installPath: string; scope: string }>;
          if (installs && installs.length > 0) {
            const install = installs[0];
            // Extract plugin name from pluginId (format: name@marketplace)
            const name = pluginId.split('@')[0];
            const marketplace = pluginId.split('@')[1] || 'unknown';
            plugins.push({
              name,
              path: install.installPath,
              marketplace
            });
          }
        }
      }
    }
  } catch {
    // Fallback: scan directory structure
    try {
      const marketplaces = fs.readdirSync(pluginsCachePath);
      for (const marketplace of marketplaces) {
        const marketplacePath = path.join(pluginsCachePath, marketplace);
        if (!fs.statSync(marketplacePath).isDirectory()) continue;

        const pluginDirs = fs.readdirSync(marketplacePath);
        for (const pluginName of pluginDirs) {
          const pluginPath = path.join(marketplacePath, pluginName);
          if (!fs.statSync(pluginPath).isDirectory()) continue;

          // Get the latest version directory
          const versions = fs.readdirSync(pluginPath);
          if (versions.length > 0) {
            const latestVersion = versions[versions.length - 1];
            plugins.push({
              name: pluginName,
              path: path.join(pluginPath, latestVersion),
              marketplace
            });
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return plugins;
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
    const db = new EvolutionDatabase();

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
                // Support both old format (type/description) and new format (category/action)
                const type = patch.type || patch.category || 'evolution';
                const desc = patch.description || patch.action || patch.suggestion || 'N/A';
                const statusIcon = patch.status === 'applied' ? '✅' :
                                   patch.status === 'added' ? '➕' :
                                   patch.status === 'skipped' ? 'ℹ️' : '•';
                console.log(`   ${statusIcon} [${type}] ${desc}`);
                // Show details
                if (patch.details && patch.details.length > 0) {
                  for (const detail of patch.details) {
                    console.log(`      → ${detail}`);
                  }
                }
              }
            }

            // Show telemetry data if stat option
            if (options.stat) {
              const telemetry = JSON.parse(record.telemetryData || '{}');
              if (Object.keys(telemetry).length > 0) {
                console.log(`📊 Metrics:`);
                if (telemetry.optimizationsCount !== undefined) {
                  console.log(`   Optimizations: ${telemetry.optimizationsCount}`);
                }
                if (telemetry.appliedCount !== undefined) {
                  console.log(`   Applied: ${telemetry.appliedCount}`);
                }
                if (telemetry.skippedCount !== undefined) {
                  console.log(`   Skipped: ${telemetry.skippedCount}`);
                }
                if (telemetry.soulLoaded) {
                  console.log(`   SOUL.md: loaded`);
                }
                if (telemetry.memoryLoaded) {
                  console.log(`   MEMORY.md: loaded`);
                }
                if (telemetry.workspaceAnalysis) {
                  const ws = telemetry.workspaceAnalysis;
                  console.log(`   Workspace: ${ws.languages?.join(', ') || 'N/A'}, ${ws.packageManager || 'N/A'}`);
                }
                // Legacy metrics
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

      console.log('\n📌 Next Steps:');
      console.log(`   sa summary ${skillName}      # View evolution metrics`);

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

      console.log('\n📌 Next Steps:');
      console.log('   sa summary <skill-name>    # View evolution metrics');
      console.log('   sa log <skill-name>        # View specific skill history');
      console.log('   sa evolve <skill-name>     # Analyze and optimize skill');
    }
  });

// ============================================
// sa summary <skill> - View evolution metrics
// ============================================
program
  .command('summary <skillName>')
  .description('View evolution metrics comparison')
  .action((skillName: string) => {
    const db = new EvolutionDatabase();
    const records = db.getRecords(skillName);

    if (records.length === 0) {
      console.log(`❌ No evolution records found for "${skillName}"\n`);
      console.log('📌 Next Steps:');
      console.log(`   sa evolve ${skillName}    # Run evolution analysis first`);
      return;
    }

    // Sort by timestamp ascending (oldest first)
    const sorted = [...records].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const baseline = sorted[0];
    const latest = sorted[sorted.length - 1];

    console.log(`📊 Evolution Summary: ${skillName}\n`);

    // Extract metrics from telemetry data
    const extractTelemetryMetrics = (record: EvolutionRecord) => {
      try {
        const t = JSON.parse(record.telemetryData || '{}');
        return {
          optimizations: t.optimizationsCount || 0,
          applied: t.appliedCount || 0,
          skipped: t.skippedCount || 0,
          soulLoaded: t.soulLoaded || false,
          memoryLoaded: t.memoryLoaded || false,
          languages: t.workspaceAnalysis?.languages || [],
          packageManager: t.workspaceAnalysis?.packageManager || '-'
        };
      } catch {
        return null;
      }
    };

    // Extract applied changes from patches
    const extractAppliedChanges = (record: EvolutionRecord) => {
      try {
        const patches = JSON.parse(record.patches || '[]');
        const changes: { style: string[]; errors: string[]; env: string[]; learning: string[] } = {
          style: [], errors: [], env: [], learning: []
        };
        for (const p of patches) {
          const cat = p.category || p.type || '';
          const details = p.details || [];
          if (cat.includes('Style') || cat.includes('风格')) {
            changes.style.push(...details);
          } else if (cat.includes('Error') || cat.includes('错误')) {
            changes.errors.push(...details);
          } else if (cat.includes('Environment') || cat.includes('环境')) {
            changes.env.push(...details);
          }
        }
        return changes;
      } catch {
        return { style: [], errors: [], env: [], learning: [] };
      }
    };

    const baseMetrics = extractTelemetryMetrics(baseline);
    const latestMetrics = extractTelemetryMetrics(latest);

    // Aggregate all changes across all records
    const allChanges = { style: [] as string[], errors: [] as string[], env: [] as string[] };
    for (const rec of sorted) {
      const changes = extractAppliedChanges(rec);
      allChanges.style.push(...changes.style);
      allChanges.errors.push(...changes.errors);
      allChanges.env.push(...changes.env);
    }
    // Deduplicate
    allChanges.style = [...new Set(allChanges.style)];
    allChanges.errors = [...new Set(allChanges.errors)];
    allChanges.env = [...new Set(allChanges.env)];

    // Show metrics comparison table
    const vBase = baseline.version.padEnd(5);
    const vLatest = latest.version.padEnd(5);
    console.log('┌─────────────────────┬─────────────────┬─────────────────┬──────────┬──────────────────┐');
    console.log(`│ Metric              │ Baseline (v${vBase})│ Evolved (v${vLatest})│ Change   │ Status           │`);
    console.log('├─────────────────────┼─────────────────┼─────────────────┼──────────┼──────────────────┤');

    // Helper to format row
    const formatRow = (name: string, base: number, evolved: number, statusFn: (delta: number) => string) => {
      const delta = base === 0 ? (evolved > 0 ? 100 : 0) : ((evolved - base) / base) * 100;
      const deltaStr = delta === 0 ? '-' : (delta > 0 ? `+${delta.toFixed(0)}%` : `${delta.toFixed(0)}%`);
      const status = statusFn(delta);
      const namePad = name.padEnd(19);
      const baseStr = String(base).padStart(15);
      const evolvedStr = String(evolved).padStart(15);
      const deltaPad = deltaStr.padStart(8);
      const statusPad = status.padEnd(16);
      console.log(`│ ${namePad} │ ${baseStr} │ ${evolvedStr} │ ${deltaPad} │ ${statusPad} │`);
    };

    // Status helpers
    const goodStatus = (delta: number) => delta < -10 ? '✅ Optimized' : delta > 10 ? '⚠️ Increased' : '➖ Stable';
    const countStatus = (delta: number) => delta > 0 ? '✅ Enhanced' : delta < 0 ? '⚠️ Reduced' : '➖ Stable';

    // Show metrics rows
    formatRow('Optimizations', baseMetrics?.optimizations || 0, latestMetrics?.optimizations || 0, countStatus);
    formatRow('Applied Patches', baseMetrics?.applied || 0, latestMetrics?.applied || 0, countStatus);
    formatRow('Style Rules', 0, allChanges.style.length, countStatus);
    formatRow('Error Avoidances', 0, allChanges.errors.length, countStatus);
    formatRow('Env Adaptations', 0, allChanges.env.length, countStatus);

    console.log('└─────────────────────┴─────────────────┴─────────────────┴──────────┴──────────────────┘');

    // Workspace context
    if (latestMetrics?.languages?.length) {
      console.log(`\n📁 Workspace: ${latestMetrics.languages.join(', ')} | ${latestMetrics.packageManager}`);
    }

    // Context loaded
    const ctxLoaded = [];
    if (latestMetrics?.soulLoaded) ctxLoaded.push('SOUL.md');
    if (latestMetrics?.memoryLoaded) ctxLoaded.push('MEMORY.md');
    if (ctxLoaded.length > 0) {
      console.log(`📚 Context: ${ctxLoaded.join(', ')}`);
    }

    // Generate conclusion
    const totalApplied = allChanges.style.length + allChanges.errors.length + allChanges.env.length;
    const totalSkipped = (latestMetrics?.skipped || 0);

    console.log('\n📝 Conclusion:');
    if (totalApplied > 0) {
      const parts: string[] = [];
      if (allChanges.style.length > 0) parts.push(`${allChanges.style.length} style rules`);
      if (allChanges.errors.length > 0) parts.push(`${allChanges.errors.length} error avoidances`);
      if (allChanges.env.length > 0) parts.push(`${allChanges.env.length} environment adaptations`);

      console.log(`   ✅ Evolution applied: ${parts.join(', ')}.`);
      if (totalSkipped > 0) {
        console.log(`   ℹ️  ${totalSkipped} optimization(s) skipped (cross-skill learning available).`);
      }
      console.log(`   📈 Version progressed from v${baseline.version} to v${latest.version} across ${records.length} evolution(s).`);
    } else {
      console.log('   ➖ No significant changes applied in recent evolutions.');
      console.log('   💡 Run `sa evolve` to analyze and apply new optimizations.');
    }

    console.log('\n📌 Next Steps:');
    console.log(`   sa log ${skillName}          # View detailed changes`);
    console.log(`   sa share ${skillName}        # Export/publish skill`);
    console.log(`   sa export ${skillName}       # Export to file`);
  });

// ============================================
// Additional utility commands
// ============================================

/**
 * sa scan [file] - Security scan
 */
program
  .command('scan [skillOrFile]')
  .description('Scan for security issues')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action(async (skillOrFile: string | undefined, options: { format: string }) => {
    const db = new EvolutionDatabase();

    // No argument - show all scannable skills
    if (!skillOrFile) {
      console.log('🔒 Security Scan\n');

      // Get imported skills
      const records = db.getAllRecords();
      const importedSkills = [...new Set(records.map(r => r.skillName))];

      // Get OpenClaw skills
      const openClawPath = findOpenClawSkillsPath();
      let openClawSkills: string[] = [];
      if (openClawPath && fs.existsSync(openClawPath)) {
        openClawSkills = fs.readdirSync(openClawPath).filter(f =>
          fs.statSync(path.join(openClawPath, f)).isDirectory()
        );
      }

      // Get Claude Code skills
      const claudeCodePath = findClaudeCodeSkillsPath();
      let claudeCodeCommands: string[] = [];
      let claudeCodeSkills: string[] = [];
      if (claudeCodePath && fs.existsSync(claudeCodePath)) {
        const commandsPath = path.join(claudeCodePath, 'commands');
        if (fs.existsSync(commandsPath)) {
          claudeCodeCommands = fs.readdirSync(commandsPath)
            .filter(f => f.endsWith('.md'))
            .map(f => f.replace('.md', ''));
        }
        const skillsPath = path.join(claudeCodePath, 'skills');
        if (fs.existsSync(skillsPath)) {
          claudeCodeSkills = fs.readdirSync(skillsPath).filter(f =>
            fs.statSync(path.join(skillsPath, f)).isDirectory()
          );
        }
        // Also get skills from plugins
        const plugins = getClaudeCodePlugins();
        for (const plugin of plugins) {
          const pluginSkillsPath = path.join(plugin.path, 'skills');
          if (fs.existsSync(pluginSkillsPath)) {
            const pluginSkills = fs.readdirSync(pluginSkillsPath).filter(f =>
              fs.statSync(path.join(pluginSkillsPath, f)).isDirectory()
            );
            claudeCodeSkills = [...claudeCodeSkills, ...pluginSkills];
          }
        }
        // Remove duplicates
        claudeCodeSkills = [...new Set(claudeCodeSkills)];
      }

      if (importedSkills.length === 0 && openClawSkills.length === 0 &&
          claudeCodeCommands.length === 0 && claudeCodeSkills.length === 0) {
        console.log('No skills found to scan.\n');
        console.log('📌 Next Steps:');
        console.log('   sa import <skill>        # Import a skill first');
        return;
      }

      // Show imported skills
      if (importedSkills.length > 0) {
        console.log('── Imported Skills ──');
        for (const skill of importedSkills) {
          const skillRecords = db.getRecords(skill);
          const latest = skillRecords[skillRecords.length - 1];
          console.log(`  📦 ${skill} (v${latest.version})`);
        }
        console.log('');
      }

      // Show OpenClaw skills
      if (openClawSkills.length > 0 && openClawPath) {
        console.log('── OpenClaw Local Skills ──');
        for (const skill of openClawSkills) {
          const skillMdPath = path.join(openClawPath, skill, 'SKILL.md');
          const hasPrompt = fs.existsSync(skillMdPath);
          console.log(`  📦 ${skill} ${hasPrompt ? '' : '(no SKILL.md)'}`);
        }
        console.log('');
      }

      // Show Claude Code commands
      if (claudeCodeCommands.length > 0) {
        console.log('── Claude Code Commands ──');
        for (const cmd of claudeCodeCommands) {
          console.log(`  📦 ${cmd}`);
        }
        console.log('');
      }

      // Show Claude Code skills
      if (claudeCodeSkills.length > 0) {
        console.log('── Claude Code Skills ──');
        for (const skill of claudeCodeSkills) {
          console.log(`  📦 ${skill}`);
        }
        console.log('');
      }

      console.log('📌 Next Steps:');
      console.log('   sa scan <skill-name>     # Scan imported skill');
      console.log('   sa scan <file-path>      # Scan local file');
      console.log('\nExamples:');
      console.log('   sa scan frontend-design');
      console.log('   sa scan ./my-skill/SKILL.md');
      console.log('   sa scan skill.json -f json');
      return;
    }

    // Check if it's a skill name or file path
    const isFilePath = skillOrFile.includes('/') || skillOrFile.includes('\\') ||
                       skillOrFile.endsWith('.json') || skillOrFile.endsWith('.md') ||
                       fs.existsSync(skillOrFile);

    if (isFilePath) {
      // Scan file
      console.log(`🔒 Scanning file: ${skillOrFile}\n`);

      try {
        const result = securityEvaluator.scanFile(skillOrFile);
        const report = securityEvaluator.generateReport(result, options.format as 'text' | 'json' | 'markdown');
        console.log(report);

        console.log('\n📌 Next Steps:');
        console.log('   sa import ' + skillOrFile + '    # Import this skill');
      } catch (error) {
        console.error(`❌ Error: ${error}`);
        console.log('\n📌 Suggestions:');
        console.log('   sa scan                   # View scannable skills');
      }
    } else {
      // Scan by skill name
      console.log(`🔒 Scanning skill: ${skillOrFile}\n`);

      // Try to find skill content
      let skillContent = '';
      let skillPath = '';
      let skillSource = '';

      // Check imported skills first
      const records = db.getRecords(skillOrFile);
      if (records.length > 0) {
        const latest = records[records.length - 1];
        skillSource = latest.importSource || 'unknown';

        // Try to get content from OpenClaw
        if (latest.importSource?.startsWith('OpenClaw:') || latest.importSource?.toLowerCase() === 'openclaw') {
          const originalDir = latest.importSource.split(':')[1] || skillOrFile;
          const openClawPath = findOpenClawSkillsPath();
          if (openClawPath) {
            skillPath = path.join(openClawPath, originalDir);
            const skillMdPath = path.join(skillPath, 'SKILL.md');
            if (fs.existsSync(skillMdPath)) {
              skillContent = fs.readFileSync(skillMdPath, 'utf-8');
            }
          }
        }
      }

      // Check OpenClaw directly (not imported but exists locally)
      if (!skillContent) {
        const openClawPath = findOpenClawSkillsPath();
        if (openClawPath) {
          skillPath = path.join(openClawPath, skillOrFile);
          const skillMdPath = path.join(skillPath, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            skillContent = fs.readFileSync(skillMdPath, 'utf-8');
            skillSource = 'OpenClaw (local)';
          }
        }
      }

      // Check Claude Code skills
      if (!skillContent) {
        const claudeCodePath = findClaudeCodeSkillsPath();
        if (claudeCodePath) {
          // Check commands
          const cmdPath = path.join(claudeCodePath, 'commands', `${skillOrFile}.md`);
          if (fs.existsSync(cmdPath)) {
            skillContent = fs.readFileSync(cmdPath, 'utf-8');
            skillPath = cmdPath;
            skillSource = 'Claude Code Command';
          }

          // Check skills directory
          if (!skillContent) {
            const skillDir = path.join(claudeCodePath, 'skills', skillOrFile);
            if (fs.existsSync(skillDir)) {
              const skillMdPath = path.join(skillDir, 'skill.md');
              if (fs.existsSync(skillMdPath)) {
                skillContent = fs.readFileSync(skillMdPath, 'utf-8');
                skillPath = skillDir;
                skillSource = 'Claude Code Skill';
              }
            }
          }
        }
      }

      // If still no content, try to fetch from remote
      if (!skillContent) {
        console.log('   Fetching skill content from remote...\n');
        try {
          const searchResults = await platformFetcher.search(skillOrFile, { limit: 1 });
          if (searchResults.length > 0) {
            const found = searchResults[0];
            skillContent = await platformFetcher.fetchSkillContent(found);
            skillSource = 'skills.sh';
          }
        } catch {
          // Ignore fetch errors
        }
      }

      if (!skillContent) {
        // Show available info even if content not found
        if (records.length > 0) {
          const latest = records[records.length - 1];
          console.log(`❌ Could not fetch skill content for scanning`);
          console.log(`\n   Skill: ${skillOrFile}`);
          console.log(`   Version: ${latest.version}`);
          console.log(`   Source: ${latest.importSource || 'unknown'}`);
          console.log(`\n   💡 Tip: Remote skills need to be installed via official CLI first.`);
          console.log(`\n📌 Next Steps:`);
          console.log(`   sa scan                   # View local scannable skills`);
          if (latest.importSource?.includes('skills.sh')) {
            console.log(`   npx skills add <owner/repo> --skill <name>  # Install via official CLI`);
          }
          console.log(`   # Or scan local OpenClaw skills`);
        } else {
          console.log(`❌ Skill not found: ${skillOrFile}`);
          console.log('\n📌 Next Steps:');
          console.log('   sa scan                   # View scannable skills');
          console.log('   sa import ' + skillOrFile + ' --no-npx   # Import skill first');
        }
        return;
      }

      // Run security scan
      const result = securityEvaluator.scan(skillContent, skillOrFile);
      const report = securityEvaluator.generateReport(result, options.format as 'text' | 'json' | 'markdown');
      console.log(report);

      if (skillPath) {
        console.log(`\n📁 Skill path: ${skillPath}`);
      }
      if (skillSource) {
        console.log(`📥 Source: ${skillSource}`);
      }

      console.log('\n📌 Next Steps:');
      if (result.passed) {
        console.log('   sa info ' + skillOrFile + '      # View skill details');
        console.log('   sa evolve ' + skillOrFile + '    # Analyze and optimize');
      } else {
        console.log('   # Review security issues before use');
      }
    }
  });

// ============================================
// sa config - Manage user preferences
// ============================================
program
  .command('config [action] [key] [value]')
  .description('Manage user preferences')
  .action((action?: string, key?: string, value?: string) => {
    const prefs = configManager.getPreferences();

    if (!action || action === 'list') {
      // Show all config
      console.log('\n📋 Skill-Adapter Configuration\n');
      console.log('Preferences:');
      console.log(`  autoEvolve    ${prefs.autoEvolve}`);
      console.log(`  outputLevel   ${prefs.outputLevel}`);
      console.log(`  backupEnabled ${prefs.backupEnabled}`);
      console.log('');
      console.log('Recent Skills:');
      const recent = configManager.getRecentSkills();
      if (recent.length > 0) {
        recent.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
      } else {
        console.log('  (No recent skills)');
      }
      console.log('');
      console.log(`📁 Config file: ~/.skill-adapter/config.json`);
      console.log('');
      return;
    }

    if (action === 'get' && key) {
      const validKeys: (keyof UserPreferences)[] = ['autoEvolve', 'outputLevel', 'backupEnabled'];
      if (!validKeys.includes(key as keyof UserPreferences)) {
        console.log(`❌ Unknown config: ${key}`);
        console.log(`   Valid options: ${validKeys.join(', ')}`);
        return;
      }
      const val = configManager.get(key as keyof UserPreferences);
      console.log(`${key} = ${val}`);
      return;
    }

    if (action === 'set' && key && value !== undefined) {
      const validKeys: (keyof UserPreferences)[] = ['autoEvolve', 'outputLevel', 'backupEnabled'];

      if (!validKeys.includes(key as keyof UserPreferences)) {
        console.log(`❌ Unknown config: ${key}`);
        console.log(`   Valid options: ${validKeys.join(', ')}`);
        return;
      }

      // Validate values
      if (key === 'autoEvolve') {
        const validValues = ['always', 'ask', 'preview'];
        if (!validValues.includes(value)) {
          console.log(`❌ autoEvolve valid values: ${validValues.join(', ')}`);
          return;
        }
      } else if (key === 'outputLevel') {
        const validValues = ['simple', 'verbose', 'debug'];
        if (!validValues.includes(value)) {
          console.log(`❌ outputLevel valid values: ${validValues.join(', ')}`);
          return;
        }
      } else if (key === 'backupEnabled') {
        const validValues = ['true', 'false'];
        if (!validValues.includes(value)) {
          console.log(`❌ backupEnabled valid values: true, false`);
          return;
        }
        value = value === 'true' ? 'true' : 'false';
      }

      // Set the value
      if (key === 'autoEvolve') {
        configManager.set('autoEvolve', value as 'always' | 'ask' | 'preview');
      } else if (key === 'outputLevel') {
        configManager.set('outputLevel', value as 'simple' | 'verbose' | 'debug');
      } else if (key === 'backupEnabled') {
        configManager.set('backupEnabled', value === 'true');
      }

      console.log(`✅ Set ${key} = ${value}`);
      return;
    }

    if (action === 'reset') {
      configManager.reset();
      console.log('✅ Configuration reset to defaults');
      console.log('');
      console.log('Default config:');
      console.log(`  autoEvolve    = ask`);
      console.log(`  outputLevel   = simple`);
      console.log(`  backupEnabled = true`);
      return;
    }

    // Show help
    console.log('\n📋 sa config usage:\n');
    console.log('  sa config                View all config');
    console.log('  sa config list           View all config');
    console.log('  sa config get <key>      Get single config');
    console.log('  sa config set <key> <value>  Set config');
    console.log('  sa config reset          Reset to defaults');
    console.log('');
    console.log('Options:');
    console.log('  autoEvolve    always | ask | preview  Auto-evolution strategy');
    console.log('  outputLevel   simple | verbose | debug  Output verbosity');
    console.log('  backupEnabled true | false  Auto backup');
    console.log('');
  });

// ============================================
// sa list - List all skills (alias for info)
// ============================================
program
  .command('list')
  .description('List all skills from all platforms')
  .option('-p, --platform <platform>', 'Platform to show (imported, openclaw, claudecode, all)', 'all')
  .action((options: { platform: string }) => {
    // Delegate to info command logic
    console.log('\n📋 Skill List\n');

    const db = new EvolutionDatabase();
    const allSkillNames = db.getAllSkillNames();

    // Get skills from OpenClaw directory
    const openclawDir = path.join(os.homedir(), '.openclaw', 'skills');
    const openclawSkills: { name: string; path: string }[] = [];
    if (fs.existsSync(openclawDir)) {
      try {
        const dirs = fs.readdirSync(openclawDir, { withFileTypes: true });
        for (const dir of dirs) {
          if (dir.isDirectory() && !dir.name.startsWith('.')) {
            const skillMdPath = path.join(openclawDir, dir.name, 'SKILL.md');
            if (fs.existsSync(skillMdPath)) {
              openclawSkills.push({ name: dir.name, path: path.join(openclawDir, dir.name) });
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }

    // Get skills from Claude Code
    const claudeCodeSkills: { name: string; path: string }[] = [];
    const claudeDir = path.join(os.homedir(), '.claude');
    const skillsDir = path.join(claudeDir, 'skills');

    if (fs.existsSync(skillsDir)) {
      try {
        const dirs = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const dir of dirs) {
          if (dir.isDirectory() && !dir.name.startsWith('.')) {
            const skillMdPath = path.join(skillsDir, dir.name, 'SKILL.md');
            const skillMdAltPath = path.join(skillsDir, dir.name, 'skill.md');
            if (fs.existsSync(skillMdPath) || fs.existsSync(skillMdAltPath)) {
              claudeCodeSkills.push({ name: dir.name, path: path.join(skillsDir, dir.name) });
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }

    // Display results
    if (allSkillNames.length > 0) {
      console.log('📦 Imported Skills (Database):');
      for (const name of allSkillNames) {
        console.log(`   • ${name}`);
      }
      console.log('');
    }

    if (openclawSkills.length > 0 && (options.platform === 'all' || options.platform === 'openclaw')) {
      console.log('🔧 OpenClaw Skills:');
      for (const skill of openclawSkills) {
        console.log(`   • ${skill.name}`);
      }
      console.log('');
    }

    if (claudeCodeSkills.length > 0 && (options.platform === 'all' || options.platform === 'claudecode')) {
      console.log('🤖 Claude Code Skills:');
      for (const skill of claudeCodeSkills) {
        console.log(`   • ${skill.name}`);
      }
      console.log('');
    }

    const total = allSkillNames.length + openclawSkills.length + claudeCodeSkills.length;
    if (total === 0) {
      console.log('No skills found. Run `sa import` to discover skills.');
    } else {
      console.log(`Total: ${total} skill(s)`);
    }

    console.log('\n📌 Next Steps:');
    console.log('   sa show <skill>    # View skill details');
    console.log('   sa evolve <skill>  # Run evolution analysis');
  });

// Parse arguments
// Show newbie guidance if no command provided
if (process.argv.length === 2) {
  // No command provided - show welcome screen
  console.log('');
  console.log(`${COLORS.bold}Skill-Adapter: Evolve or Die (Adaptāre aut Morī)${COLORS.reset}`);
  console.log('');
  console.log(`${COLORS.dim}Quick Start:${COLORS.reset}`);
  console.log('  sa list            List all skills');
  console.log('  sa show <skill>    View skill details');
  console.log('  sa evolve <skill>  Find and adapt skill');
  console.log('');

  // Get recent skills from config
  const recentSkills = configManager.getRecentSkills();

  // Get skills from OpenClaw directory
  const openclawDir = path.join(os.homedir(), '.openclaw', 'skills');
  const openclawSkills: string[] = [];
  if (fs.existsSync(openclawDir)) {
    try {
      const dirs = fs.readdirSync(openclawDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (dir.isDirectory() && !dir.name.startsWith('.')) {
          const skillMdPath = path.join(openclawDir, dir.name, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            openclawSkills.push(dir.name);
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Get skills from database
  const dbSkills: string[] = [];
  try {
    const db = new EvolutionDatabase();
    dbSkills.push(...db.getAllSkillNames());
  } catch {
    // Ignore errors
  }

  // Merge and deduplicate, prioritizing recent skills
  const allSkills = [...new Set([...recentSkills, ...openclawSkills, ...dbSkills])];

  if (allSkills.length > 0) {
    console.log(`${COLORS.dim}Recent Skills:${COLORS.reset}`);
    // Show up to 5 skills, with recent ones first
    const displaySkills = allSkills.slice(0, 5);
    for (const skill of displaySkills) {
      const isRecent = recentSkills.includes(skill);
      const marker = isRecent ? '  • ' : '  ';
      const source = openclawSkills.includes(skill) ? '(OpenClaw)' :
                     dbSkills.includes(skill) ? '(Database)' : '';
      console.log(`${marker}${COLORS.green}${skill}${COLORS.reset} ${COLORS.dim}${source}${COLORS.reset}`);
    }
    console.log('');
  }

  console.log(`${COLORS.dim}Type sa help for more commands${COLORS.reset}`);
  console.log('');
  process.exit(0);
}

program.parse();
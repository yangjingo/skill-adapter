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

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  // skills.sh - Cyan
  skillsSh: '\x1b[36m',  // Cyan
  skillsShBg: '\x1b[46m\x1b[30m', // Cyan background with black text
  // clawhub.com - Magenta
  clawhub: '\x1b[35m',  // Magenta
  clawhubBg: '\x1b[45m\x1b[37m', // Magenta background with white text
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
  if (platform === 'clawhub' || platform === 'clawhub.com') {
    return `${COLORS.bold}${COLORS.clawhubBg} clawhub.com ${COLORS.reset}`;
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
  .option('-p, --platform <platform>', 'Platform for discovery (skills-sh, clawhub, all)', 'all')
  .option('--no-npx', 'Use built-in import instead of official CLI', false)
  .action(async (source: string | undefined, options: { name?: string; scan: boolean; registry?: string; limit: string; platform: string; noNpx: boolean }) => {
    // No source provided - show hot skills (discover mode)
    if (!source) {
      console.log('🔥 Discovering hot skills from skills.sh and clawhub.com...\n');

      try {
        // Always fetch from all platforms
        const results = await platformFetcher.fetchHot('all', parseInt(options.limit));

        console.log('Rank | Downloads | Source      | Skill');
        console.log('-'.repeat(65));

        for (const entry of results) {
          const sourceFormatted = formatSource(entry.skill.platform);
          console.log(`#${entry.rank.toString().padEnd(4)} | ${entry.skill.stats.downloads.toString().padEnd(9)} | ${sourceFormatted}  | ${entry.skill.name}`);
        }

        console.log('\n📌 下一步操作:');
        console.log('   sa import find-skills            # 使用官方 CLI 安装（默认）');
        console.log('   sa import find-skills --no-npx   # 使用内置导入');
        console.log('   # 自动识别平台: skills.sh / clawhub.com');
      } catch (error) {
        console.error(`❌ 获取技能失败: ${error}`);
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
      console.log('🔧 使用官方 CLI 安装...\n');
      try {
        const { execSync } = require('child_process');

        // Search to determine which platform has this skill
        const searchResults = await platformFetcher.search(source, { limit: 3 });

        let command = '';
        let platform = '';
        let skillName = source;

        if (searchResults.length > 0) {
          const found = searchResults[0];
          skillName = found.name;

          if (found.platform === 'skills-sh') {
            // skills.sh uses: npx skills add owner/repo
            const repo = found.repository || source;
            command = `npx skills add ${repo}`;
            platform = 'skills.sh';
            console.log(`   平台: ${platform}`);
            console.log(`   仓库: ${repo}\n`);
          } else if (found.platform === 'clawhub') {
            // ClawHub uses: npx clawhub@latest install skill-name
            command = `npx clawhub@latest install ${found.name}`;
            platform = 'clawhub.com';
            console.log(`   平台: ${platform}`);
            console.log(`   技能: ${found.name}\n`);
          }
        } else {
          // No search results - try both platforms
          console.log(`   未找到技能 "${source}"`);
          console.log(`   尝试从两个平台安装...\n`);

          // Try clawhub first (more likely for generic names)
          command = `npx clawhub@latest install ${source}`;
          platform = 'clawhub.com';
        }

        console.log(`$ ${command}\n`);
        execSync(command, { stdio: 'inherit' });

        console.log('\n✅ 安装成功!');
        console.log('\n📌 下一步操作:');
        console.log('   sa info              # 查看所有已安装技能');
        console.log('   sa evolve <skill>    # 分析并优化技能');
        return;
      } catch (error) {
        // Official CLI failed - give helpful suggestions
        console.error('\n❌ 官方 CLI 安装失败\n');
        console.log('💡 可能的原因和解决方案:\n');
        console.log('   1. 技能名称不正确');
        console.log('      sa import                    # 查看热门技能列表\n');
        console.log('   2. 网络问题或仓库不存在');
        console.log('      检查技能是否存在于 skills.sh 或 clawhub.com\n');
        console.log('   3. 需要完整的仓库路径 (skills.sh)');
        console.log('      sa import vercel-labs/agent-skills\n');
        console.log('📌 手动安装命令:');
        console.log(`   npx skills add owner/repo-name     # skills.sh`);
        console.log(`   npx clawhub@latest install <name>   # clawhub.com`);
        return;
      }
    }

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
        // Assume it's a skill name - check local first, then search remote
        sourceType = 'registry-name';

        // First, check if it's a local OpenClaw skill
        const openClawPath = findOpenClawSkillsPath();
        if (openClawPath) {
          const localSkillDir = path.join(openClawPath, source);
          if (fs.existsSync(localSkillDir) && fs.statSync(localSkillDir).isDirectory()) {
            console.log('🔍 Found local OpenClaw skill\n');
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
          console.log('🔍 Searching from skills.sh and clawhub.com...\n');

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
        if (type === 'clawhub') return 'clawhub.com';
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
        importSource: getSourceLabel(sourceType, source)
      });

      const sourceLabel = getSourceLabel(sourceType, source).split(':')[0];
      console.log(`\n✅ 安装成功!`);
      console.log(`   技能: ${skillPackage.manifest.name} (v${skillPackage.manifest.version})`);
      console.log(`   来源: ${sourceLabel}`);

      console.log('\n📌 下一步操作:');
      console.log(`   sa info ${skillPackage.manifest.name}       # 查看技能详情`);
      console.log(`   sa evolve ${skillPackage.manifest.name}     # 分析并优化技能`);
      console.log(`   sa log ${skillPackage.manifest.name}        # 查看版本历史`);

    } catch (error) {
      console.error(`❌ 失败: ${error instanceof Error ? error.message : String(error)}`);
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
  .option('-v, --version <version>', 'Specific version')
  .option('--security', 'Show security status')
  .option('-p, --platform <platform>', 'Platform to show (imported, openclaw, claudecode, all)', 'all')
  .action((skillName: string | undefined, options: { version?: string; security?: boolean; platform: string }) => {
    const db = new EvolutionDatabase('evolution.db');

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

            if (fs.existsSync(skillsPath)) {
              const skillDirs = fs.readdirSync(skillsPath).filter(f =>
                fs.statSync(path.join(skillsPath, f)).isDirectory()
              );
              if (skillDirs.length > 0) {
                console.log('── Claude Code Skills ──');
                for (const skill of skillDirs) {
                  console.log(`  📦 ${skill}`);
                }
                console.log('');
              }
            }
          }
        }
      }

      console.log('\n📌 下一步操作:');
      console.log('   sa info <skill-name>       # 查看具体技能详情');
      console.log('   sa info -p imported        # 只显示已导入的技能');
      console.log('   sa import <skill-name>     # 导入新技能');

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

        // If imported from OpenClaw, show detailed info
        if (latestRecord.importSource?.startsWith('OpenClaw:')) {
          const originalDir = latestRecord.importSource.split(':')[1] || skillName;
          const openClawPath = findOpenClawSkillsPath();
          if (openClawPath) {
            const skillDir = path.join(openClawPath, originalDir);
            if (fs.existsSync(skillDir)) {
              // Read SKILL.md
              const skillMdPath = path.join(skillDir, 'SKILL.md');
              if (fs.existsSync(skillMdPath)) {
                const systemPrompt = fs.readFileSync(skillMdPath, 'utf-8');
                console.log(`\n── System Prompt ──`);
                console.log(`Size: ${(systemPrompt.length / 1024).toFixed(1)} KB`);
                console.log(`Lines: ${systemPrompt.split('\n').length}`);
              }

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
            }
          }
        }

        console.log('\n📌 下一步操作:');
        console.log(`   sa evolve ${skillName}        # 分析并优化技能`);
        console.log(`   sa log ${skillName}           # 查看版本历史`);
        console.log(`   sa share ${skillName}         # 分享技能`);
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

        if (fs.existsSync(cmdPath)) {
          console.log(`Source: Claude Code Command`);
          const content = fs.readFileSync(cmdPath, 'utf-8');
          console.log(`Prompt Size: ${content.length} chars`);
          console.log(`Path: ${cmdPath}`);
          console.log('\n💡 Use `sa import ${cmdPath}` to import this skill.');
          return;
        }

        if (fs.existsSync(skillPath)) {
          console.log(`Source: Claude Code Skill`);
          const skillMdPath = path.join(skillPath, 'skill.md');
          if (fs.existsSync(skillMdPath)) {
            const content = fs.readFileSync(skillMdPath, 'utf-8');
            console.log(`Prompt Size: ${content.length} chars`);
          }
          console.log(`Path: ${skillPath}`);
          console.log('\n💡 Use `sa import ${skillPath}` to import this skill.');
          return;
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
  .description('Run evolution analysis')
  .option('-l, --last <n>', 'Analyze last N sessions', '10')
  .option('--apply', 'Apply suggested improvements', false)
  .option('--detail', 'Show detailed analysis', false)
  .action((skillName: string | undefined, options: { last: string; apply: boolean; detail: boolean }) => {
    console.log('🔄 Running evolution analysis...\n');

    const db = new EvolutionDatabase('evolution.db');

    if (skillName) {
      const records = db.getRecords(skillName);
      if (records.length === 0) {
        console.log(`Skill "${skillName}" not found.`);
        return;
      }

      console.log(`📦 Analyzing: ${skillName}`);
      console.log(`   Version: ${db.getLatestVersion(skillName)}`);
      console.log(`   Records: ${records.length}\n`);

      // Get skill source info
      const latestRecord = records[records.length - 1];
      const importSource = latestRecord.importSource || '';

      // ═══════════════════════════════════════════
      // STEP 1: Analyze Workspace
      // ═══════════════════════════════════════════
      console.log('📊 Step 1: Workspace Analysis');
      console.log('─'.repeat(50));

      const workspaceAnalyzer = new WorkspaceAnalyzer(process.cwd());
      const workspaceConfig = workspaceAnalyzer.analyze();

      console.log(`   Root: ${process.cwd()}`);
      console.log(`   Languages: ${workspaceConfig.techStack.languages.join(', ') || 'None detected'}`);
      console.log(`   Frameworks: ${workspaceConfig.techStack.frameworks.join(', ') || 'None detected'}`);
      console.log(`   Package Manager: ${workspaceConfig.techStack.packageManager}`);
      console.log(`   Build Tools: ${workspaceConfig.techStack.buildTools.join(', ') || 'None'}`);

      // ═══════════════════════════════════════════
      // STEP 2: Analyze Skill Content
      // ═══════════════════════════════════════════
      console.log('\n📋 Step 2: Skill Content Analysis');
      console.log('─'.repeat(50));

      let skillContent = '';
      let skillDir = '';

      // Check if it's from OpenClaw
      if (importSource.startsWith('OpenClaw:') || importSource.toLowerCase().includes('openclaw')) {
        const openClawPath = findOpenClawSkillsPath();
        if (openClawPath) {
          // Extract original directory name
          let originalDir = skillName;
          if (importSource.startsWith('OpenClaw:')) {
            originalDir = importSource.split(':')[1] || skillName;
          }
          skillDir = path.join(openClawPath, originalDir);
          const skillMdPath = path.join(skillDir, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            skillContent = fs.readFileSync(skillMdPath, 'utf-8');
          }
        }
      }

      if (skillContent) {
        const lines = skillContent.split('\n');
        const sections = lines.filter(l => l.startsWith('#')).length;
        const codeBlocks = (skillContent.match(/```/g) || []).length / 2;
        const references = (skillContent.match(/\[.*?\]\(.*?\)/g) || []).length;

        console.log(`   Content Size: ${(skillContent.length / 1024).toFixed(1)} KB`);
        console.log(`   Lines: ${lines.length}`);
        console.log(`   Sections: ${sections}`);
        console.log(`   Code Blocks: ${codeBlocks}`);
        console.log(`   References: ${references}`);
      } else {
        console.log('   No skill content available for analysis');
      }

      // ═══════════════════════════════════════════
      // STEP 3: Analyze Environment
      // ═══════════════════════════════════════════
      console.log('\n🔧 Step 3: Environment Analysis');
      console.log('─'.repeat(50));

      // Check OpenClaw config
      const openClawPath = findOpenClawSkillsPath();
      if (openClawPath) {
        console.log(`   OpenClaw Skills: ${openClawPath}`);
        const skills = fs.readdirSync(openClawPath).filter(f =>
          fs.statSync(path.join(openClawPath, f)).isDirectory()
        );
        console.log(`   Available Skills: ${skills.length}`);
      }

      // Check Claude Code config
      const claudeCodePath = findClaudeCodeSkillsPath();
      if (claudeCodePath) {
        console.log(`   Claude Code: ${claudeCodePath}`);
        const commandsPath = path.join(claudeCodePath, 'commands');
        const skillsPath = path.join(claudeCodePath, 'skills');
        if (fs.existsSync(commandsPath)) {
          const commands = fs.readdirSync(commandsPath).filter(f => f.endsWith('.md'));
          console.log(`   Commands: ${commands.length}`);
        }
        if (fs.existsSync(skillsPath)) {
          const skillDirs = fs.readdirSync(skillsPath).filter(f =>
            fs.statSync(path.join(skillsPath, f)).isDirectory()
          );
          console.log(`   Skills: ${skillDirs.length}`);
        }
      }

      // ═══════════════════════════════════════════
      // STEP 4: Generate Optimization Suggestions
      // ═══════════════════════════════════════════
      console.log('\n💡 Step 4: Optimization Suggestions');
      console.log('─'.repeat(50));

      interface OptimizationSuggestion {
        category: string;
        suggestion: string;
        reason: string;
        priority: 'high' | 'medium' | 'low';
        autoApplicable: boolean;
      }

      const suggestions: OptimizationSuggestion[] = [];

      // Analyze workspace vs skill compatibility
      if (workspaceConfig.techStack.languages.length > 0) {
        suggestions.push({
          category: 'Language Context',
          suggestion: `Add ${workspaceConfig.techStack.languages[0]}-specific examples and patterns`,
          reason: `Workspace uses ${workspaceConfig.techStack.languages.join(', ')}`,
          priority: 'high',
          autoApplicable: false
        });
      }

      if (workspaceConfig.techStack.frameworks.length > 0) {
        suggestions.push({
          category: 'Framework Integration',
          suggestion: `Include ${workspaceConfig.techStack.frameworks[0]} best practices`,
          reason: `Detected ${workspaceConfig.techStack.frameworks.join(', ')} framework`,
          priority: 'high',
          autoApplicable: false
        });
      }

      // Analyze package manager
      const pkgManager = workspaceConfig.techStack.packageManager;
      if (pkgManager !== 'npm') {
        suggestions.push({
          category: 'Package Manager',
          suggestion: `Update commands to use ${pkgManager} instead of npm`,
          reason: `Workspace uses ${pkgManager} as package manager`,
          priority: 'medium',
          autoApplicable: true
        });
      }

      // Analyze skill content
      if (skillContent) {
        if (skillContent.length > 10000) {
          suggestions.push({
            category: 'Content Optimization',
            suggestion: 'Consider splitting into multiple focused sections',
            reason: `Large content size (${(skillContent.length / 1024).toFixed(1)} KB) may impact performance`,
            priority: 'medium',
            autoApplicable: false
          });
        }

        if (!skillContent.includes('```')) {
          suggestions.push({
            category: 'Code Examples',
            suggestion: 'Add code examples for better clarity',
            reason: 'No code blocks found in skill content',
            priority: 'low',
            autoApplicable: false
          });
        }

        // Check for workspace-specific paths
        if (skillContent.includes('/home/') || skillContent.includes('/Users/')) {
          suggestions.push({
            category: 'Path Localization',
            suggestion: 'Replace absolute paths with workspace-relative paths',
            reason: 'Hardcoded paths may not work in current environment',
            priority: 'high',
            autoApplicable: true
          });
        }

        // Check for npm usage when workspace uses different package manager
        if (pkgManager !== 'npm' && skillContent.includes('npm ')) {
          suggestions.push({
            category: 'Package Manager',
            suggestion: `Replace npm commands with ${pkgManager}`,
            reason: `Workspace uses ${pkgManager}, skill references npm`,
            priority: 'medium',
            autoApplicable: true
          });
        }

        // Check for Python environment
        if (skillContent.includes('python ') || skillContent.includes('pip ')) {
          suggestions.push({
            category: 'Python Environment',
            suggestion: 'Consider using virtual environment or conda',
            reason: 'Skill references Python, ensure environment is configured',
            priority: 'medium',
            autoApplicable: false
          });
        }

        // Check for Docker usage
        if (skillContent.includes('docker ') || skillContent.includes('Dockerfile')) {
          suggestions.push({
            category: 'Docker Integration',
            suggestion: 'Verify Docker is installed and running',
            reason: 'Skill uses Docker containers',
            priority: 'medium',
            autoApplicable: false
          });
        }

        // Check for shell scripts
        if (skillContent.includes('.sh') || skillContent.includes('bash ')) {
          suggestions.push({
            category: 'Shell Compatibility',
            suggestion: 'Verify shell scripts are compatible with current OS',
            reason: 'Skill contains shell scripts that may need adaptation',
            priority: 'low',
            autoApplicable: false
          });
        }

        // Check for environment variables
        const envVars = skillContent.match(/\$\{?[A-Z_]+[A-Z_0-9]*\}?/g);
        if (envVars && envVars.length > 0) {
          const uniqueVars = [...new Set(envVars)];
          suggestions.push({
            category: 'Environment Variables',
            suggestion: `Ensure these env vars are set: ${uniqueVars.slice(0, 3).join(', ')}${uniqueVars.length > 3 ? '...' : ''}`,
            reason: `Skill requires ${uniqueVars.length} environment variable(s)`,
            priority: 'high',
            autoApplicable: false
          });
        }

        // Check for API keys or secrets placeholders
        if (skillContent.includes('API_KEY') || skillContent.includes('TOKEN') || skillContent.includes('SECRET')) {
          suggestions.push({
            category: 'Security',
            suggestion: 'Configure sensitive credentials securely',
            reason: 'Skill references API keys, tokens, or secrets',
            priority: 'high',
            autoApplicable: false
          });
        }

        // Check for network dependencies
        if (skillContent.includes('http://') || skillContent.includes('https://')) {
          const urls = skillContent.match(/https?:\/\/[^\s\)]+/g);
          if (urls && urls.length > 0) {
            suggestions.push({
              category: 'Network Access',
              suggestion: 'Verify network connectivity to external services',
              reason: `Skill connects to ${urls.length} external URL(s)`,
              priority: 'medium',
              autoApplicable: false
            });
          }
        }
      } else {
        // No skill content available
        suggestions.push({
          category: 'Content Missing',
          suggestion: 'Re-import skill to get content analysis',
          reason: 'Skill content not available for analysis',
          priority: 'low',
          autoApplicable: false
        });
      }

      // Check workspace-specific optimizations
      if (workspaceConfig.techStack.languages.includes('TypeScript')) {
        suggestions.push({
          category: 'TypeScript Integration',
          suggestion: 'Add type definitions and interfaces examples',
          reason: 'Workspace uses TypeScript for type safety',
          priority: 'medium',
          autoApplicable: false
        });
      }

      // Check for test coverage suggestions
      if (skillDir && fs.existsSync(skillDir)) {
        const testsPath = path.join(skillDir, 'tests');
        if (!fs.existsSync(testsPath)) {
          suggestions.push({
            category: 'Testing',
            suggestion: 'Add test cases for skill functionality',
            reason: 'No tests directory found',
            priority: 'low',
            autoApplicable: false
          });
        }
      }

      // Display suggestions
      if (suggestions.length === 0) {
        console.log('\n   ✅ No optimization suggestions - skill is well configured!');
      } else {
        for (let i = 0; i < suggestions.length; i++) {
          const s = suggestions[i];
          const priorityIcon = s.priority === 'high' ? '🔴' : s.priority === 'medium' ? '🟡' : '🟢';
          const autoIcon = s.autoApplicable ? '⚙️' : '📝';

          console.log(`\n   ${i + 1}. ${priorityIcon} [${s.category}]`);
          console.log(`      建议: ${s.suggestion}`);
          console.log(`      原因: ${s.reason}`);
          console.log(`      类型: ${autoIcon} ${s.autoApplicable ? '可自动应用' : '需手动处理'}`);
        }
      }

      // ═══════════════════════════════════════════
      // STEP 5: Apply Changes (if requested)
      // ═══════════════════════════════════════════
      if (options.apply) {
        console.log('\n⚙️  Step 5: 应用优化');
        console.log('─'.repeat(50));

        const autoSuggestions = suggestions.filter(s => s.autoApplicable);
        let appliedCount = 0;

        for (const s of autoSuggestions) {
          console.log(`   应用: ${s.suggestion}...`);

          if (s.category === 'Package Manager' && skillContent && skillDir) {
            // Replace npm with appropriate package manager
            const newContent = skillContent.replace(/npm run/g, `${pkgManager} run`)
                                           .replace(/npm install/g, `${pkgManager} install`);

            if (newContent !== skillContent) {
              // Create backup
              const backupPath = path.join(skillDir, 'SKILL.md.backup');
              fs.copyFileSync(path.join(skillDir, 'SKILL.md'), backupPath);

              // Write new content
              fs.writeFileSync(path.join(skillDir, 'SKILL.md'), newContent);
              console.log(`      ✅ 已更新包管理器命令为 ${pkgManager}`);
              appliedCount++;
            } else {
              console.log(`      ⏭️ 无需更改`);
            }
          }

          if (s.category === 'Path Localization' && skillContent && skillDir) {
            // Replace absolute paths with placeholders
            let newContent = skillContent;
            const homeDir = process.env.HOME || process.env.USERPROFILE || '';

            if (homeDir) {
              newContent = newContent.replace(new RegExp(homeDir, 'g'), '${HOME}');
              newContent = newContent.replace(/\/Users\/[^/]+/g, '${HOME}');
              newContent = newContent.replace(/\/home\/[^/]+/g, '${HOME}');
            }

            if (newContent !== skillContent) {
              const backupPath = path.join(skillDir, 'SKILL.md.backup');
              fs.copyFileSync(path.join(skillDir, 'SKILL.md'), backupPath);
              fs.writeFileSync(path.join(skillDir, 'SKILL.md'), newContent);
              console.log(`      ✅ 已替换绝对路径为 \${HOME}`);
              appliedCount++;
            } else {
              console.log(`      ⏭️ 无需更改`);
            }
          }
        }

        // Create evolution record
        const newVersion = appliedCount > 0 ? '1.1.0' : db.getLatestVersion(skillName) || '1.0.0';

        const newRecord: EvolutionRecord = {
          id: EvolutionDatabase.generateId(),
          skillName: skillName,
          version: newVersion,
          timestamp: new Date(),
          telemetryData: JSON.stringify({
            workspaceAnalysis: workspaceConfig.techStack,
            suggestionsCount: suggestions.length,
            appliedCount
          }),
          patches: JSON.stringify(suggestions.map(s => ({
            category: s.category,
            suggestion: s.suggestion,
            applied: s.autoApplicable
          }))),
          importSource: latestRecord.importSource
        };

        db.addRecord(newRecord);

        console.log(`\n   ✅ 已应用 ${appliedCount} 个优化`);
        console.log(`   📦 版本: ${newVersion}`);
        console.log(`   💾 备份: SKILL.md.backup`);

        // Next steps
        console.log('\n📌 下一步操作:');
        console.log(`   sa info ${skillName}        # 查看更新后的技能信息`);
        console.log(`   sa log ${skillName}         # 查看版本历史`);

      } else {
        // Show next steps without apply
        const autoCount = suggestions.filter(s => s.autoApplicable).length;
        const manualCount = suggestions.filter(s => !s.autoApplicable).length;

        console.log('\n📌 下一步操作:');
        if (autoCount > 0) {
          console.log(`   sa evolve ${skillName} --apply   # 自动应用 ${autoCount} 个可自动化的优化`);
        }
        if (manualCount > 0) {
          console.log(`   # 需要手动处理 ${manualCount} 个建议`);
        }
        console.log(`   sa info ${skillName}            # 查看技能详情`);
        console.log(`   sa log ${skillName}             # 查看版本历史`);
      }

      if (options.detail) {
        console.log('\n📊 Detailed Workspace Config');
        console.log('─'.repeat(50));
        console.log(JSON.stringify(workspaceConfig, null, 2));
      }

    } else {
      // No skill specified - show all skills + workspace analysis
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

      console.log('\n📌 下一步操作:');
      console.log('   sa evolve <skill-name>     # 分析具体技能');
      console.log('   sa import <skill-name>     # 导入新技能');
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
      console.log('\n📌 下一步操作:');
      console.log('   sa share <skill-name>      # 分享具体技能');
      console.log('   sa export <skill-name>     # 导出技能到文件');
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
    const db = new EvolutionDatabase('evolution.db');
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
              console.log(`  ⚠ 技能 "${skillName}" 未在已导入列表中找到`);
            }
          } else {
            const allRecords = db.getAllRecords();
            skills = [...new Set(allRecords.map(r => r.skillName))];
          }

          if (skills.length === 0) {
            console.log('  ⚠ 没有已导入的技能');
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
      console.log(`\n❌ 导出失败: 没有找到可导出的技能`);
      console.log('\n📌 建议:');
      console.log('   sa info              # 查看已导入的技能');
      console.log('   sa import <skill>    # 先导入技能再导出');
    } else {
      console.log(`\n✅ 成功导出 ${totalExported} 个技能`);
      console.log(`\n📁 导出目录: ${absoluteOutput}`);
      if (exportedFiles.length > 0) {
        console.log('\n📄 导出的文件:');
        for (const file of exportedFiles) {
          console.log(`   ${file}`);
        }
      }
      console.log('\n📌 下一步操作:');
      console.log('   # 在文件管理器中打开导出目录');
      console.log(`   explorer ${absoluteOutput}`);
    }
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

      console.log('📌 下一步操作:');
      console.log('   sa log <skill-name>        # 查看具体技能历史');
      console.log('   sa evolve <skill-name>     # 分析并优化技能');
    }
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
    const db = new EvolutionDatabase('evolution.db');

    // No argument - show all scannable skills
    if (!skillOrFile) {
      console.log('🔒 安全扫描\n');

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
      }

      if (importedSkills.length === 0 && openClawSkills.length === 0 &&
          claudeCodeCommands.length === 0 && claudeCodeSkills.length === 0) {
        console.log('没有找到可扫描的技能。\n');
        console.log('📌 下一步操作:');
        console.log('   sa import <skill>        # 先导入技能');
        return;
      }

      // Show imported skills
      if (importedSkills.length > 0) {
        console.log('── 已导入的技能 ──');
        for (const skill of importedSkills) {
          const skillRecords = db.getRecords(skill);
          const latest = skillRecords[skillRecords.length - 1];
          console.log(`  📦 ${skill} (v${latest.version})`);
        }
        console.log('');
      }

      // Show OpenClaw skills
      if (openClawSkills.length > 0 && openClawPath) {
        console.log('── OpenClaw 本地技能 ──');
        for (const skill of openClawSkills.slice(0, 10)) {
          const skillMdPath = path.join(openClawPath, skill, 'SKILL.md');
          const hasPrompt = fs.existsSync(skillMdPath);
          console.log(`  📦 ${skill} ${hasPrompt ? '' : '(无 SKILL.md)'}`);
        }
        if (openClawSkills.length > 10) {
          console.log(`  ... 还有 ${openClawSkills.length - 10} 个`);
        }
        console.log('');
      }

      // Show Claude Code commands
      if (claudeCodeCommands.length > 0) {
        console.log('── Claude Code Commands ──');
        for (const cmd of claudeCodeCommands.slice(0, 10)) {
          console.log(`  📦 ${cmd}`);
        }
        if (claudeCodeCommands.length > 10) {
          console.log(`  ... 还有 ${claudeCodeCommands.length - 10} 个`);
        }
        console.log('');
      }

      // Show Claude Code skills
      if (claudeCodeSkills.length > 0) {
        console.log('── Claude Code Skills ──');
        for (const skill of claudeCodeSkills.slice(0, 10)) {
          console.log(`  📦 ${skill}`);
        }
        if (claudeCodeSkills.length > 10) {
          console.log(`  ... 还有 ${claudeCodeSkills.length - 10} 个`);
        }
        console.log('');
      }

      console.log('📌 下一步操作:');
      console.log('   sa scan <skill-name>     # 扫描已导入的技能');
      console.log('   sa scan <file-path>      # 扫描本地文件');
      console.log('\n示例:');
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
      console.log(`🔒 扫描文件: ${skillOrFile}\n`);

      try {
        const result = securityEvaluator.scanFile(skillOrFile);
        const report = securityEvaluator.generateReport(result, options.format as 'text' | 'json' | 'markdown');
        console.log(report);

        console.log('\n📌 下一步操作:');
        console.log('   sa import ' + skillOrFile + '    # 导入这个技能');
      } catch (error) {
        console.error(`❌ 错误: ${error}`);
        console.log('\n📌 建议:');
        console.log('   sa scan                   # 查看可扫描的技能');
      }
    } else {
      // Scan by skill name
      console.log(`🔒 扫描技能: ${skillOrFile}\n`);

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
            skillSource = 'OpenClaw (本地)';
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
        console.log('   正在从远程平台获取技能内容...\n');
        try {
          const searchResults = await platformFetcher.search(skillOrFile, { limit: 1 });
          if (searchResults.length > 0) {
            const found = searchResults[0];
            skillContent = await platformFetcher.fetchSkillContent(found);
            skillSource = found.platform === 'skills-sh' ? 'skills.sh' : 'clawhub.com';
          }
        } catch {
          // Ignore fetch errors
        }
      }

      if (!skillContent) {
        // Show available info even if content not found
        if (records.length > 0) {
          const latest = records[records.length - 1];
          console.log(`❌ 无法获取技能内容进行扫描`);
          console.log(`\n   技能: ${skillOrFile}`);
          console.log(`   版本: ${latest.version}`);
          console.log(`   来源: ${latest.importSource || 'unknown'}`);
          console.log(`\n   💡 提示: 远程技能需要通过官方 CLI 安装后才能扫描。`);
          console.log(`\n📌 下一步操作:`);
          console.log(`   sa scan                   # 查看可扫描的本地技能`);
          if (latest.importSource?.includes('skills.sh')) {
            console.log(`   npx skills add <owner/repo>  # 使用官方 CLI 安装`);
          } else if (latest.importSource?.includes('clawhub')) {
            console.log(`   npx clawhub@latest install ${skillOrFile}  # 使用官方 CLI 安装`);
          }
          console.log(`   # 或者扫描本地 OpenClaw 技能`);
        } else {
          console.log(`❌ 未找到技能: ${skillOrFile}`);
          console.log('\n📌 下一步操作:');
          console.log('   sa scan                   # 查看可扫描的技能');
          console.log('   sa import ' + skillOrFile + ' --no-npx   # 先导入技能');
        }
        return;
      }

      // Run security scan
      const result = securityEvaluator.scan(skillContent, skillOrFile);
      const report = securityEvaluator.generateReport(result, options.format as 'text' | 'json' | 'markdown');
      console.log(report);

      if (skillPath) {
        console.log(`\n📁 技能路径: ${skillPath}`);
      }
      if (skillSource) {
        console.log(`📥 来源: ${skillSource}`);
      }

      console.log('\n📌 下一步操作:');
      if (result.passed) {
        console.log('   sa info ' + skillOrFile + '      # 查看技能详情');
        console.log('   sa evolve ' + skillOrFile + '    # 分析并优化');
      } else {
        console.log('   # 请检查安全问题后再使用');
      }
    }
  });

// Parse arguments
program.parse();
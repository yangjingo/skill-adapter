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
 * - sa export            Export local skill package
 *
 * Manage:
 * - sa info [skill]      View skill details (no skill = list all)
 * - sa scan <file>       Security scan
 * - sa share <skill>     Share local skill by creating PR
 *
 * Evolution:
 * - sa evolve <skill>    Run evolution analysis
 * - sa summary <skill>   View evolution metrics table
 * - sa log [skill]       View version history (git-log style)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import ora from 'ora';

// Core modules
import { telemetry, WorkspaceAnalyzer, SessionAnalyzer, skillPatcher, EvolutionDatabase, EvolutionRecord, VERSION } from './index';

// Evolution Engine
import { EvolutionEngine, evolutionEngine, EvolutionRecommendation } from './core/evolution-engine';
import { saAgentEvolutionEngine, SAAgentRecommendation, modelConfigLoader } from './core/evolution';

// New modules
import { securityEvaluator } from './core/security';
import { registerScanCommand } from './core/security/scan-command';
import { skillExporter, shareByPr, DEFAULT_PR_REPO } from './core/sharing';
import { platformFetcher, recommendationEngine, skillAnalyzer, skillsStore } from './core/discovery';
import { findClaudeCodeSkillsPath, findOpenClawSkillsPath, getClaudeCodePlugins } from './core/discovery/paths';
import { RemoteSkill } from './types/discovery';
import { versionManager } from './core/versioning';
import { agentDetector } from './core/config';
import { configManager, UserPreferences } from './core/config-manager';
import { renderEvolutionSummary } from './core/summary';
import {
  loadTrackedSkill,
  analyzeSkillStaticContent,
  summarizeRecommendationPriorities,
  printEvolutionNextSteps,
  printRecommendationSummaryTable,
  printEvolutionRuntimeStatus
} from './core/evolution/cli-helpers';

const program = new Command();
program.showHelpAfterError();
program.showSuggestionAfterError();

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

const COMMUNITY_SKILLS_FEED_URL = 'https://github.com/leow3lab/ascend-skills';
const COMMUNITY_CURATED_SKILLS_URL = 'https://github.com/leow3lab/awesome-ascend-skills';

/**
 * Format platform source with color and bold
 */
function formatSource(platform: string): string {
  if (platform === 'skills-sh' || platform === 'skills.sh') {
    return `${COLORS.bold}${COLORS.skillsShBg} skills.sh ${COLORS.reset}`;
  }
  return platform;
}

function normalizeCliArgs(argv: string[]): string[] {
  return argv.map(arg => (arg === '-pr' ? '--pr' : arg));
}

function normalizeDiscoveryPlatform(platform: string): 'skills-sh' | 'custom' {
  const normalized = platform.toLowerCase();
  if (normalized === 'custom') return 'custom';
  if (normalized === 'clawhub' || normalized === 'clawhub.com') {
    // Compatibility fallback until a dedicated clawhub registry is wired up.
    return 'skills-sh';
  }
  return 'skills-sh';
}

function parseSkillsShUrl(source: string): { pageUrl: string; githubRepo?: string; skill?: string } | null {
  const trimmed = source.trim();
  if (!/^https?:\/\/skills\.sh\//i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 3) {
      return {
        pageUrl: `https://skills.sh/${segments[0]}/${segments[1]}/${segments[2]}`,
        githubRepo: `${segments[0]}/${segments[1]}`,
        skill: segments[2]
      };
    }

    if (segments.length === 2) {
      return {
        pageUrl: `https://skills.sh/${segments[0]}/${segments[1]}`,
        skill: segments[1]
      };
    }
  } catch {
    return null;
  }

  return null;
}

function buildManualInstallHint(repoRef: string, skillName?: string): string {
  const parts = [`npx skills add ${repoRef}`];
  if (skillName) {
    parts.push(`--skill ${skillName}`);
  }
  return parts.join(' ');
}

function promptYesNo(question: string, defaultValue = true): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.resolve(false);
  }

  const suffix = defaultValue ? '[Y/n]' : '[y/N]';
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`${question} ${suffix} `, answer => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (!normalized) {
        resolve(defaultValue);
        return;
      }
      resolve(['y', 'yes'].includes(normalized));
    });
  });
}

function getGhBinary(optionsGh?: string): string {
  return optionsGh || process.env.GH_CLI_PATH || 'gh';
}

function printGitHubCliGuidance(ghBinary: string): void {
  console.log('\nGitHub PR auto-create is unavailable (`gh` not found).');
  console.log('You can still push branch and open PR manually.');
  console.log('To enable auto-create:');
  console.log('  1) Install gh: npm run setup:gh');
  console.log('  2) Login:      gh auth login');
  if (ghBinary !== 'gh') {
    console.log(`  3) Or use:     sa share <skill> --gh ${ghBinary}`);
  }
}

function printPrRepoConfigGuidance(skillName: string, repo: string, isDefaultRepo: boolean): void {
  console.log(`PR target: ${repo}`);
  if (isDefaultRepo) {
    console.log(`Default flow: sa share ${skillName}`);
    console.log(`Need another repo? sa share ${skillName} --repo https://github.com/<org>/<repo>`);
  }
}

function printPrFailureGuidance(skillName: string, repo: string, branchName: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.log('\nTroubleshooting suggestions:');

  if (message.includes('spawnSync git ENOENT') || message.includes("spawn git ENOENT")) {
    console.log('- Git is not available in current PATH');
    console.log('- Install Git: https://git-scm.com/downloads');
    console.log('- Verify: git --version');
    console.log('- Restart terminal after installation');
  }

  if (message.includes('already exists')) {
    console.log(`- Branch already exists: ${branchName}`);
    console.log(`- Retry with another branch name: sa share <skill> --branch ${branchName}-retry`);
  }

  if (message.includes('Permission denied') || message.includes('Authentication failed') || message.includes('403')) {
    console.log('- Check GitHub auth: gh auth status');
    console.log('- Prefer GH_TOKEN + SSH for git push');
    console.log('- Check write permission to target repository');
    console.log('\nNext tips (if you are not owner/collaborator):');
    console.log(`- Retry with fork PR: sa share ${skillName} --repo ${repo} --fork-pr --yes`);
  }

  if (message.includes('nothing to commit') || message.includes('no changes added to commit')) {
    console.log('- No file changes detected against current base branch');
    console.log('- This usually means the same skill content/version already exists in target repository');
    console.log('- Change skill content/version, then retry');
  }

  console.log(`- Verify branch on remote: git ls-remote --heads "${repo}" "${branchName}"`);
}

function getDefaultBranch(cwd: string): string {
  const { execSync } = require('child_process');

  try {
    const originInfo = execSync('git remote show origin', { cwd, encoding: 'utf-8' });
    const headBranchMatch = originInfo.match(/HEAD branch:\s*(.+)$/m);
    if (headBranchMatch?.[1]) {
      return headBranchMatch[1].trim();
    }
  } catch {
    // Ignore and fall back to the next strategy.
  }

  try {
    const symbolicRef = execSync('git symbolic-ref --quiet refs/remotes/origin/HEAD', { cwd, encoding: 'utf-8' });
    const symbolicMatch = symbolicRef.match(/refs\/remotes\/origin\/(.+)$/m);
    if (symbolicMatch?.[1]) {
      return symbolicMatch[1].trim();
    }
  } catch {
    // Ignore and fall back to the default branch name.
  }

  return 'main';
}

interface ImportCommandOptions {
  name?: string;
  scan: boolean;
  limit: string;
}

function printCommunityLinks(mode: 'radar' | 'targets'): void {
  if (mode === 'radar') {
    console.log('\n?? Community Radar:');
    console.log(`   Shared skills feed: ${COMMUNITY_SKILLS_FEED_URL}`);
    console.log(`   Curated list:       ${COMMUNITY_CURATED_SKILLS_URL}`);
    console.log('\n? Your turn: polish one skill and share it with: sa share <skill-name>');
    return;
  }

  console.log('\n?? Community Targets:');
  console.log(`   ${COMMUNITY_SKILLS_FEED_URL}`);
  console.log(`   ${COMMUNITY_CURATED_SKILLS_URL}`);
}

async function handleImportDiscoverMode(limitText: string): Promise<void> {
  console.log('?? Discovering hot skills from skills.sh...\n');

  try {
    const limit = parseInt(limitText);
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

    console.log('\n?? Next Steps:');
    console.log('   sa import <skill>            # Install a skill');
    console.log('   sa import <owner/repo>       # Install from skills.sh');
  } catch (error) {
    console.error(`? Failed to fetch skills: ${error}`);
  }
}

function resolveImportSource(source: string): { source: string; isLocalPath: boolean; isOpenClawSkill: boolean } {
  let resolvedSource = source;
  let isLocalPath = fs.existsSync(resolvedSource);

  const isOpenClawSkill = (() => {
    const openClawPath = findOpenClawSkillsPath();
    if (openClawPath) {
      const localSkillDir = path.join(openClawPath, resolvedSource);
      return fs.existsSync(localSkillDir) && fs.statSync(localSkillDir).isDirectory();
    }
    return false;
  })();

  if (!isLocalPath) {
    const claudeCodePath = findClaudeCodeSkillsPath();
    if (claudeCodePath) {
      const localClaudeSkillDir = path.join(claudeCodePath, 'skills', resolvedSource);
      const hasSkillMd = fs.existsSync(path.join(localClaudeSkillDir, 'skill.md'));
      const hasSkillMdUpper = fs.existsSync(path.join(localClaudeSkillDir, 'SKILL.md'));
      if (fs.existsSync(localClaudeSkillDir) && fs.statSync(localClaudeSkillDir).isDirectory() && (hasSkillMd || hasSkillMdUpper)) {
        console.log('?? Found local Claude Code skill\n');
        resolvedSource = localClaudeSkillDir;
        isLocalPath = true;
      }
    }
  }

  return { source: resolvedSource, isLocalPath, isOpenClawSkill };
}

async function handleImportRecommendOnly(source: string): Promise<void> {
  const query = source.startsWith('http://') || source.startsWith('https://')
    ? (source.split('/').filter(Boolean).pop() || source)
    : source;
  const searchUrl = `https://skills.sh/?q=${encodeURIComponent(query)}`;

  console.log('?? Searching on skills.sh...\n');
  console.log(`   ${searchUrl}\n`);

  const [searchResults, hotResults] = await Promise.all([
    platformFetcher.search(query, { limit: 5 }).catch(() => [] as RemoteSkill[]),
    platformFetcher.fetchHot('skills-sh', 5).catch(() => [] as Array<{ rank: number; skill: RemoteSkill }>)
  ]);

  if (searchResults.length > 0) {
    console.log('?? Recommendations:');
    for (const [idx, result] of searchResults.entries()) {
      console.log(`  ${idx + 1}. ${result.name} (${result.stats.downloads} downloads)`);
      if (result.url) {
        console.log(`     ${result.url}`);
      }
    }
  } else {
    console.log('?? Recommendations: none');
  }

  if (hotResults.length > 0) {
    console.log('\n?? Trending:');
    for (const entry of hotResults) {
      console.log(`  #${entry.rank} ${entry.skill.name} (${entry.skill.stats.downloads} downloads)`);
    }
  }

  console.log('\n?? This command no longer auto-downloads remote skills.');
  console.log('   Install manually if needed: npx skills add <repo> --skill <name>');
  printCommunityLinks('radar');
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
    // Show model config status
    const modelStatus = modelConfigLoader.getStatus();

    if (options.show) {
      console.log('📋 Current Configuration\n');
      console.log(`  Skills Repo:  ${CONFIG.skillsRepo}`);
      console.log(`  Registry:     ${CONFIG.registryUrl}`);
      console.log(`  Platform:     ${CONFIG.defaultPlatform}`);
      console.log(`  Config File:  ${configPath}`);

      // Show AI Model status
      console.log('\n🤖 AI Model:');
      if (modelStatus.configured) {
        console.log(`   Status:      ✅ Configured`);
        console.log(`   Provider:    ${modelStatus.source}`);
        console.log(`   Model:       ${modelStatus.model}`);
        console.log(`   Endpoint:    ${modelStatus.endpoint}`);
        // Show if API key is set (masked)
        const configResult = modelConfigLoader.load();
        if (configResult.success && configResult.config?.apiKey) {
          const key = configResult.config.apiKey;
          const maskedKey = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '****';
          console.log(`   API Key:     ${maskedKey}`);
        } else {
          console.log(`   API Key:     ⚠️  Not set`);
        }
      } else {
        console.log(`   Status:      ⚠️  Not configured`);
        console.log('\n   Run `sa init` to see setup guide.');
      }
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

    // Show AI Model status and guidance
    console.log('\n🤖 AI Model:');
    if (modelStatus.configured) {
      console.log(`   Status:      ✅ Configured`);
      console.log(`   Provider:    ${modelStatus.source}`);
      console.log(`   Model:       ${modelStatus.model}`);
      console.log(`   Endpoint:    ${modelStatus.endpoint}`);
      // Show if API key is set (masked)
      const configResult = modelConfigLoader.load();
      if (configResult.success && configResult.config?.apiKey) {
        const key = configResult.config.apiKey;
        const maskedKey = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '****';
        console.log(`   API Key:     ${maskedKey}`);
      } else {
        console.log(`   API Key:     ⚠️  Not set`);
      }
    } else {
      console.log(`   Status:      ⚠️  Not configured`);
      console.log('\n╔══════════════════════════════════════════════════════════════════╗');
      console.log('║                    🚨 AI Model Setup Required                     ║');
      console.log('╠══════════════════════════════════════════════════════════════════╣');
      console.log('║                                                                   ║');
      console.log('║  Skill-Adapter needs AI model for evolve/scan/recommend.         ║');
      console.log('║                                                                   ║');
      console.log('║  Choose one option below:                                        ║');
      console.log('║                                                                   ║');
      console.log('║  Option 1: Claude Code (Recommended)                             ║');
      console.log('║  ─────────────────────────────────────                           ║');
      console.log('║  Create ~/.claude/settings.json:                                 ║');
      console.log('║                                                                   ║');
      console.log('║    {                                                             ║');
      console.log('║      "env": {                                                    ║');
      console.log('║        "ANTHROPIC_AUTH_TOKEN": "your-api-key",                  ║');
      console.log('║        "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6"    ║');
      console.log('║      }                                                           ║');
      console.log('║    }                                                             ║');
      console.log('║                                                                   ║');
      console.log('║  Option 2: Custom Endpoint (Alibaba DashScope, etc.)             ║');
      console.log('║  ────────────────────────────────────────────────                ║');
      console.log('║    {                                                             ║');
      console.log('║      "env": {                                                    ║');
      console.log('║        "ANTHROPIC_AUTH_TOKEN": "your-token",                    ║');
      console.log('║        "ANTHROPIC_BASE_URL": "https://your-endpoint",           ║');
      console.log('║        "ANTHROPIC_DEFAULT_SONNET_MODEL": "your-model"           ║');
      console.log('║      }                                                           ║');
      console.log('║    }                                                             ║');
      console.log('║                                                                   ║');
      console.log('║  Option 3: Environment Variables                                 ║');
      console.log('║  ─────────────────────────────────                               ║');
      console.log('║    export ANTHROPIC_AUTH_TOKEN="your-api-key"                   ║');
      console.log('║    export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-4-6"    ║');
      console.log('║    export ANTHROPIC_BASE_URL="https://api.anthropic.com"        ║');
      console.log('║                                                                   ║');
      console.log('╚══════════════════════════════════════════════════════════════════╝');
    }

    console.log('\n💡 Environment Variables:');
    console.log('   SKILL_ADAPTER_REPO      - Skills repository URL');
    console.log('   SKILL_ADAPTER_REGISTRY  - Default registry URL');
    console.log('   ANTHROPIC_AUTH_TOKEN    - AI model API key (required for evolve/scan/recommend)');
  });

// ============================================
// sa import [source] - Unified import/discover
// ============================================
program
  .command('import [source]')
  .description('Import or discover skills')
  .option('-n, --name <name>', 'Rename skill on import')
  .option('--no-scan', 'Skip security scan')
  .option('-l, --limit <number>', 'Limit results when discovering', '10')
  .action(async (source: string | undefined, options: ImportCommandOptions) => {
    if (!source) {
      await handleImportDiscoverMode(options.limit);
      return;
    }

    console.log(`?? Getting skill from: ${source}\n`);
    const resolved = resolveImportSource(source);
    source = resolved.source;

    if (!resolved.isLocalPath && !resolved.isOpenClawSkill) {
      await handleImportRecommendOnly(source);
      return;
    }

    const db = new EvolutionDatabase();

    try {
      // Detect source type
      let skillPackage = null;
      let sourceType = 'unknown';
      let skillPath = '';  // Track where skill files are located
      let contentFetchWarning = '';

      if (source.startsWith('http://') || source.startsWith('https://')) {
        sourceType = 'url';

        if (source.includes('skills.sh') || source.includes('localhost:3000')) {
          sourceType = 'registry';
          console.log('🔍 Detected: Registry URL');

          const registrySkill = parseSkillsShUrl(source);
          if (registrySkill?.githubRepo && registrySkill.skill) {
            const commandRepo = `https://github.com/${registrySkill.githubRepo}`;
            console.log(`   Command: ${buildManualInstallHint(commandRepo, registrySkill.skill)}`);
          }

          // Extract skill name from URL
          const name = options.name || registrySkill?.skill || source.split('/').pop()?.replace(/\.git$/, '') || 'imported-skill';
          const registryUrl = new URL(source).origin;

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
          } else if (fs.existsSync(skillMdPath)) {
            // Claude Code format (skill.md without skill.json)
            const skillName = options.name || path.basename(source);
            const systemPrompt = fs.readFileSync(skillMdPath, 'utf-8');

            skillPackage = {
              id: `skill_${Date.now()}`,
              manifest: {
                name: skillName,
                version: '1.0.0',
                description: `Claude Code skill: ${skillName}`,
                author: 'claude-code',
                license: 'MIT',
                keywords: [],
                main: 'skill.md',
                compatibility: { platforms: ['claude-code'] }
              },
              content: { systemPrompt },
              metadata: { createdAt: new Date(), updatedAt: new Date() }
            };
            console.log('🔍 Detected: Claude Code skill format');
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

          const loadRemoteContent = async (found: RemoteSkill): Promise<{ content: string; fetched: boolean }> => {
          const contentSpinner = ora(`Fetching content for ${found.name}...`).start();
          const content = await platformFetcher.fetchSkillContent(found);
          if (content) {
            contentSpinner.succeed(`Fetched content for ${found.name}`);
            return { content, fetched: true };
          }
          contentSpinner.warn(`Could not fetch content for ${found.name}; using fallback description`);
          console.log(`   Repro: sa import ${source}`);
          return { content: '', fetched: false };
          };

          // Search from both platforms
          const searchResults = await platformFetcher.search(source, { limit: 5 });

          if (searchResults.length === 0) {
            // Fallback to registry download
            const registryUrl = 'http://localhost:3000';
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
            const contentResult = await loadRemoteContent(found);
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
              content: { systemPrompt: contentResult.content || `# ${found.name}\n\n${found.description}` },
              metadata: { createdAt: new Date(), updatedAt: new Date(), source: found.platform }
            };
            sourceType = found.platform;
            if (!contentResult.fetched) {
              contentFetchWarning = `   ⚠ Using fallback content for ${found.name}`;
            }
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

            const contentResult = await loadRemoteContent(found);
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
              content: { systemPrompt: contentResult.content || `# ${found.name}\n\n${found.description}` },
              metadata: { createdAt: new Date(), updatedAt: new Date(), source: found.platform }
            };
            sourceType = found.platform;
            if (!contentResult.fetched) {
              contentFetchWarning = `   ⚠ Using fallback content for ${found.name}`;
            }
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
      if (contentFetchWarning) {
        console.log(contentFetchWarning);
      }

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
// sa evolve <skill> - Evolution analysis
// ============================================
program
  .command('evolve <skillName>')
  .description('Analyze and adapt a tracked skill')
  .showHelpAfterError()
  .showSuggestionAfterError()
  .option('--apply', 'Apply suggested improvements', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .action(async (skillName: string, options: { apply: boolean; verbose: boolean }) => {
    const db = new EvolutionDatabase();
    const isVerbose = options.verbose;

    // ═══════════════════════════════════════════
    // STEP 0: Load tracked skill (database only)
    // ═══════════════════════════════════════════
    const skillLocation = loadTrackedSkill(db, skillName);

    if (!skillLocation) {
      console.log(`Skill "${skillName}" not found in local tracking database.`);
      console.log('\n📌 Try:');
      console.log(`   sa import ${skillName}      # Import and track this skill first`);
      console.log('   sa info                     # View tracked/importable skills');
      return;
    }

    console.log(`✅ Loaded: ${skillName}`);

    // Record usage
    configManager.recordSkillUsage(skillName);

    const { content: skillContent, dir: skillDir, filePath: skillFilePath, source: skillSource } = skillLocation;

    // ═══════════════════════════════════════════
    // STEP 1: SA Agent Configuration & Link Status
    // ═══════════════════════════════════════════
    const useAI = saAgentEvolutionEngine.isAvailable();
    const modelStatus = modelConfigLoader.getStatus();
    let maskedApiKey = '';
    if (isVerbose) {
      const configResult = modelConfigLoader.load();
      if (configResult.success && configResult.config) {
        const key = configResult.config.apiKey || '';
        maskedApiKey = key.length > 14 ? `${key.slice(0, 10)}...${key.slice(-4)}` : '***';
      }
    }
    printEvolutionRuntimeStatus({
      configured: modelStatus.configured,
      source: modelStatus.source,
      model: modelStatus.model,
      endpoint: modelStatus.endpoint,
      maskedApiKey,
      aiReady: useAI
    }, isVerbose);

    // ═══════════════════════════════════════════
    // STEP 2: Skill Info
    // ═══════════════════════════════════════════
    console.log(`\n📄 Skill: ${skillName}`);
    console.log(`   Source: ${skillSource}`);
    if (isVerbose) {
      console.log(`   Path: ${skillDir}`);
      console.log(`   File: ${path.basename(skillFilePath)}`);
      console.log(`   Size: ${skillContent.length} bytes`);
    }

    console.log(`   Version: ${db.getLatestVersion(skillName)}`);

    // ═══════════════════════════════════════════
    // STEP 3: Static Analysis
    // ═══════════════════════════════════════════
    const staticSpinner = isVerbose ? ora('📊 Analyzing static skill content...').start() : null;
    const { sections, codeBlocks, links } = analyzeSkillStaticContent(skillContent);

    if (staticSpinner) {
      staticSpinner.succeed('Static analysis complete');
      console.log(`   ├─ Sections: ${sections}`);
      console.log(`   ├─ Code blocks: ${codeBlocks}`);
      console.log(`   └─ Links: ${links}`);
    }

    // ═══════════════════════════════════════════
    // STEP 4: Dynamic Context
    // ═══════════════════════════════════════════
    const contextSpinner = isVerbose ? ora('📂 Loading dynamic context...').start() : null;

    // Workspace info
    const workspaceAnalyzer = new WorkspaceAnalyzer(process.cwd());
    const workspaceConfig = workspaceAnalyzer.analyze();

    // Build evolution context
    let evolutionContext;
    let evolutionRecommendations: EvolutionRecommendation[] = [];
    let saAgentRecommendations: SAAgentRecommendation[] = [];

    try {
      evolutionContext = await evolutionEngine.buildEvolutionContext(skillName, 10);
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

    if (contextSpinner) {
      const soulPrefs = evolutionContext.behaviorStyle.boundaries.length > 0 ||
                        evolutionContext.behaviorStyle.preferences.length > 0;
      contextSpinner.succeed('Dynamic context loaded');
      console.log(`   ├─ SOUL preferences: ${soulPrefs ? '✓' : '✗'}`);
      console.log(`   ├─ MEMORY rules: ${evolutionContext.memoryRules.length} rules`);
      console.log(`   ├─ Workspace: ${workspaceConfig.techStack.languages.join(', ') || 'not detected'}`);
      console.log(`   └─ Session patterns: ${evolutionContext.sessionPatterns.toolSequences.length} patterns`);
    }

    // ═══════════════════════════════════════════
    // STEP 5: SA Agent Evolution with Streaming
    // ═══════════════════════════════════════════
    if (isVerbose) {
      console.log('\n' + '─'.repeat(60));
      console.log('🤖 SA Agent Evolution Process');
      console.log('─'.repeat(60) + '\n');
    } else {
      console.log('\n' + '─'.repeat(60));
      console.log('🤖 SA Agent Evolution');
      console.log('─'.repeat(60));
    }

    const spinnerEnabled = process.stdout.isTTY;
    const thinkingSpinner = spinnerEnabled ? ora('🤖 SA Agent is helping evolve this skill...').start() : null;
    let thinkingBuffer = '';
    let thinkingStarted = false;
    let lineBuffer = ''; // Buffer for incomplete lines
    let analysisFailed = false;
    let spinnerClosed = false;

    const closeSpinner = (status: 'succeed' | 'fail' | 'warn', text: string) => {
      if (!spinnerClosed && thinkingSpinner) {
        if (status === 'succeed') thinkingSpinner.succeed(text);
        else if (status === 'fail') thinkingSpinner.fail(text);
        else thinkingSpinner.warn(text);
        spinnerClosed = true;
      }
    };

    const isSeparatorLine = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^[─—–\-_=*#.~\s]+$/.test(trimmed)) return true;
      if (/^(.)\1{2,}$/.test(trimmed)) return true;
      if (trimmed.length <= 2 && /^[─—–\-_=*#.~\s│┌┐└┘├┤┬┴┼]+$/.test(trimmed)) return true;
      return false;
    };

    try {
      if (!useAI) {
        closeSpinner('warn', 'SA Agent unavailable, using rule-based engine');
        console.log('⚠️ SA Agent model not configured. Falling back to rule-based recommendations.');
        evolutionRecommendations = evolutionEngine.generateRecommendations(evolutionContext);
      } else {
        if (!isVerbose) {
          saAgentRecommendations = await saAgentEvolutionEngine.generateRecommendationsSync({
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
          });
        } else {
          saAgentRecommendations = await saAgentEvolutionEngine.generateRecommendations({
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
              if (!isVerbose) return;
              if (!thinkingStarted) {
                if (spinnerEnabled && thinkingSpinner && !spinnerClosed) {
                  thinkingSpinner.text = 'Connected. Streaming SA Agent thinking...';
                } else {
                  console.log('• Connected. Streaming SA Agent thinking...');
                }
                console.log('\n💭 SA Agent Thinking (streaming):\n');
                console.log('─'.repeat(60));
                thinkingStarted = true;
              }
              // Buffer text and output only complete lines
              lineBuffer += text;
              const lines = lineBuffer.split('\n');
              // Keep the last incomplete line in buffer
              lineBuffer = lines.pop() || '';

              const filteredLines = lines.filter(line => !isSeparatorLine(line));
              if (filteredLines.length > 0) {
                process.stdout.write(filteredLines.join('\n') + '\n');
              }
              thinkingBuffer += text;
            },
            onContent: (text) => {
              thinkingBuffer += text;
            },
            onComplete: () => {
              if (!isVerbose) return;
              // Output any remaining buffered content
              if (lineBuffer.trim() && !isSeparatorLine(lineBuffer)) {
                process.stdout.write(lineBuffer + '\n');
                lineBuffer = '';
              }
              if (thinkingStarted) {
                console.log('\n' + '─'.repeat(60));
                console.log('\n✅ Thinking complete!\n');
              }
            },
          });
        }
      }

      if (!isVerbose) {
        closeSpinner('succeed', 'Evolution recommendations ready');
      } else if (!spinnerClosed && spinnerEnabled) {
        closeSpinner('succeed', 'SA Agent evolution analysis complete');
      }

      if (isVerbose && saAgentRecommendations.length === 0) {
        console.log('⚠️ SA Agent generated 0 recommendations. Check if model output JSON correctly.\n');
      } else if (isVerbose) {
        console.log(`✅ Generated ${saAgentRecommendations.length} recommendation(s)\n`);
      }

    } catch (aiError) {
      analysisFailed = true;
      closeSpinner('fail', 'SA Agent evolution analysis failed');
      console.log('Falling back to rule-based recommendations...');
      evolutionRecommendations = evolutionEngine.generateRecommendations(evolutionContext);
      if (spinnerEnabled && !spinnerClosed) {
        closeSpinner('warn', 'Using rule-based fallback');
      }
      if (analysisFailed && isVerbose) {
        console.log('⚠️ SA Agent deep analysis unavailable, fallback active.\n');
      }
    }

    // ═══════════════════════════════════════════
    // STEP 6: Display Recommendations
    // ═══════════════════════════════════════════
    const allRecommendations = saAgentRecommendations.length > 0 ? saAgentRecommendations :
                               evolutionRecommendations.length > 0 ? evolutionRecommendations : [];

    if (allRecommendations.length > 0 && isVerbose) {
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
    if (!isVerbose) {
      const summary = summarizeRecommendationPriorities(allRecommendations as Array<{ priority?: string }>);
      printRecommendationSummaryTable(summary);
    }

    // ═══════════════════════════════════════════
    // STEP 7: Next Tips
    // ═══════════════════════════════════════════
    printEvolutionNextSteps(allRecommendations.length > 0);

    // ═══════════════════════════════════════════
    // STEP 8: Apply Optimizations (if --apply flag)
    // ═══════════════════════════════════════════
    let newContent = skillContent;

    if (options.apply && allRecommendations.length > 0) {
      const applySpinner = isVerbose ? ora('Applying recommendations...').start() : null;

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
      fs.writeFileSync(skillFilePath, newContent, 'utf-8');

      const appliedCount = allRecommendations.filter(r => ('confidence' in r ? r.confidence : 0.7) >= 0.8).length;
      if (applySpinner) {
        applySpinner.succeed(`Applied ${appliedCount} recommendations`);
      } else {
        console.log(`✅ Applied ${appliedCount} recommendations`);
      }

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

    console.log('\n✅ Evolution analysis complete.\n');
  });

// ============================================
// sa share [skill] - Create PR for local skill
// ============================================
program
  .command('share [skillName]')
  .description('Create PR for a local skill')
  .option('--pr', 'Create Pull Request (kept for compatibility)', false)
  .option('--fork-pr', 'Create PR via your GitHub fork (for non-owner flow)', false)
  .option('--repo <url>', 'Target git repository URL', DEFAULT_PR_REPO)
  .option('--branch <name>', 'Branch name for PR', '')
  .option('--gh <path>', 'Path to GitHub CLI binary', process.env.GH_CLI_PATH || 'gh')
  .option('--yes', 'Skip security confirmation', false)
  .action(async (skillName: string | undefined, options: { pr: boolean; forkPr: boolean; repo: string; branch: string; gh: string; yes: boolean }) => {
    const db = new EvolutionDatabase();

    // No skill specified - list all skills
    if (!skillName) {
      console.log('Select a skill to share as PR:\n');
      const records = db.getAllRecords();
      if (records.length === 0) {
        console.log('No skills installed yet.');
        console.log('Use `sa import <source>` to import a skill.');
        return;
      }

      const skillNames = [...new Set(records.map(r => r.skillName))];
      for (const name of skillNames) {
        const version = db.getLatestVersion(name);
        console.log(`  - ${name} (v${version})`);
      }
      console.log('\nNext Steps:');
      console.log('   sa share <skill-name>      # Create PR');
      console.log('   sa export <skill-name>     # Export local package');
      printCommunityLinks('targets');
      return;
    }

    console.log(`Sharing skill by PR: ${skillName}\n`);

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
    const shareOk = await shareByPr({
      skillName,
      version: latestRecord.version,
      skillPackage,
      repo: options.repo,
      branch: options.branch,
      ghBinary: options.gh,
      forkPr: options.forkPr,
      promptYesNo
    });
    if (!shareOk) {
      process.exitCode = 1;
    } else {
      console.log('\n🌟 Nice share. More places to discover & submit:');
      console.log(`   Discover: ${COMMUNITY_SKILLS_FEED_URL}`);
      console.log(`   Curated:  ${COMMUNITY_CURATED_SKILLS_URL}`);
    }
  });
// ============================================
// sa export [skill] - Export local skill package
// ============================================
program
  .command('export [skillName]')
  .description('Export local skill package')
  .option('-o, --output <path>', 'Export to file')
  .option('-f, --format <format>', 'Export format (json, yaml, zip)', 'zip')
  .option('--zip', 'Export as ZIP (shorthand for -f zip)', false)
  .option('--yes', 'Skip security confirmation', false)
  .action(async (skillName: string | undefined, options: { output?: string; format: string; zip: boolean; yes: boolean }) => {
    const db = new EvolutionDatabase();

    if (!skillName) {
      console.log('Select a local skill to export:\n');
      const records = db.getAllRecords();
      if (records.length === 0) {
        console.log('No skills installed yet.');
        console.log('Use `sa import <source>` to import a skill.');
        return;
      }

      const skillNames = [...new Set(records.map(r => r.skillName))];
      for (const name of skillNames) {
        const version = db.getLatestVersion(name);
        console.log(`  - ${name} (v${version})`);
      }
      console.log('\nNext Steps:');
      console.log('   sa export <skill-name>            # Export local package');
      console.log('   sa export <skill-name> --zip      # Export ZIP');
      console.log('   sa share <skill-name>             # Create PR');
      return;
    }

    const records = db.getRecords(skillName);
    if (records.length === 0) {
      console.log(`Skill "${skillName}" not found.`);
      return;
    }

    const latestRecord = records[records.length - 1];
    const format = options.zip ? 'zip' : options.format;

    const skillPackage = skillExporter.createPackage(
      skillName,
      { systemPrompt: `# ${skillName}\n\nSkill content` },
      { version: latestRecord.version }
    );

    console.log('🔒 Running security scan...');
    const scanResult = securityEvaluator.scan(skillPackage.content.systemPrompt, skillName);
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
  });

// Helper function to execute git commands
async function execGit(args: string[], cwd: string, ignoreError = false): Promise<string> {
  const { execFileSync } = require('child_process');
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ignoreError ? 'pipe' : 'inherit' });
  } catch (error) {
    if (!ignoreError) throw error;
    return '';
  }
}


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
    const summary = renderEvolutionSummary(skillName, records);

    if (summary.status === 'not-found') {
      console.log(`❌ No evolution records found for "${skillName}"\n`);
      console.log('💡 Next Steps:');
      console.log(`   sa evolve ${skillName}    # Run evolution analysis first`);
      return;
    }

    for (const line of summary.lines) {
      console.log(line);
    }
  });

// ============================================
// Additional utility commands
// ============================================

registerScanCommand(program);

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

program.parse(normalizeCliArgs(process.argv));







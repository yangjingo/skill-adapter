import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { EvolutionDatabase } from '../core/database';
import { findClaudeCodeSkillsPath, findOpenClawSkillsPath, getClaudeCodePlugins } from '../core/discovery/paths';
import { countFiles, showTree } from '../utils/helpers';

export function registerInfoCommand(program: Command): void {
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

          const counts = countFiles(skillDir);
          console.log(`Files: ${counts.files} | Dirs: ${counts.dirs} | Total Size: ${(counts.size / 1024).toFixed(1)} KB`);

          console.log(`\n── Directory Tree ──`);
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

          const counts = countFiles(skillDir);
          console.log(`Files: ${counts.files} | Dirs: ${counts.dirs} | Total Size: ${(counts.size / 1024).toFixed(1)} KB`);

          console.log(`\n── Directory Tree ──`);
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

          const counts = countFiles(skillDir);
          console.log(`Files: ${counts.files} | Dirs: ${counts.dirs} | Total Size: ${(counts.size / 1024).toFixed(1)} KB`);

          console.log(`\n── Directory Tree ──`);
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
}

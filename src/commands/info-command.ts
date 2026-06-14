import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { EvolutionDatabase } from '../core/database';
import { findClaudeCodeSkillsPath, findOpenClawSkillsPath, getClaudeCodePlugins } from '../core/discovery/paths';
import { countFiles, showTree } from '../utils/helpers';
import { success, failure, printCommandResult, resolveFormat } from './result';

function collectSkills(db: EvolutionDatabase, platform: string) {
  const result: { platform: string; skills: Array<{ name: string; version?: string; evolutions?: number; hasPrompt?: boolean }> } = { platform, skills: [] };

  if (platform === 'imported') {
    const records = db.getAllRecords();
    if (records.length > 0) {
      const skillNames = [...new Set(records.map(r => r.skillName))];
      for (const name of skillNames) {
        const version = db.getLatestVersion(name);
        const skillRecords = db.getRecords(name);
        result.skills.push({ name, version: version ?? undefined, evolutions: skillRecords.length });
      }
    }
  } else if (platform === 'openclaw') {
    const openClawPath = findOpenClawSkillsPath();
    if (openClawPath && fs.existsSync(openClawPath)) {
      const skills = fs.readdirSync(openClawPath).filter(f =>
        fs.statSync(path.join(openClawPath, f)).isDirectory()
      );
      for (const skill of skills) {
        const skillMdPath = path.join(openClawPath, skill, 'SKILL.md');
        result.skills.push({ name: skill, hasPrompt: fs.existsSync(skillMdPath) });
      }
    }
  } else if (platform === 'claudecode') {
    const claudeCodePath = findClaudeCodeSkillsPath();
    if (claudeCodePath && fs.existsSync(claudeCodePath)) {
      const allSkills: Set<string> = new Set();
      const skillsPath = path.join(claudeCodePath, 'skills');
      if (fs.existsSync(skillsPath)) {
        const skillDirs = fs.readdirSync(skillsPath).filter(f =>
          fs.statSync(path.join(skillsPath, f)).isDirectory()
        );
        skillDirs.forEach(s => allSkills.add(s));
      }
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
      for (const skill of Array.from(allSkills).sort()) {
        result.skills.push({ name: skill });
      }
    }
  }

  return result;
}

function renderSkillList(db: EvolutionDatabase, platforms: string[]): string {
  const lines: string[] = ['Available Skills', ''];
  for (const platform of platforms) {
    const { skills } = collectSkills(db, platform);
    if (skills.length === 0) {
      if (platforms.length === 1) lines.push(`No ${platform} skills found.`);
      continue;
    }
    const label = platform === 'imported' ? 'Imported Skills' : platform === 'openclaw' ? 'OpenClaw Skills' : 'Claude Code Skills';
    lines.push(`-- ${label} --`);
    for (const s of skills) {
      const detail = s.version ? `(v${s.version}, ${s.evolutions} evolutions)` : s.hasPrompt === false ? '(no prompt)' : '';
      lines.push(`  ${s.name} ${detail}`.trim());
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function registerInfoCommand(program: Command): void {
  program
    .command('info [skillName]')
    .description('List or view skill details')
    .alias('show')
    .option('-p, --platform <platform>', 'Filter by platform (imported, openclaw, claudecode, all)', 'all')
    .option('--json', 'Output as JSON')
    .action((skillName: string | undefined, options: { platform: string; json?: boolean }) => {
    const format = resolveFormat(options);
    const db = new EvolutionDatabase();

    if (!skillName) {
      const platforms = options.platform === 'all' ? ['imported', 'openclaw', 'claudecode'] : [options.platform];
      const data = platforms.map(p => collectSkills(db, p)).filter(p => p.skills.length > 0);

      if (format === 'json') {
        printCommandResult(success(data)); return;
      }
      console.log(renderSkillList(db, platforms));
      return;
    }

    // Detail mode
    const records = db.getRecords(skillName);
    const latest = records.length > 0 ? records[records.length - 1] : null;

    if (!latest) {
      if (format === 'json') {
        printCommandResult(failure({ code: 'NOT_FOUND', message: `Skill "${skillName}" not found` })); return;
      }
      console.log(`Skill "${skillName}" not found.`);
      return;
    }

    if (format === 'json') {
      printCommandResult(success({
        name: skillName,
        version: latest.version,
        evolutions: records.length,
        source: latest.importSource,
        security: latest.securityPassed ?? null,
        skillPath: latest.skillPath ?? null,
      }));
      return;
    }

    console.log(`\nSkill: ${skillName}`);
    console.log(`Version: ${latest.version}`);
    console.log(`Evolutions: ${records.length}`);
    if (latest.importSource) console.log(`Source: ${latest.importSource}`);
    console.log(`Security: ${latest.securityPassed ? 'Passed' : latest.securityPassed === false ? 'Issues found' : 'Not scanned'}`);

    // Directory tree if available
    const skillDir = latest.skillPath;
    if (skillDir && fs.existsSync(skillDir)) {
      const stats = fs.statSync(skillDir);
      console.log(`Modified: ${stats.mtime.toLocaleString()}`);
      console.log(`Path: ${skillDir}`);

      const counts = countFiles(skillDir);
      console.log(`Files: ${counts.files} | Dirs: ${counts.dirs} | Total Size: ${(counts.size / 1024).toFixed(1)} KB`);

      console.log(`\n-- Directory Tree --`);
      showTree(skillDir);
    }
  });
}

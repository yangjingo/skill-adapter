import { Command } from 'commander';

import { EvolutionDatabase } from '../core/database';
import { securityEvaluator } from '../core/security';
import { skillExporter, shareByPr, DEFAULT_PR_REPO } from '../core/sharing';
import { promptYesNo, printCommunityLinks } from './common';
import { success, failure, printCommandResult, resolveFormat } from './result';

export function registerShareCommand(program: Command): void {
  program
    .command('share [skillName]')
    .description('Create PR for a local skill')
    .option('--pr', 'Create Pull Request (compat)', false)
    .option('--fork-pr', 'Create PR via fork', false)
    .option('--repo <url>', 'Target git repository URL', DEFAULT_PR_REPO)
    .option('--branch <name>', 'Branch name for PR', '')
    .option('--gh <path>', 'Path to GitHub CLI', process.env.GH_CLI_PATH || 'gh')
    .option('--yes', 'Skip security confirmation', false)
    .option('--json', 'Output as JSON')
    .action(async (skillName: string | undefined, options: { pr: boolean; forkPr: boolean; repo: string; branch: string; gh: string; yes: boolean; json?: boolean }) => {
    const format = resolveFormat(options);
    const db = new EvolutionDatabase();

    if (!skillName) {
      const records = db.getAllRecords();
      if (records.length === 0) {
        if (format === 'json') {
          printCommandResult(success({ skills: [] }));
        } else {
          console.log('No skills installed yet.');
        }
        return;
      }

      const skillNames = [...new Set(records.map(r => r.skillName))];
      if (format === 'json') {
        printCommandResult(success({
          skills: skillNames.map(name => ({ name, version: db.getLatestVersion(name) ?? 'unknown' })),
        }));
        return;
      }

      console.log('Select a skill to share as PR:\n');
      for (const name of skillNames) {
        console.log(`  - ${name} (v${db.getLatestVersion(name)})`);
      }
      console.log('\nUsage: sa share <skill-name>');
      printCommunityLinks('targets');
      return;
    }

    const records = db.getRecords(skillName);
    if (records.length === 0) {
      if (format === 'json') {
        printCommandResult(failure({ code: 'NOT_FOUND', message: `Skill "${skillName}" not found` }));
      } else {
        console.log(`Skill "${skillName}" not found.`);
      }
      return;
    }

    const latestRecord = records[records.length - 1];
    const skillPackage = skillExporter.createPackage(
      skillName,
      { systemPrompt: `# ${skillName}\n\nSkill content` },
      { version: latestRecord.version }
    );

    const scanResult = securityEvaluator.scan(skillPackage.content.systemPrompt, skillName);
    if (!scanResult.passed) {
      const riskMsg = `Risk: ${scanResult.riskAssessment.overallRisk}, Issues: ${scanResult.sensitiveInfoFindings.length + scanResult.dangerousOperationFindings.length}`;
      if (format === 'json') {
        printCommandResult(failure({ code: 'VALIDATION_ERROR', message: `Security scan failed: ${riskMsg}`, details: scanResult }));
      } else {
        console.log(`Security issues: ${riskMsg}`);
      }
      if (!options.yes) {
        if (!format) console.log('  Use --yes to proceed anyway.');
        return;
      }
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
      promptYesNo: process.stdin.isTTY ? promptYesNo : undefined,
    });

    if (!shareOk) {
      process.exitCode = 1;
      if (format === 'json') {
        printCommandResult(failure({ code: 'IO_ERROR', message: 'PR share failed' }));
      }
    } else {
      if (format === 'json') {
        printCommandResult(success({ skillName, version: latestRecord.version, shared: true }));
      } else {
        console.log('\nShared successfully.');
        printCommunityLinks('radar');
      }
    }
  });
}

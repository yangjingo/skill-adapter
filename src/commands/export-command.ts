import { Command } from 'commander';

import { EvolutionDatabase } from '../core/database';
import { securityEvaluator } from '../core/security';
import { skillExporter } from '../core/sharing';
import { success, failure, printCommandResult, resolveFormat } from './result';

export function registerExportCommand(program: Command): void {
  program
    .command('export [skillName]')
    .description('Export local skill package')
    .option('-o, --output <path>', 'Export to file')
    .option('-f, --format <format>', 'Export file format (json, yaml, zip)', 'zip')
    .option('--yes', 'Skip security confirmation', false)
    .option('--json', 'Output result as JSON')
    .action(async (skillName: string | undefined, options: { output?: string; format: string; yes: boolean; json?: boolean }) => {
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

      console.log('Select a local skill to export:\n');
      for (const name of skillNames) {
        console.log(`  - ${name} (v${db.getLatestVersion(name)})`);
      }
      console.log('\nUsage: sa export <skill-name> [--format json|yaml|zip]');
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
        printCommandResult(failure({
          code: 'VALIDATION_ERROR',
          message: `Security scan failed: ${riskMsg}`,
          details: scanResult,
        }));
      } else {
        console.log(`Security issues detected: ${riskMsg}`);
      }
      if (!options.yes) {
        if (!format) console.log('  Use --yes to proceed anyway.');
        return;
      }
    }

    skillPackage.metadata.securityScan = scanResult;

    const ext = options.format === 'zip' ? 'zip' : options.format;
    const outputPath = options.output || `./${skillName}-v${latestRecord.version}.${ext}`;

    skillExporter.exportToFile(skillPackage, outputPath, {
      format: options.format as 'json' | 'yaml' | 'zip',
      includePatches: true,
      includeConstraints: true,
      includeSecurityScan: true,
      includeReadme: true,
    });

    if (format === 'json') {
      printCommandResult(success({
        skillName,
        version: latestRecord.version,
        file: outputPath,
        securityPassed: scanResult.passed,
      }));
    } else {
      console.log(`Export complete: ${outputPath}`);
    }
  });
}

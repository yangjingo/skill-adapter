import { Command } from 'commander';

import { EvolutionDatabase } from '../core/database';
import { securityEvaluator } from '../core/security';
import { skillExporter } from '../core/sharing';

export function registerExportCommand(program: Command): void {
  program
    .command('export [skillName]')
    .description('Export local skill package')
    .option('-o, --output <path>', 'Export to file')
    .option('-f, --format <format>', 'Export format (json, yaml, zip)', 'zip')
    .option('--yes', 'Skip security confirmation', false)
    .action(async (skillName: string | undefined, options: { output?: string; format: string; yes: boolean }) => {
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

    const ext = options.format === 'zip' ? 'zip' : options.format;
    const outputPath = options.output || `./${skillName}-v${latestRecord.version}.${ext}`;
    console.log(`\n📦 Exporting to ${outputPath}...`);

    skillExporter.exportToFile(skillPackage, outputPath, {
      format: options.format as 'json' | 'yaml' | 'zip',
      includePatches: true,
      includeConstraints: true,
      includeSecurityScan: true,
      includeReadme: true
    });

    console.log('✅ Export complete!');
    console.log(`   File: ${outputPath}`);
  });
}


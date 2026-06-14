import { Command } from 'commander';

import { EvolutionDatabase } from '../core/database';
import { success, failure, printCommandResult, resolveFormat } from './result';

export function registerLogCommand(program: Command): void {
  program
    .command('log [skillName]')
    .description('View version history')
    .option('-n, --number <count>', 'Number of versions to show', '10')
    .option('--oneline', 'Show one line per version', false)
    .option('--stat', 'Show change statistics', false)
    .option('--json', 'Output as JSON')
    .action((skillName: string | undefined, options: { number: string; oneline: boolean; stat: boolean; json?: boolean }) => {
    const format = resolveFormat(options);
    const db = new EvolutionDatabase();

    if (skillName) {
      const records = db.getRecords(skillName);
      if (records.length === 0) {
        if (format === 'json') {
          printCommandResult(failure({ code: 'NOT_FOUND', message: `Skill "${skillName}" not found` }));
        } else {
          console.log(`Skill "${skillName}" not found.`);
        }
        return;
      }

      const sorted = [...records].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ).slice(0, parseInt(options.number));

      if (format === 'json') {
        printCommandResult(success({
          skillName,
          totalVersions: records.length,
          versions: sorted.map(r => ({
            version: r.version,
            timestamp: r.timestamp,
            patches: JSON.parse(r.patches || '[]'),
            telemetry: options.stat ? JSON.parse(r.telemetryData || '{}') : undefined,
            source: r.importSource,
          })),
        }));
        return;
      }

      console.log(`Version History: ${skillName}\n`);

      for (const record of sorted) {
        const date = new Date(record.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

        if (options.oneline) {
          console.log(`${record.version} - ${dateStr}`);
        } else {
          console.log('-'.repeat(50));
          console.log(`Version: ${record.version}`);
          console.log(`Date:    ${dateStr}`);

          try {
            const patches = JSON.parse(record.patches || '[]');
            if (patches.length > 0) {
              console.log('Changes:');
              for (const patch of patches) {
                const type = patch.type || patch.category || 'evolution';
                const desc = patch.description || patch.action || patch.suggestion || 'N/A';
                const marker = patch.status === 'applied' ? '+' : patch.status === 'skipped' ? '-' : '*';
                console.log(`   ${marker} [${type}] ${desc}`);
              }
            }

            if (options.stat) {
              const telemetry = JSON.parse(record.telemetryData || '{}');
              if (Object.keys(telemetry).length > 0) {
                console.log('Metrics:');
                if (telemetry.optimizationsCount !== undefined) console.log(`   Optimizations: ${telemetry.optimizationsCount}`);
                if (telemetry.appliedCount !== undefined) console.log(`   Applied: ${telemetry.appliedCount}`);
                if (telemetry.skippedCount !== undefined) console.log(`   Skipped: ${telemetry.skippedCount}`);
                if (telemetry.tokenReduction) console.log(`   Token reduction: ${Number(telemetry.tokenReduction).toFixed(1)}%`);
                if (telemetry.callReduction) console.log(`   Call reduction: ${Number(telemetry.callReduction).toFixed(1)}%`);
              }
            }
          } catch {
            // Ignore parse errors in text mode
          }

          if (record.importSource) console.log(`Source:  ${record.importSource}`);
          console.log('');
        }
      }

      console.log(`Total ${records.length} version(s)`);
    } else {
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
          skills: skillNames.map(name => {
            const skillRecords = db.getRecords(name);
            return {
              name,
              versions: skillRecords.map(r => r.version),
              latest: db.getLatestVersion(name) ?? undefined,
              totalEvolutions: skillRecords.length,
            };
          }),
        }));
        return;
      }

      console.log('Version History (All Skills)\n');

      for (const name of skillNames) {
        const skillRecords = db.getRecords(name);
        const versions = skillRecords.map(r => r.version);
        const latest = db.getLatestVersion(name);
        console.log(`${name}`);
        console.log(`   Versions: ${versions.join(' -> ')}`);
        console.log(`   Latest:   v${latest}`);
        console.log(`   Total:    ${skillRecords.length} evolution(s)`);
        console.log('');
      }
    }
  });
}

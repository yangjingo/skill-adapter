#!/usr/bin/env node

import { Command } from 'commander';

import { VERSION } from './index';
import {
  registerImportCommand,
  registerEvolveCommand,
  registerInfoCommand,
  registerShareCommand,
  registerExportCommand,
  registerLogCommand,
} from './commands';
import { registerScanCommand } from './core/security/scan-command';

function normalizeCliArgs(argv: string[]): string[] {
  return argv.map(arg => (arg === '-pr' ? '--pr' : arg));
}

const program = new Command();
program.showHelpAfterError();
program.showSuggestionAfterError();
program
  .name('sa')
  .description('Skill-Adapter: evolve skills for agent workflows')
  .version(VERSION);

registerImportCommand(program);
registerInfoCommand(program);
registerEvolveCommand(program);
registerShareCommand(program);
registerExportCommand(program);
registerLogCommand(program);
registerScanCommand(program);

program.parse(normalizeCliArgs(process.argv));

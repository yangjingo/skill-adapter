import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

import { maskApiKey } from '../utils/helpers';
import { modelConfigLoader } from '../core/evolution';
import { renderCommandResultWithInk } from '../ui';
import { buildInitCommandView } from './view-model';

const CONFIG = {
  skillsRepo: process.env.SKILL_ADAPTER_REPO || 'https://codehub-g.huawei.com/leow3lab/ascend-skills',
  registryUrl: process.env.SKILL_ADAPTER_REGISTRY || 'http://leow3lab.service.huawei.com/registry',
  defaultPlatform: process.env.SKILL_ADAPTER_PLATFORM || 'skills-sh',
};

const configPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.skill-adapter.json');
if (fs.existsSync(configPath)) {
  try {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    Object.assign(CONFIG, configData);
  } catch {
    // Ignore config errors
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize configuration')
    .option('--repo <url>', 'Skills repository URL')
    .option('--registry <url>', 'Default registry URL')
    .option('--show', 'Show current configuration', false)
    .action(async (options: { repo?: string; registry?: string; show: boolean }) => {
      const modelStatus = modelConfigLoader.getStatus();
      const newConfig: Record<string, string> = {};

      if (!options.show) {
        if (options.repo) {
          newConfig.skillsRepo = options.repo;
        }
        if (options.registry) {
          newConfig.registryUrl = options.registry;
        }

        if (Object.keys(newConfig).length > 0) {
          Object.assign(CONFIG, newConfig);
          fs.writeFileSync(configPath, JSON.stringify(CONFIG, null, 2));
        }
      }

      const configResult = modelConfigLoader.load();
      const view = buildInitCommandView({
        saved: !options.show && Object.keys(newConfig).length > 0,
        configPath,
        config: {
          skillsRepo: CONFIG.skillsRepo,
          registryUrl: CONFIG.registryUrl,
          defaultPlatform: CONFIG.defaultPlatform,
        },
        model: {
          configured: modelStatus.configured,
          source: modelStatus.source,
          model: modelStatus.model,
          endpoint: modelStatus.endpoint,
          apiKeyMasked: configResult.success && configResult.config?.apiKey ? maskApiKey(configResult.config.apiKey) : undefined,
        },
      });

      await renderCommandResultWithInk(view);
    });
}

/**
 * Shared path helpers for discovery-related commands.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Internal helpers ────────────────────────────────────────────

function baseDirs(): string[] {
  return [process.env.USERPROFILE, process.env.APPDATA, process.env.HOME].filter(Boolean) as string[];
}

function findFirstPath(...segments: string[]): string | null {
  for (const base of baseDirs()) {
    const p = path.join(base, ...segments);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── Public path finders ─────────────────────────────────────────

export function findOpenClawSkillsPath(): string | null {
  return findFirstPath('.openclaw', 'skills');
}

export function findOpenClawWorkspacePath(): string | null {
  return findFirstPath('.openclaw', 'workspace');
}

export function findClaudeCodeSkillsPath(): string | null {
  return findFirstPath('.claude');
}

export function findClaudeCodePluginsPath(): string | null {
  return findFirstPath('.claude', 'plugins', 'cache');
}

/**
 * Get all installed Claude Code plugins/skills from plugins cache
 */
export function getClaudeCodePlugins(): { name: string; path: string; marketplace: string }[] {
  const plugins: { name: string; path: string; marketplace: string }[] = [];
  const pluginsCachePath = findClaudeCodePluginsPath();

  if (!pluginsCachePath) return plugins;

  try {
    const installedPluginsPath = path.join(path.dirname(pluginsCachePath), 'installed_plugins.json');
    if (fs.existsSync(installedPluginsPath)) {
      const installedPlugins = JSON.parse(fs.readFileSync(installedPluginsPath, 'utf-8'));
      if (installedPlugins.plugins) {
        for (const [pluginId, installations] of Object.entries(installedPlugins.plugins)) {
          const installs = installations as Array<{ installPath: string; scope: string }>;
          if (installs && installs.length > 0) {
            const install = installs[0];
            const name = pluginId.split('@')[0];
            const marketplace = pluginId.split('@')[1] || 'unknown';
            plugins.push({ name, path: install.installPath, marketplace });
          }
        }
      }
    }
  } catch {
    // Fallback: scan directory structure
    try {
      const marketplaces = fs.readdirSync(pluginsCachePath);
      for (const marketplace of marketplaces) {
        const marketplacePath = path.join(pluginsCachePath, marketplace);
        if (!fs.statSync(marketplacePath).isDirectory()) continue;

        const pluginDirs = fs.readdirSync(marketplacePath);
        for (const pluginDir of pluginDirs) {
          const pluginPath = path.join(marketplacePath, pluginDir);
          if (!fs.statSync(pluginPath).isDirectory()) continue;

          const versions = fs.readdirSync(pluginPath);
          if (versions.length > 0) {
            plugins.push({
              name: pluginDir,
              path: path.join(pluginPath, versions[0]),
              marketplace,
            });
          }
        }
      }
    } catch {
      // Ignore fallback errors
    }
  }

  return plugins;
}

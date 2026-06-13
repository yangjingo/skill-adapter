import * as fs from 'fs';
import * as path from 'path';

// ── Community URLs ──────────────────────────────────────────────

export const COMMUNITY_SKILLS_FEED_URL = 'https://github.com/leow3lab/ascend-skills';
export const COMMUNITY_CURATED_SKILLS_URL = 'https://github.com/leow3lab/awesome-ascend-skills';

// ── Dynamic import ──────────────────────────────────────────────

export async function safeImport<T>(moduleName: string): Promise<T | null> {
  try {
    return await import(moduleName) as T;
  } catch {
    return null;
  }
}

// ── React normalization ─────────────────────────────────────────

export interface NormalizedReact {
  createElement: (...args: unknown[]) => unknown;
  useEffect?: (...args: unknown[]) => unknown;
  useState?: (...args: unknown[]) => unknown;
}

export function normalizeReact(moduleValue: Record<string, unknown> | null): NormalizedReact | null {
  if (!moduleValue) return null;

  const candidate = (moduleValue.default as unknown) ?? moduleValue;
  if (candidate && typeof (candidate as { createElement?: unknown }).createElement === 'function') {
    return candidate as NormalizedReact;
  }

  if (typeof moduleValue.createElement === 'function') {
    return moduleValue as unknown as NormalizedReact;
  }

  return null;
}

// ── Community links ─────────────────────────────────────────────

export function printCommunityLinks(mode: 'radar' | 'targets'): void {
  if (mode === 'radar') {
    console.log('\n🌐 Community Radar:');
    console.log(`   Shared skills feed: ${COMMUNITY_SKILLS_FEED_URL}`);
    console.log(`   Curated list:       ${COMMUNITY_CURATED_SKILLS_URL}`);
    console.log('\n💡 Your turn: polish one skill and share it with: sa share <skill-name>');
    return;
  }

  console.log('\n🎯 Community Targets:');
  console.log(`   ${COMMUNITY_SKILLS_FEED_URL}`);
  console.log(`   ${COMMUNITY_CURATED_SKILLS_URL}`);
}

// ── API key masking ─────────────────────────────────────────────

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 14) return '***';
  return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

// ── Command availability ────────────────────────────────────────

export function hasCommand(command: string): boolean {
  const { spawnSync } = require('child_process');
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf-8',
    shell: false,
    stdio: 'ignore',
  });
  return !result.error && result.status === 0;
}

// ── Directory tree traversal ────────────────────────────────────

export interface DirCounts {
  files: number;
  dirs: number;
  size: number;
}

export function countFiles(dir: string): DirCounts {
  let files = 0;
  let dirs = 0;
  let size = 0;

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
}

export function showTree(
  dir: string,
  prefix: string = '',
  maxDepth: number = 3,
  currentDepth: number = 0,
  logFn: (line: string) => void = console.log,
): void {
  if (currentDepth >= maxDepth) return;
  const items = fs.readdirSync(dir).filter((i) => !i.startsWith('.'));
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

    logFn(prefix + prefixChar + info);

    if (stat.isDirectory()) {
      showTree(itemPath, newPrefix, maxDepth, currentDepth + 1, logFn);
    }
  });
}

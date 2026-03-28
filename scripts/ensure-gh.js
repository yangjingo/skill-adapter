#!/usr/bin/env node

const { spawnSync } = require('child_process');

function hasGh() {
  const result = spawnSync('gh', ['--version'], {
    stdio: 'ignore',
    shell: false
  });
  return !result.error && result.status === 0;
}

if (hasGh()) {
  process.exit(0);
}

console.log('\n[skill-adapter] GitHub CLI (`gh`) is not installed.');
console.log('[skill-adapter] `sa share` can still push branch, but auto PR creation needs `gh`.');
console.log('[skill-adapter] Quick setup: npm run setup:gh');
console.log('[skill-adapter] Then run: gh auth login');

const isCi = process.env.CI === '1' || process.env.CI === 'true';
const autoInstallEnabled = !isCi && process.env.SA_AUTO_INSTALL_GH !== '0';

if (autoInstallEnabled) {
  console.log('[skill-adapter] Trying to auto-install gh (set SA_AUTO_INSTALL_GH=0 to disable)...');
  const install = spawnSync(process.execPath, ['scripts/setup-gh.js'], {
    stdio: 'inherit',
    shell: false
  });
  if (install.status !== 0) {
    console.log('[skill-adapter] Auto install did not complete. Run `npm run setup:gh` manually.');
  }
} else if (isCi) {
  console.log('[skill-adapter] CI detected, skip auto-install gh. Install it in CI image if share PR is needed.');
}

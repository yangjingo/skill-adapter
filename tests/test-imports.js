/**
 * Import command focused tests for the simplified `sa import` behavior.
 *
 * Scope:
 * - discover mode (no source)
 * - recommend-only mode for non-local source
 * - import help no longer exposes removed flags
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log(`   ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function runCli(args) {
  const projectRoot = path.join(__dirname, '..');
  const testHome = path.join(projectRoot, '.tmp-test-home');
  if (!fs.existsSync(testHome)) fs.mkdirSync(testHome, { recursive: true });

  return execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/cli.ts', ...args], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    env: {
      ...process.env,
      HOME: testHome,
      USERPROFILE: testHome
    }
  });
}

console.log('\n=== import tests ===\n');

test('import --help should not expose removed flags', () => {
  const output = runCli(['import', '--help']);
  assert(!output.includes('--platform'), 'import help still contains --platform');
  assert(!output.includes('--no-npx'), 'import help still contains --no-npx');
  assert(!output.includes('--registry'), 'import help still contains --registry');
});

test('import with query should be recommendation-only', () => {
  const output = runCli(['import', 'find-skills']);
  assert(output.includes('Searching on skills.sh'), 'missing search banner');
  assert(output.includes('https://skills.sh/?q=find-skills'), 'missing skills.sh query link');
  assert(output.includes('no longer auto-downloads remote skills'), 'missing recommend-only notice');
  assert(!output.includes('Installing with official skills CLI'), 'should not invoke official CLI flow');
  assert(!output.includes('Downloading from registry'), 'should not download from registry');
});

test('import with skills.sh URL should still be recommendation-only', () => {
  const output = runCli(['import', 'https://skills.sh/cloudflare/vinext/migrate-to-vinext']);
  assert(output.includes('Searching on skills.sh'), 'missing search banner for skills.sh URL');
  assert(output.includes('https://skills.sh/?q=migrate-to-vinext'), 'missing parsed search link from URL');
  assert(output.includes('no longer auto-downloads remote skills'), 'missing recommend-only notice');
  assert(!output.includes('Installing with official skills CLI'), 'should not invoke official CLI flow');
});

test('import discover mode should still run', () => {
  const output = runCli(['import', '--limit', '1']);
  assert(output.includes('Discovering hot skills from skills.sh'), 'discover mode header missing');
});

test('import local directory with only skill.md should work', () => {
  const tempSkillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-import-test-'));
  fs.writeFileSync(path.join(tempSkillDir, 'skill.md'), '# local-test-skill\n\nThis is a local test skill.');

  const output = runCli(['import', tempSkillDir, '--name', 'local-test-skill']);
  assert(output.includes('Detected: Local file'), 'missing local file detection');
  assert(output.includes('Detected: Claude Code skill format'), 'missing Claude Code skill format detection');
  assert(output.includes('Installed successfully!'), 'missing success message');
});

console.log('\n=== results ===');
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);
console.log('');

if (failed > 0) {
  process.exit(1);
}

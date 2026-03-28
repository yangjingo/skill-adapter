/**
 * CI Test Runner - Basic validation tests
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function runCli(args) {
  return execFileSync(process.execPath, ['dist/cli.js', ...args], {
    encoding: 'utf-8',
    cwd: path.join(__dirname, '..'),
    shell: false,
  });
}

function runNodeScript(args) {
  return execFileSync(process.execPath, args, {
    encoding: 'utf-8',
    cwd: path.join(__dirname, '..'),
    shell: false,
  });
}

console.log('\n=== CI Tests ===\n');

// Test 1: Check dist directory exists
test('dist directory should exist after build', () => {
  const distPath = path.join(__dirname, '..', 'dist');
  assert(fs.existsSync(distPath), 'dist directory not found');
});

// Test 2: Check main entry point
test('dist/index.js should exist', () => {
  const indexPath = path.join(__dirname, '..', 'dist', 'index.js');
  assert(fs.existsSync(indexPath), 'dist/index.js not found');
});

// Test 3: Check CLI entry point
test('dist/cli.js should exist', () => {
  const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
  assert(fs.existsSync(cliPath), 'dist/cli.js not found');
});

// Test 4: CLI help command
test('sa --help should run without error', () => {
  const output = runCli(['--help']);
  assert(output.includes('Usage:'), 'Help output should contain Usage');
});

// Test 5: CLI version command
test('sa --version should show version', () => {
  const output = runCli(['--version']);
  assert(output.includes('1.2.0'), 'Version should match package.json');
});

// Test 6: Check core modules
test('Core modules should be compiled', () => {
  const corePath = path.join(__dirname, '..', 'dist', 'core');
  assert(fs.existsSync(corePath), 'dist/core directory not found');

  const expectedModules = ['security', 'evolution', 'discovery', 'versioning'];
  for (const module of expectedModules) {
    const modulePath = path.join(corePath, module);
    assert(fs.existsSync(modulePath), `dist/core/${module} not found`);
  }
});

// Optional integration: share/fork-pr workflow
const runSharePrIntegration =
  process.env.RUN_SHARE_PR_TESTS === '1' ||
  process.argv.includes('--with-share-pr');

if (runSharePrIntegration) {
  test('share/fork-pr integration should pass', () => {
    const output = runNodeScript(['tests/test-share-pr.js']);
    assert(output.includes('PASS(owner):'), 'owner scenario did not pass');
    assert(output.includes('PASS(fork-pr):'), 'fork-pr scenario did not pass');
  });
} else {
  console.log('- Skipped: share/fork-pr integration (set RUN_SHARE_PR_TESTS=1 or --with-share-pr)');
}

console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed > 0) {
  process.exit(1);
}

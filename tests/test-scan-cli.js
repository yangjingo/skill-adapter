/**
 * scan command end-to-end tests
 *
 * Covers:
 * 1) sa scan <skill-name>
 * 2) sa scan <skill-name> --repair
 * 3) sa scan <skill-name> --apply
 * 4) sa scan <skill-name> --repair --apply
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const cliPath = path.join(rootDir, 'dist', 'cli.js');
const nodeBin = process.env.NODE_BINARY || 'node';
const tmpRoot = path.join(rootDir, '.tmp-test-scan-home');
const skillName = 'scan-e2e-skill';
const skillDir = path.join(tmpRoot, '.claude', 'skills', skillName);
const skillFile = path.join(skillDir, 'SKILL.md');
const repairedFile = path.join(skillDir, 'SKILL.repaired.md');

const riskySkillContent = [
  '# Scan E2E Skill',
  'api_key = "abcdefghijklmnopqrstuvwxyz1234"',
  'rm -rf /',
  ''
].join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runCli(args) {
  try {
    const output = execFileSync(nodeBin, [cliPath, ...args], {
      encoding: 'utf-8',
      cwd: rootDir,
      shell: false,
      env: {
        ...process.env,
        HOME: tmpRoot,
        USERPROFILE: tmpRoot,
        APPDATA: path.join(tmpRoot, 'AppData', 'Roaming'),
        ANTHROPIC_AUTH_TOKEN: '',
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_BASE_URL: '',
        ANTHROPIC_DEFAULT_SONNET_MODEL: ''
      }
    });
    return { ok: true, output };
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : '';
    const stderr = error.stderr ? String(error.stderr) : '';
    return { ok: false, output: `${stdout}\n${stderr}` };
  }
}

function setup() {
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillFile, riskySkillContent, 'utf-8');
}

function resetSkill() {
  fs.writeFileSync(skillFile, riskySkillContent, 'utf-8');
  if (fs.existsSync(repairedFile)) {
    fs.unlinkSync(repairedFile);
  }
}

function testScanSkillName() {
  resetSkill();

  const res = runCli(['scan', skillName]);
  assert(res.ok, `scan command failed:\n${res.output}`);
  assert(res.output.includes(`🔒 Scanning skill: ${skillName}`), 'missing scan skill prefix');
  assert(res.output.includes('✗ SCAN FAILED'), 'expected scan to fail on risky content');
}

function testScanSkillNameRepair() {
  resetSkill();

  const res = runCli(['scan', skillName, '--repair']);
  assert(res.ok, `scan --repair failed:\n${res.output}`);
  assert(res.output.includes('🔧 Auto Repair Summary'), 'missing auto repair summary');
  assert(res.output.includes('Mode: saved as copy'), 'expected copy mode in --repair');
  assert(fs.existsSync(repairedFile), 'expected repaired copy to be created');

  const repairedContent = fs.readFileSync(repairedFile, 'utf-8');
  assert(repairedContent.includes('# [SA-REPAIR] risky content removed'), 'expected repaired marker in copy');
}

function testScanSkillNameRepairApply() {
  resetSkill();

  const res = runCli(['scan', skillName, '--apply']);
  assert(res.ok, `scan --apply failed:\n${res.output}`);
  assert(res.output.includes('`--apply` is ignored without `--repair`'), 'missing apply-without-repair warning');
  assert(!fs.existsSync(repairedFile), 'did not expect repaired copy file when --repair is absent');

  const originalContent = fs.readFileSync(skillFile, 'utf-8');
  assert(originalContent === riskySkillContent, 'expected original file to remain unchanged for --apply only');
}

function testScanSkillNameRepairApplyTogether() {
  resetSkill();

  const res = runCli(['scan', skillName, '--repair', '--apply']);
  assert(res.ok, `scan --repair --apply failed:\n${res.output}`);
  assert(res.output.includes('🔧 Auto Repair Summary'), 'missing auto repair summary');
  assert(res.output.includes('Mode: applied to original'), 'expected apply mode in --repair --apply');
  assert(!fs.existsSync(repairedFile), 'did not expect repaired copy file in --repair --apply mode');

  const patchedOriginal = fs.readFileSync(skillFile, 'utf-8');
  assert(patchedOriginal.includes('# [SA-REPAIR] risky content removed'), 'expected original file to be patched');
}

function main() {
  setup();

  testScanSkillName();
  testScanSkillNameRepair();
  testScanSkillNameRepairApply();
  testScanSkillNameRepairApplyTogether();

  console.log('PASS(scan): scan skill-name / --repair / --apply / --repair --apply');
}

try {
  main();
} catch (error) {
  console.error(`FAIL(scan): ${error.message}`);
  process.exit(1);
} finally {
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

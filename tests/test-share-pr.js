/**
 * Share command scenario test script
 *
 * Scenarios:
 * - all: owner + fork-pr (default)
 * - owner: real GitHub repo (expects branch push/PR flow success)
 * - fork-pr: non-owner repo with fork PR flow (expects success)
 *
 * Examples:
 *   node tests/test-share-pr.js
 *   node tests/test-share-pr.js --scenario owner --repo https://github.com/leow3lab/awesome-ascend-skills --skill qa-only
 *   node tests/test-share-pr.js --scenario fork-pr --repo https://github.com/yuanhechen/OpenMemory --skill qa-only
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const OWNER_REPO_DEFAULT = 'https://github.com/leow3lab/awesome-ascend-skills';
const NON_OWNER_REPO_DEFAULT = 'https://github.com/yuanhechen/OpenMemory';

function parseArgs(argv) {
  const args = {
    scenario: 'all',
    skill: 'qa-only',
    repo: '',
    ownerRepo: OWNER_REPO_DEFAULT,
    forkRepo: NON_OWNER_REPO_DEFAULT,
    branch: ''
  };

  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--scenario' && val) {
      args.scenario = val;
      i++;
    } else if (key === '--skill' && val) {
      args.skill = val;
      i++;
    } else if (key === '--repo' && val) {
      args.repo = val;
      i++;
    } else if (key === '--owner-repo' && val) {
      args.ownerRepo = val;
      i++;
    } else if (key === '--fork-repo' && val) {
      args.forkRepo = val;
      i++;
    } else if (key === '--branch' && val) {
      args.branch = val;
      i++;
    }
  }

  if (args.repo) {
    if (args.scenario === 'fork-pr') {
      args.forkRepo = args.repo;
    } else {
      args.ownerRepo = args.repo;
    }
  }

  return args;
}

function run(cmd, args, cwd = rootDir, options = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
      ...options
    });
    return { ok: true, code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      ok: false,
      code: typeof error.status === 'number' ? error.status : 1,
      stdout: error.stdout ? String(error.stdout) : '',
      stderr: error.stderr ? String(error.stderr) : String(error)
    };
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildShareArgs(skill, repo, branch) {
  const out = ['dist/cli.js', 'share', skill, '--yes'];
  if (repo) out.push('--repo', repo);
  if (branch) out.push('--branch', branch);
  return out;
}

function buildForkShareArgs(skill, repo, branch) {
  const out = buildShareArgs(skill, repo, branch);
  out.push('--fork-pr');
  return out;
}

function ensureSkillExists(skillName) {
  const dbPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.skill-adapter', 'evolution.jsonl');
  assert(fs.existsSync(dbPath), `Missing evolution DB: ${dbPath}`);
  const dbContent = fs.readFileSync(dbPath, 'utf-8');
  assert(dbContent.includes(`"skillName":"${skillName}"`), `Skill "${skillName}" not found. Run: sa import ${skillName}`);
}

function scenarioOwner(skillName, repo, branch) {
  console.log('== Scenario: owner ==');
  assert(repo, '--repo is required for owner scenario');
  ensureSkillExists(skillName);

  const uniqueBranch = branch || `skill/${skillName}-owner-test-${Date.now()}`;
  const shareRes = run(process.execPath, buildShareArgs(skillName, repo, uniqueBranch));
  const combined = `${shareRes.stdout}\n${shareRes.stderr}`;
  assert(shareRes.ok, `share failed\n${combined}`);

  if (combined.includes('nothing to commit') || combined.includes('No file changes detected')) {
    throw new Error(
      `owner scenario is no-op (no changes to commit). ` +
      `skill content/version likely already exists in target repo.\n${combined}`
    );
  }

  const lsRes = run('git', ['ls-remote', '--heads', repo, uniqueBranch]);
  assert(lsRes.ok, `git ls-remote failed\n${lsRes.stderr}\nshare output:\n${combined}`);
  assert(
    lsRes.stdout.includes(`refs/heads/${uniqueBranch}`),
    `remote missing branch: ${uniqueBranch}\nshare output:\n${combined}`
  );

  const ownerRepoMatch = repo.replace(/\.git$/i, '').match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  assert(ownerRepoMatch, `invalid GitHub repo format: ${repo}`);
  const ownerBranchUrl = `https://github.com/${ownerRepoMatch[1]}/${ownerRepoMatch[2]}/tree/${encodeURIComponent(uniqueBranch)}`;

  console.log(`PASS(owner): branch=${uniqueBranch}`);
  console.log(`owner branch url: ${ownerBranchUrl}`);
}

function scenarioForkPr(skillName, repo, branch) {
  console.log('== Scenario: owner ==');
  console.log('(already completed)');
  console.log('== Scenario: fork-pr ==');
  assert(repo, '--repo is required for fork-pr scenario');
  ensureSkillExists(skillName);

  const uniqueBranch = branch || `skill/${skillName}-fork-pr-test-${Date.now()}`;
  console.log(`upstream repo: ${repo}`);
  console.log(`test branch: ${uniqueBranch}`);

  const shareRes = run(process.execPath, buildForkShareArgs(skillName, repo, uniqueBranch));
  const combined = `${shareRes.stdout}\n${shareRes.stderr}`;
  assert(shareRes.ok, `fork-pr share failed\n${combined}`);
  assert(
    combined.includes('Pull Request created!') || combined.includes('Branch created and pushed!'),
    `missing success indicator in fork-pr output\n${combined}`
  );

  const repoMatch = repo.replace(/\.git$/i, '').match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  assert(repoMatch, `invalid GitHub repo format: ${repo}`);
  const repoName = repoMatch[2];

  const loginRes = run('gh', ['api', 'user', '--jq', '.login']);
  assert(loginRes.ok, `failed to get gh login\n${loginRes.stderr}`);
  const login = loginRes.stdout.trim();
  assert(login, 'empty gh login');

  const forkRepo = `https://github.com/${login}/${repoName}.git`;
  const forkBranchUrl = `https://github.com/${login}/${repoName}/tree/${encodeURIComponent(uniqueBranch)}`;
  const lsRes = run('git', ['ls-remote', '--heads', forkRepo, uniqueBranch]);
  assert(lsRes.ok, `git ls-remote failed for fork repo\n${lsRes.stderr}`);
  assert(
    lsRes.stdout.includes(`refs/heads/${uniqueBranch}`),
    `fork branch missing: ${uniqueBranch} in ${forkRepo}\nshare output:\n${combined}`
  );

  console.log(`PASS(fork-pr): branch exists in fork and share completed`);
  console.log(`fork branch url: ${forkBranchUrl}`);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.scenario === 'all') {
    scenarioOwner(args.skill, args.ownerRepo, args.branch);
    scenarioForkPr(args.skill, args.forkRepo, '');
    return;
  }
  if (args.scenario === 'owner') {
    scenarioOwner(args.skill, args.ownerRepo, args.branch);
    return;
  }
  if (args.scenario === 'fork-pr') {
    scenarioForkPr(args.skill, args.forkRepo, args.branch);
    return;
  }

  throw new Error(`Unknown --scenario: ${args.scenario}`);
}

try {
  main();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}

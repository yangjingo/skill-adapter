import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ora from 'ora';

export const DEFAULT_PR_REPO = 'https://github.com/leow3lab/awesome-ascend-skills';

export interface ShareByPrParams {
  skillName: string;
  version: string;
  skillPackage: {
    manifest: unknown;
    content: { systemPrompt: string };
  };
  repo: string;
  branch?: string;
  ghBinary?: string;
  forkPr?: boolean;
  promptYesNo?: (question: string, defaultValue?: boolean) => Promise<boolean>;
}

function extractGitHubRepoSlug(repoUrl: string): string | null {
  const normalized = repoUrl.replace(/\.git$/i, '').replace(/\/$/, '');

  const httpsMatch = normalized.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  if (httpsMatch) return httpsMatch[1];

  const sshMatch = normalized.match(/^git@github\.com:([^/]+\/[^/]+)$/i);
  if (sshMatch) return sshMatch[1];

  return null;
}

function buildGitHubCompareUrl(repoUrl: string, branchName: string): string | null {
  const slug = extractGitHubRepoSlug(repoUrl);
  if (!slug) return null;
  return `https://github.com/${slug}/compare/${encodeURIComponent(branchName)}?expand=1`;
}

function buildGitHubTreeUrl(repoSlug: string, branchName: string): string {
  return `https://github.com/${repoSlug}/tree/${encodeURIComponent(branchName)}`;
}

function hasCommand(command: string): boolean {
  const { spawnSync } = require('child_process');
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf-8',
    shell: false,
    stdio: 'ignore'
  });
  return !result.error && result.status === 0;
}

function hasGitHubCli(ghBinary: string): boolean {
  const { spawnSync } = require('child_process');
  const result = spawnSync(ghBinary, ['--version'], {
    encoding: 'utf-8',
    shell: false,
    stdio: 'ignore'
  });
  return !result.error && result.status === 0;
}

function isGitHubCliAuthenticated(ghBinary: string): boolean {
  const { spawnSync } = require('child_process');
  const result = spawnSync(ghBinary, ['auth', 'status', '--hostname', 'github.com'], {
    encoding: 'utf-8',
    shell: false,
    stdio: 'ignore'
  });
  return !result.error && result.status === 0;
}

function runGitHubCliLogin(ghBinary: string): boolean {
  const { spawnSync } = require('child_process');
  const result = spawnSync(ghBinary, ['auth', 'login', '--hostname', 'github.com'], {
    shell: false,
    stdio: 'inherit'
  });
  return !result.error && result.status === 0;
}

function getGitHubLogin(ghBinary: string): string | null {
  const { execFileSync } = require('child_process');
  try {
    return execFileSync(ghBinary, ['api', 'user', '--jq', '.login'], { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function getGitHubDefaultBranch(ghBinary: string, repoSlug: string): string | null {
  const { execFileSync } = require('child_process');
  try {
    return execFileSync(ghBinary, ['api', `repos/${repoSlug}`, '--jq', '.default_branch'], { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function ensureGitHubForkExists(ghBinary: string, upstreamSlug: string, forkSlug: string): void {
  const { execFileSync } = require('child_process');
  try {
    execFileSync(ghBinary, ['repo', 'view', forkSlug], { stdio: 'pipe' });
    return;
  } catch {
    // Fork does not exist; create it.
  }

  execFileSync(ghBinary, ['repo', 'fork', upstreamSlug, '--default-branch-only'], { stdio: 'inherit' });
}

function printGitHubCliGuidance(ghBinary: string): void {
  console.log('\nGitHub PR auto-create is unavailable (`gh` not found).');
  console.log('You can still push branch and open PR manually.');
  console.log('To enable auto-create:');
  console.log('  1) Install gh: npm run setup:gh');
  console.log('  2) Login:      gh auth login');
  if (ghBinary !== 'gh') {
    console.log(`  3) Or use:     sa share <skill> --gh ${ghBinary}`);
  }
}

function printPrRepoConfigGuidance(skillName: string, repo: string, isDefaultRepo: boolean): void {
  console.log(`PR target: ${repo}`);
  if (isDefaultRepo) {
    console.log(`Default flow: sa share ${skillName}`);
    console.log(`Need another repo? sa share ${skillName} --repo https://github.com/<org>/<repo>`);
  }
}

function printPrFailureGuidance(skillName: string, repo: string, branchName: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.log('\nTroubleshooting suggestions:');

  if (message.includes('spawnSync git ENOENT') || message.includes('spawn git ENOENT')) {
    console.log('- Git is not available in current PATH');
    console.log('- Install Git: https://git-scm.com/downloads');
    console.log('- Verify: git --version');
    console.log('- Restart terminal after installation');
  }

  if (message.includes('already exists')) {
    console.log(`- Branch already exists: ${branchName}`);
    console.log(`- Retry with another branch name: sa share <skill> --branch ${branchName}-retry`);
  }

  if (message.includes('Permission denied') || message.includes('Authentication failed') || message.includes('403')) {
    console.log('- Check GitHub auth: gh auth status');
    console.log('- Prefer GH_TOKEN + SSH for git push');
    console.log('- Check write permission to target repository');
    console.log('\nNext tips (if you are not owner/collaborator):');
    console.log(`- Retry with fork PR: sa share ${skillName} --repo ${repo} --fork-pr --yes`);
  }

  if (message.includes('nothing to commit') || message.includes('no changes added to commit')) {
    console.log('- No file changes detected against current base branch');
    console.log('- This usually means the same skill content/version already exists in target repository');
    console.log('- Change skill content/version, then retry');
  }

  console.log(`- Verify branch on remote: git ls-remote --heads "${repo}" "${branchName}"`);
}

function getDefaultBranch(cwd: string): string {
  const { execSync } = require('child_process');

  try {
    const originInfo = execSync('git remote show origin', { cwd, encoding: 'utf-8' });
    const headBranchMatch = originInfo.match(/HEAD branch:\s*(.+)$/m);
    if (headBranchMatch?.[1]) {
      return headBranchMatch[1].trim();
    }
  } catch {
    // Ignore and fall back to next strategy.
  }

  try {
    const symbolicRef = execSync('git symbolic-ref --quiet refs/remotes/origin/HEAD', { cwd, encoding: 'utf-8' });
    const symbolicMatch = symbolicRef.match(/refs\/remotes\/origin\/(.+)$/m);
    if (symbolicMatch?.[1]) {
      return symbolicMatch[1].trim();
    }
  } catch {
    // Ignore and fall back to default branch.
  }

  return 'main';
}

async function execGit(args: string[], cwd: string, ignoreError = false): Promise<string> {
  const { execFileSync } = require('child_process');
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' });
  } catch (error: any) {
    if (!ignoreError) throw error;
    return '';
  }
}

async function runStep<T>(startText: string, successText: string, fn: () => Promise<T> | T): Promise<T> {
  const spinner = ora(startText).start();
  try {
    const result = await fn();
    spinner.succeed(successText);
    return result;
  } catch (error: any) {
    spinner.fail(`${successText} (failed)`);
    throw error;
  }
}

export async function shareByPr(params: ShareByPrParams): Promise<boolean> {
  const {
    skillName,
    version,
    skillPackage,
    repo,
    branch,
    ghBinary = process.env.GH_CLI_PATH || 'gh',
    forkPr = false,
    promptYesNo
  } = params;

  if (!hasCommand('git')) {
    console.error('Git is required for `sa share` but was not found in PATH.');
    console.error('Install Git: https://git-scm.com/downloads');
    console.error('Then verify: git --version');
    return false;
  }

  console.log(`\nCreating Pull Request to ${repo}...\n`);
  console.log('=== Repository Setup ===');
  printPrRepoConfigGuidance(skillName, repo, repo === DEFAULT_PR_REPO);

  const branchName = branch || `skill/${skillName}-v${version}`;
  const tempDir = path.join(os.tmpdir(), 'skill-adapter-pr', skillName);
  const githubRepoSlug = extractGitHubRepoSlug(repo);
  const githubCompareUrl = buildGitHubCompareUrl(repo, branchName);
  const isGitHubRepo = Boolean(githubRepoSlug);
  let canCreateGitHubPr = false;
  let cloneRepo = repo;
  let prRepoSlug: string = githubRepoSlug || '';
  let prHead = branchName;
  let prBaseBranch: string | null = null;
  let forkSlug: string | null = null;
  let githubLogin: string | null = null;

  if (!isGitHubRepo) {
    console.error('Only GitHub repositories are supported for `sa share`.');
    console.error('Use: --repo https://github.com/<org>/<repo>');
    return false;
  }

  if (!hasGitHubCli(ghBinary)) {
    console.log(`⚠️  GitHub CLI not found: ${ghBinary}`);
    printGitHubCliGuidance(ghBinary);
  } else if (!isGitHubCliAuthenticated(ghBinary)) {
    console.log(`⚠️  GitHub CLI is installed but not authenticated: ${ghBinary}`);
    const shouldLogin = promptYesNo ? await promptYesNo('Run gh auth login now?', true) : false;
    if (shouldLogin) {
      console.log('\n🔐 Starting interactive GitHub login...');
      const loginSucceeded = runGitHubCliLogin(ghBinary);
      if (loginSucceeded && isGitHubCliAuthenticated(ghBinary)) {
        console.log('✅ GitHub CLI authenticated.\n');
        canCreateGitHubPr = true;
      } else {
        console.log('❌ GitHub CLI login failed or was cancelled.');
        printGitHubCliGuidance(ghBinary);
      }
    } else {
      printGitHubCliGuidance(ghBinary);
    }
  } else {
    canCreateGitHubPr = true;
  }

  if (forkPr) {
    if (!canCreateGitHubPr) {
      console.error('`--fork-pr` requires authenticated GitHub CLI (`gh auth login`).');
      return false;
    }

    githubLogin = getGitHubLogin(ghBinary);
    if (!githubLogin) {
      console.error('Failed to determine GitHub login from `gh`.');
      console.error('Try: gh auth status');
      return false;
    }

    const upstreamRepoName = prRepoSlug.split('/')[1];
    const resolvedForkSlug = `${githubLogin}/${upstreamRepoName}`;
    forkSlug = resolvedForkSlug;
      console.log(`\n=== Fork PR Mode ===`);
      console.log(`   Upstream: ${prRepoSlug}`);
      console.log(`   Fork:     ${resolvedForkSlug}`);
      try {
      await runStep('Ensuring fork exists...', 'Fork ready', () => {
        ensureGitHubForkExists(ghBinary, prRepoSlug, resolvedForkSlug);
      });
    } catch (error) {
      console.error('Failed to ensure fork repository exists.');
      console.error(`Upstream: ${prRepoSlug}`);
      console.error(`Fork: ${forkSlug}`);
      console.error('Try running manually:');
      console.error(`  gh repo fork ${prRepoSlug} --default-branch-only`);
      console.error(`Details: ${error}`);
      return false;
    }

    cloneRepo = `https://github.com/${forkSlug}.git`;
    prHead = `${githubLogin}:${branchName}`;
    prBaseBranch = getGitHubDefaultBranch(ghBinary, prRepoSlug) || 'main';
  }

  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(tempDir), { recursive: true });
    console.log('\n=== Git Operations ===');
    await runStep('Cloning repository...', 'Repository cloned', () =>
      execGit(['clone', cloneRepo, tempDir], path.dirname(tempDir))
    );

    await runStep(`Creating branch: ${branchName}...`, `Branch created: ${branchName}`, () =>
      execGit(['checkout', '-b', branchName], tempDir)
    );

    const skillDir = path.join(tempDir, 'skills', skillName);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    fs.writeFileSync(path.join(skillDir, 'skill.json'), JSON.stringify(skillPackage.manifest, null, 2));
    fs.writeFileSync(path.join(skillDir, 'skill.md'), skillPackage.content.systemPrompt);
    fs.writeFileSync(path.join(skillDir, 'README.md'), `# ${skillName}\n\nVersion: ${version}\n\nExported by Skill-Adapter`);

    await runStep('Staging changes...', 'Changes staged', () => execGit(['add', '.'], tempDir));
    await runStep('Committing changes...', 'Changes committed', () =>
      execGit(['commit', '-m', `feat: Add/Update skill ${skillName} v${version}`], tempDir)
    );

    await runStep('Pushing branch...', 'Branch pushed', () =>
      execGit(['push', '-u', 'origin', branchName], tempDir)
    );

    if (canCreateGitHubPr) {
      const defaultBranch = prBaseBranch || getDefaultBranch(tempDir);
      const pushedRepoSlug = forkPr && forkSlug ? forkSlug : prRepoSlug;
      const title = `feat: Add/Update skill ${skillName} v${version}`;
      const body = [
        'Automated skill share from Skill-Adapter.',
        '',
        `- Skill: ${skillName}`,
        `- Version: ${version}`,
        `- Branch: ${branchName}`,
        `- Repo: ${repo}`,
        forkPr && forkSlug ? `- Fork: ${forkSlug}` : ''
      ].filter(Boolean).join('\n');

      console.log('\n=== Pull Request ===');
      const prOutput = await runStep('Creating GitHub Pull Request...', 'Pull Request created', () => {
        const { execFileSync } = require('child_process');
        return execFileSync(
          ghBinary,
          [
            'pr',
            'create',
            '--repo',
            prRepoSlug,
            '--base',
            defaultBranch,
            '--head',
            prHead,
            '--title',
            title,
            '--body',
            body
          ],
          { cwd: tempDir, encoding: 'utf-8' }
        ).trim();
      });

      console.log('\n✅ Pull Request created!');
      console.log(`   Repo: ${repo}`);
      console.log(`   Branch: ${branchName}`);
      console.log(`   Branch URL: ${buildGitHubTreeUrl(pushedRepoSlug, branchName)}`);
      if (forkPr && forkSlug) {
        console.log(`   Fork: ${forkSlug}`);
      }
      if (prOutput) {
        console.log(`   URL: ${prOutput}`);
      } else if (githubCompareUrl) {
        console.log(`   URL: ${githubCompareUrl}`);
      }
    } else {
      const pushedRepoSlug = forkPr && forkSlug ? forkSlug : prRepoSlug;
      console.log('\n✅ Branch created and pushed!');
      console.log(`   Branch: ${branchName}`);
      console.log(`   Repo: ${forkPr && forkSlug ? `https://github.com/${forkSlug}` : repo}`);
      console.log(`   Branch URL: ${buildGitHubTreeUrl(pushedRepoSlug, branchName)}`);
      if (githubCompareUrl) {
        console.log('\n💡 GitHub PR link if you want to open it manually:');
        console.log(`   URL: ${githubCompareUrl}`);
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ PR creation failed: ${error instanceof Error ? error.message : String(error)}`);
    printPrFailureGuidance(skillName, repo, branchName, error);
    return false;
  }
}

#!/usr/bin/env node

const { spawnSync } = require('child_process');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (result.error) return false;
  return result.status === 0;
}

function has(cmd) {
  const probe = process.platform === 'win32'
    ? spawnSync('where', [cmd], { stdio: 'ignore', shell: false })
    : spawnSync('which', [cmd], { stdio: 'ignore', shell: false });
  return !probe.error && probe.status === 0;
}

function hasGh() {
  const gh = spawnSync('gh', ['--version'], { stdio: 'ignore', shell: false });
  return !gh.error && gh.status === 0;
}

if (hasGh()) {
  console.log('GitHub CLI already installed.');
  process.exit(0);
}

console.log('Installing GitHub CLI (`gh`)...');

let ok = false;

if (process.platform === 'win32') {
  if (has('winget')) ok = run('winget', ['install', '--id', 'GitHub.cli', '-e']);
  if (!ok && has('scoop')) ok = run('scoop', ['install', 'gh']);
  if (!ok && has('choco')) ok = run('choco', ['install', 'gh', '-y']);
} else if (process.platform === 'darwin') {
  if (has('brew')) ok = run('brew', ['install', 'gh']);
} else {
  if (has('apt-get')) {
    console.log('Detected apt-get. You may be prompted for sudo password.');
    ok = run('sudo', ['apt-get', 'update']) && run('sudo', ['apt-get', 'install', '-y', 'gh']);
  } else if (has('dnf')) {
    console.log('Detected dnf. You may be prompted for sudo password.');
    ok = run('sudo', ['dnf', 'install', '-y', 'gh']);
  }
}

if (!ok || !hasGh()) {
  console.log('\nUnable to auto-install gh in this environment.');
  console.log('Install manually: https://cli.github.com/');
  process.exit(1);
}

console.log('\nGitHub CLI installed successfully.');
console.log('Next: gh auth login');

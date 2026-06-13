import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, execSync, spawnSync } from 'child_process';
import { runInstall } from '../../src/cli/commands/install';
import {
  PROJECT_HOOK_BIN_REL,
  PROJECT_RUNTIME_VERSION_REL,
} from '../../src/cli/installer/project-runtime';

function tempDir(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function findCommand(command: string): string {
  return execFileSync('which', [command], { encoding: 'utf-8' }).trim();
}

function writeExecutable(filePath: string, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, { mode: 0o755 });
}

function makeRestrictedPath(root: string, commands: Record<string, string>): string {
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const [name, target] of Object.entries(commands)) {
    fs.symlinkSync(target, path.join(bin, name));
  }
  return bin;
}

describe('project-local hook runtime', () => {
  test('project hook executable runs a route without repo-harness on PATH, including paths with spaces', () => {
    const tmp = tempDir('repo harness runtime ');
    const repo = path.join(tmp, 'repo with spaces');
    const hooks = path.join(tmp, 'custom hooks');
    const marker = path.join(repo, 'hook-root.txt');
    try {
      fs.mkdirSync(path.join(repo, '.ai/harness'), { recursive: true });
      fs.writeFileSync(path.join(repo, '.ai/harness/workflow-contract.json'), '{}\n');
      execSync('git init', { cwd: repo, stdio: 'ignore' });
      writeExecutable(
        path.join(hooks, 'post-tool-observer.sh'),
        `#!/bin/bash\nset -euo pipefail\nprintf '%s' "$HOOK_REPO_ROOT" > "${marker}"\n`,
      );

      const result = runInstall({ target: 'codex', scope: 'project', cwd: repo });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(repo, PROJECT_HOOK_BIN_REL))).toBe(true);
      expect(fs.existsSync(path.join(repo, PROJECT_RUNTIME_VERSION_REL))).toBe(true);

      const restrictedPath = makeRestrictedPath(tmp, {
        bash: findCommand('bash'),
        bun: process.execPath,
        git: findCommand('git'),
      });
      const res = spawnSync(
        path.join(repo, PROJECT_HOOK_BIN_REL),
        ['PostToolUse', '--route', 'always'],
        {
          cwd: repo,
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: restrictedPath,
            REPO_HARNESS_HOOK_SOURCE: hooks,
          },
        },
      );

      expect(res.status).toBe(0);
      expect(res.stderr).toBe('');
      expect(fs.readFileSync(marker, 'utf-8')).toBe(repo);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('non-opt-in repos stay silent even when the project runtime is present', () => {
    const tmp = tempDir('repo-harness-runtime-non-opt-in-');
    const repo = path.join(tmp, 'repo');
    const hooks = path.join(tmp, 'hooks');
    const marker = path.join(repo, 'ran.txt');
    try {
      fs.mkdirSync(repo, { recursive: true });
      execSync('git init', { cwd: repo, stdio: 'ignore' });
      writeExecutable(path.join(hooks, 'post-tool-observer.sh'), `#!/bin/bash\ntouch "${marker}"\n`);

      const result = runInstall({ target: 'codex', scope: 'project', cwd: repo });
      expect(result.exitCode).toBe(0);

      const restrictedPath = makeRestrictedPath(tmp, {
        bash: findCommand('bash'),
        bun: process.execPath,
        git: findCommand('git'),
      });
      const res = spawnSync(
        path.join(repo, PROJECT_HOOK_BIN_REL),
        ['PostToolUse', '--route', 'always'],
        {
          cwd: repo,
          encoding: 'utf-8',
          env: {
            ...process.env,
            PATH: restrictedPath,
            REPO_HARNESS_HOOK_SOURCE: hooks,
          },
        },
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toBe('');
      expect(res.stderr).toBe('');
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('missing Bun warns on SessionStart but fails closed for required edit guards', () => {
    const tmp = tempDir('repo-harness-runtime-missing-bun-');
    const repo = path.join(tmp, 'repo');
    const home = path.join(tmp, 'home');
    try {
      fs.mkdirSync(path.join(repo, '.ai/harness'), { recursive: true });
      fs.writeFileSync(path.join(repo, '.ai/harness/workflow-contract.json'), '{}\n');
      execSync('git init', { cwd: repo, stdio: 'ignore' });
      const result = runInstall({ target: 'codex', scope: 'project', cwd: repo });
      expect(result.exitCode).toBe(0);

      const env = { ...process.env, PATH: '', HOME: home };
      const sessionStart = spawnSync(
        '/bin/bash',
        [path.join(repo, PROJECT_HOOK_BIN_REL), 'SessionStart', '--route', 'default'],
        { cwd: repo, encoding: 'utf-8', env },
      );
      expect(sessionStart.status).toBe(0);
      expect(sessionStart.stderr).toContain('Bun is required');

      const editGuard = spawnSync(
        '/bin/bash',
        [path.join(repo, PROJECT_HOOK_BIN_REL), 'PreToolUse', '--route', 'edit'],
        { cwd: repo, encoding: 'utf-8', env },
      );
      expect(editGuard.status).toBe(2);
      expect(editGuard.stderr).toContain('required project hook runtime unavailable');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

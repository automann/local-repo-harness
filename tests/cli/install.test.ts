import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawnSync } from 'child_process';
import { runInstall, runUninstall } from '../../src/cli/commands/install';
import {
  PROJECT_HOOK_BIN_REL,
  PROJECT_RUNTIME_VERSION_REL,
} from '../../src/cli/installer/project-runtime';

function withTempHome(fn: (home: string) => void): void {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-install-')));
  const prev = process.env.HOME;
  process.env.HOME = tmp;
  try {
    fn(tmp);
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('install command (Phase 1B)', () => {
  test('codex --location local creates project .codex/hooks.json without mutating user config.toml', () => {
    withTempHome((home) => {
      const repo = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-install-repo-')),
      );
      try {
        const result = runInstall({ target: 'codex', location: 'local', cwd: repo });
        expect(result.exitCode).toBe(0);
        const filePath = path.join(repo, '.codex/hooks.json');
        expect(fs.existsSync(filePath)).toBe(true);
        expect(fs.existsSync(path.join(home, '.codex/config.toml'))).toBe(false);
        expect(result.lines.some((l) => l.includes('Trust the project .codex layer'))).toBe(true);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const total = Object.values(data.hooks as Record<string, unknown[]>).flat().length;
        expect(total).toBe(8);
        expect(fs.existsSync(path.join(repo, PROJECT_HOOK_BIN_REL))).toBe(true);
        expect(fs.existsSync(path.join(repo, PROJECT_RUNTIME_VERSION_REL))).toBe(true);
        expect(result.lines.some((l) => l.startsWith('[runtime]'))).toBe(true);
        for (const entries of Object.values(data.hooks) as { hooks: { command: string }[] }[][]) {
          for (const entry of entries) {
            const command = entry.hooks[0].command;
            expect(command).toContain('.ai/harness/bin/local-repo-harness-hook');
            expect(command).not.toContain('command -v local-repo-harness-hook');
            expect(command).not.toContain('exec local-repo-harness hook');
          }
        }
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  });

  test('codex --location global creates ~/.codex/hooks.json with 8 matcher-grouped entries', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'codex', location: 'global' });
      expect(result.exitCode).toBe(0);
      const filePath = path.join(home, '.codex/hooks.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const tomlPath = path.join(home, '.codex/config.toml');
      expect(fs.readFileSync(tomlPath, 'utf-8')).toContain('default_mode_request_user_input = true');

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const entries = data.hooks;
      const total = Object.values(entries as Record<string, unknown[]>).flat().length;
      expect(total).toBe(8);

      // PostToolUse must have 3 matcher-disjoint entries
      expect((entries.PostToolUse as { matcher?: string }[]).map((e) => e.matcher)).toEqual([
        'Edit|Write',
        'Bash',
        undefined,
      ]);
      // PreToolUse must have isolated edit and subagent entries
      expect((entries.PreToolUse as { matcher?: string }[]).map((e) => e.matcher)).toEqual([
        'Edit|Write',
        'Task|Agent|SendUserMessage',
      ]);
      // SessionStart / Stop / UserPromptSubmit must have 1 matcher-less entry each
      expect(entries.SessionStart.length).toBe(1);
      expect(entries.Stop.length).toBe(1);
      expect(entries.UserPromptSubmit.length).toBe(1);
    });
  });

  test('every adapter command embeds the CLI-missing fallback shim', () => {
    withTempHome((home) => {
      runInstall({ target: 'codex', location: 'global' });
      const data = JSON.parse(
        fs.readFileSync(path.join(home, '.codex/hooks.json'), 'utf-8'),
      );
      for (const entries of Object.values(data.hooks) as { hooks: { command: string; timeout?: number }[] }[][]) {
        for (const entry of entries) {
          const hook = entry.hooks[0];
          const cmd = hook.command;
          expect(cmd).toContain('command -v local-repo-harness-hook');
          expect(cmd).toContain('exec local-repo-harness-hook ');
          expect(cmd).toContain('command -v local-repo-harness');
          expect(cmd).toContain('HOOK_HOST=codex');
          expect(cmd).toContain('exec local-repo-harness hook ');
          expect(hook.timeout).toBe(30);
        }
      }
    });
  });

  test('codex install is idempotent — second run returns unchanged', () => {
    withTempHome(() => {
      const first = runInstall({ target: 'codex', location: 'global' });
      expect(first.lines.some((l) => l.includes('created'))).toBe(true);

      const second = runInstall({ target: 'codex', location: 'global' });
      expect(second.exitCode).toBe(0);
      expect(second.lines.some((l) => l.includes('unchanged'))).toBe(true);
    });
  });

  test('codex install updates existing config.toml to enable request-user-input popups', () => {
    withTempHome((home) => {
      const tomlPath = path.join(home, '.codex/config.toml');
      fs.mkdirSync(path.dirname(tomlPath), { recursive: true });
      fs.writeFileSync(
        tomlPath,
        [
          'model = "gpt-5"',
          'default_mode_request_user_input = false',
          '',
          '[features]',
          'hooks = true',
          '',
        ].join('\n'),
      );

      const result = runInstall({ target: 'codex', location: 'global' });
      expect(result.exitCode).toBe(0);
      const config = fs.readFileSync(tomlPath, 'utf-8');
      expect(config).toContain('default_mode_request_user_input = true');
      expect(config).not.toContain('default_mode_request_user_input = false');
      expect(config).toContain('[features]');
    });
  });

  test('codex --scope project resolves a git subdirectory to the repo root', () => {
    withTempHome(() => {
      const repo = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-install-git-repo-')),
      );
      try {
        execSync('git init', { cwd: repo, stdio: 'ignore' });
        const subdir = path.join(repo, 'packages/demo');
        fs.mkdirSync(subdir, { recursive: true });

        const result = runInstall({ target: 'codex', scope: 'project', cwd: subdir });

        expect(result.exitCode).toBe(0);
        expect(fs.existsSync(path.join(repo, '.codex/hooks.json'))).toBe(true);
        expect(fs.existsSync(path.join(repo, PROJECT_HOOK_BIN_REL))).toBe(true);
        expect(fs.existsSync(path.join(subdir, '.codex/hooks.json'))).toBe(false);
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  });

  test('install --scope none skips without touching host files', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'both', scope: 'none' });
      expect(result.exitCode).toBe(0);
      expect(result.lines).toEqual([
        '[codex] skipped: --scope none',
        '[claude] skipped: --scope none',
      ]);
      expect(fs.existsSync(path.join(home, '.codex/hooks.json'))).toBe(false);
      expect(fs.existsSync(path.join(home, '.claude/settings.json'))).toBe(false);
    });
  });

  test('claude --location global creates ~/.claude/settings.json with hooks segment', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'claude', location: 'global' });
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(
        fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf-8'),
      );
      const total = Object.values(data.hooks as Record<string, unknown[]>).flat().length;
      expect(total).toBe(8);
      for (const entries of Object.values(data.hooks) as { hooks: { command: string; timeout?: number }[] }[][]) {
        for (const entry of entries) {
          expect(entry.hooks[0].command).toContain('HOOK_HOST=claude');
          expect(entry.hooks[0].timeout).toBe(30);
        }
      }
    });
  });

  test('install preserves sibling non-managed hooks (Phase 0 rtk hook claude case)', () => {
    withTempHome((home) => {
      const filePath = path.join(home, '.claude/settings.json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `${JSON.stringify({
          hooks: {
            PreToolUse: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }],
          },
        }, null, 2)}\n`,
      );
      runInstall({ target: 'claude', location: 'global' });
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const pre = data.hooks.PreToolUse as { hooks: { command: string }[] }[];
      // 1 sibling + 2 managed
      expect(pre.length).toBe(3);
      expect(pre[0].hooks[0].command).toBe('rtk hook claude');
      expect(pre[1].hooks[0].command).toContain('local-repo-harness hook PreToolUse');
      expect(pre[2].hooks[0].command).toContain('local-repo-harness hook PreToolUse');
    });
  });

  test('uninstall + re-install round-trip leaves sibling entries intact', () => {
    withTempHome((home) => {
      const filePath = path.join(home, '.claude/settings.json');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        `${JSON.stringify({
          theme: 'dark',
          hooks: {
            UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'rtk hook claude' }] }],
          },
        }, null, 2)}\n`,
      );
      runInstall({ target: 'claude', location: 'global' });
      const beforeUninstall = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(beforeUninstall.theme).toBe('dark');
      expect(beforeUninstall.hooks.UserPromptSubmit.length).toBe(2);

      const uninstalled = runUninstall({ target: 'claude', scope: 'user' });
      expect(uninstalled.exitCode).toBe(0);
      const afterUninstall = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(afterUninstall.theme).toBe('dark');
      expect(afterUninstall.hooks.UserPromptSubmit.length).toBe(1);
      expect(afterUninstall.hooks.UserPromptSubmit[0].hooks[0].command).toBe('rtk hook claude');

      runInstall({ target: 'claude', location: 'global' });
      const afterReinstall = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(afterReinstall.theme).toBe('dark');
      expect(afterReinstall.hooks.UserPromptSubmit.length).toBe(2);
    });
  });

  test('uninstall --scope project removes only project managed entries', () => {
    withTempHome(() => {
      const repo = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-uninstall-project-')),
      );
      try {
        runInstall({ target: 'codex', scope: 'project', cwd: repo });
        const hooksPath = path.join(repo, '.codex/hooks.json');
        const data = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
        data.hooks.SessionStart.unshift({ hooks: [{ type: 'command', command: 'rtk hook codex' }] });
        fs.writeFileSync(hooksPath, `${JSON.stringify(data, null, 2)}\n`);

        const result = runUninstall({ target: 'codex', scope: 'project', cwd: repo });
        expect(result.exitCode).toBe(0);
        const after = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
        expect(after.hooks.SessionStart.length).toBe(1);
        expect(after.hooks.SessionStart[0].hooks[0].command).toBe('rtk hook codex');
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  });

  test('both --location global installs to both targets', () => {
    withTempHome((home) => {
      const result = runInstall({ target: 'both', location: 'global' });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(home, '.codex/hooks.json'))).toBe(true);
      expect(fs.existsSync(path.join(home, '.claude/settings.json'))).toBe(true);
      // Both targets each emit at least one created/updated line
      expect(result.lines.filter((l) => l.startsWith('[codex]')).length).toBeGreaterThan(0);
      expect(result.lines.filter((l) => l.startsWith('[claude]')).length).toBeGreaterThan(0);
    });
  });

  test('both --location local installs project adapters for both targets', () => {
    withTempHome((home) => {
      const repo = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-install-both-local-')),
      );
      try {
        const result = runInstall({ target: 'both', location: 'local', cwd: repo });
        expect(result.exitCode).toBe(0);
        expect(fs.existsSync(path.join(repo, '.codex/hooks.json'))).toBe(true);
        expect(fs.existsSync(path.join(repo, '.claude/settings.json'))).toBe(true);
        expect(fs.existsSync(path.join(repo, PROJECT_HOOK_BIN_REL))).toBe(true);
        expect(fs.existsSync(path.join(home, '.codex/hooks.json'))).toBe(false);
        expect(fs.existsSync(path.join(home, '.claude/settings.json'))).toBe(false);
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  });

  test('project scope can explicitly opt out to the global PATH runtime', () => {
    withTempHome(() => {
      const repo = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'repo-harness-install-global-runtime-')),
      );
      try {
        const result = runInstall({
          target: 'codex',
          scope: 'project',
          cwd: repo,
          runtime: 'global-path',
        });
        expect(result.exitCode).toBe(0);
        expect(result.lines).toContain('[runtime] warning: project scope is using global PATH runtime; isolation is weaker.');
        expect(fs.existsSync(path.join(repo, PROJECT_HOOK_BIN_REL))).toBe(false);

        const data = JSON.parse(fs.readFileSync(path.join(repo, '.codex/hooks.json'), 'utf-8'));
        const commands = Object.values(data.hooks as Record<string, { hooks: { command: string }[] }[]>)
          .flat()
          .map((entry) => entry.hooks[0].command);
        expect(commands.every((command) => command.includes('command -v local-repo-harness-hook'))).toBe(true);
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    });
  });

  test('user/global scope rejects project-vendored runtime mode', () => {
    withTempHome(() => {
      const result = runInstall({
        target: 'codex',
        scope: 'user',
        runtime: 'project-vendored-bun',
      });
      expect(result.exitCode).toBe(2);
      expect(result.lines.join('\n')).toContain('--runtime project-vendored-bun requires --scope project');
    });
  });

  test('CLI install rejects using --location and --scope together', () => {
    const root = path.join(import.meta.dir, '..', '..');
    const res = spawnSync(
      'bun',
      [path.join(root, 'src/cli/index.ts'), 'install', '--target', 'codex', '--location', 'global', '--scope', 'user'],
      {
        cwd: root,
        encoding: 'utf-8',
      },
    );

    expect(res.status).toBe(2);
    expect(res.stderr).toContain('use either --location or --scope');
  });
});

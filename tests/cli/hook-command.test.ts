import { describe, expect, test } from 'bun:test';
import { ROUTES } from '../../src/cli/hook/route-registry';
import {
  buildHookCommand,
  resolveRuntimeMode,
} from '../../src/cli/installer/hook-command';

const editRoute = ROUTES.find((route) => route.event === 'PreToolUse' && route.routeId === 'edit')!;

describe('hook command resolver', () => {
  test('auto runtime follows install location', () => {
    expect(resolveRuntimeMode('global', 'auto')).toBe('global-path');
    expect(resolveRuntimeMode('local', 'auto')).toBe('project-vendored-bun');
  });

  test('global runtime preserves the PATH fallback shape', () => {
    const command = buildHookCommand({
      route: editRoute,
      host: 'codex',
      runtimeMode: 'global-path',
    });

    expect(command).toContain('REPO_HARNESS_MANAGED=1');
    expect(command).toContain('command -v repo-harness-hook');
    expect(command).toContain('exec repo-harness-hook PreToolUse --route edit');
    expect(command).toContain('command -v repo-harness');
    expect(command).toContain('exec repo-harness hook PreToolUse --route edit');
  });

  test('project runtime resolves and executes the repo-owned hook wrapper', () => {
    const command = buildHookCommand({
      route: editRoute,
      host: 'claude',
      runtimeMode: 'project-vendored-bun',
    });

    expect(command).toContain('repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0');
    expect(command).toContain('hook="$repo_root/.ai/harness/bin/repo-harness-hook"');
    expect(command).toContain('exec "$hook" PreToolUse --route edit');
    expect(command).toContain('HOOK_HOST=claude');
    expect(command).not.toContain('command -v repo-harness-hook');
    expect(command).not.toContain('exec repo-harness hook');
    expect(command).not.toContain('npx');
    expect(command).not.toContain('bunx');
  });
});

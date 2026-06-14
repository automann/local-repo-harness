#!/usr/bin/env bun
/**
 * repo-harness CLI entry.
 *
 * Wires commander.js to the global runtime bootstrap, repo-local update,
 * hook adapter, status, doctor, migrate, security, and tool command bodies.
 */

import { Command } from 'commander';
import { runInstall, runUninstall, type InstallTargetSpec } from './commands/install';
import { runInit, runInteractiveInit, type InitBrainMode } from './commands/init';
import { runHook } from './commands/hook';
import { CLI_VERSION, formatStatus, runStatus } from './commands/status';
import { formatDoctor, runDoctor } from './commands/doctor';
import { buildInitHookCommand } from './commands/init-hook';
import { formatMigratePlan, runMigrate } from './commands/migrate';
import { buildToolsCommand } from './commands/tools';
import { buildBrainCommand } from './commands/brain';
import { buildCapabilityContextCommand } from './commands/capability-context';
import { buildDocsCommand } from './commands/docs';
import { formatSecurityScan, runSecurityScan } from './commands/security';
import { runGlobalRuntimeSetup } from './commands/global-runtime';
import { runPromptGuardDecideCli } from './commands/prompt-guard-decision';
import type { InstallScope, Location } from './installer/types';
import { isRuntimeSelection, type RuntimeSelection } from './installer/hook-command';
import type { HookEvent, RouteId } from './hook/route-registry';
import type { ToolingScope } from './skills/project-skills';

export const SUBCOMMANDS = [
  'init',
  'init-hook',
  'install',
  'uninstall',
  'hook',
  'status',
  'doctor',
  'migrate',
  'security',
  'update',
  'tools',
  'brain',
  'capability-context',
  'docs',
] as const;
export type Subcommand = (typeof SUBCOMMANDS)[number];

const VALID_TARGETS: readonly InstallTargetSpec[] = ['codex', 'claude', 'both'];
const VALID_LOCATIONS: readonly Location[] = ['global', 'local'];
const VALID_SCOPES: readonly InstallScope[] = ['user', 'project', 'none'];
const VALID_RUNTIMES: readonly RuntimeSelection[] = ['auto', 'global-path', 'project-vendored-bun'];

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('repo-harness')
    .description('Repo-local agentic development harness CLI')
    .version(CLI_VERSION)
    .exitOverride();

  program
    .command('init')
    .description('Install the repo-harness CLI, global hook adapters, and required runtime dependencies')
    .option('--target <target>', `Host target for adapters and runtime skills: ${VALID_TARGETS.join('|')}`, 'both')
    .option('--no-cli', 'Skip installing the repo-harness CLI globally')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--no-hooks', 'Skip global hook adapter installation')
    .option('--no-external-skills', 'Skip Waza, Mermaid, and cross-review (codex-review/claude-review) skill bootstrap')
    .option('--no-codegraph', 'Skip CodeGraph CLI/MCP configuration')
    .option('--brain-root <path>', 'Brain vault root to persist for repo-harness brain commands')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: {
      target: string;
      cli?: boolean;
      syncSkill?: boolean;
      hooks?: string | false;
      externalSkills?: boolean;
      codegraph?: boolean;
      brainRoot?: string;
      json?: boolean;
    }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness init: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      const result = runGlobalRuntimeSetup({
        target: rawOpts.target as InstallTargetSpec,
        installCli: rawOpts.cli !== false,
        syncSkill: rawOpts.syncSkill !== false,
        hostAdapters: rawOpts.hooks !== false,
        externalSkills: rawOpts.externalSkills !== false,
        codegraph: rawOpts.codegraph !== false,
        brainRoot: rawOpts.brainRoot,
      });
      if (rawOpts.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const line of result.lines) console.log(line);
      }
      process.exit(result.exitCode);
    });

  program
    .command('update')
    .description('Install or refresh the repo-local harness workflow in an existing repo')
    .option('--repo <path>', 'Target repository path (defaults to cwd)')
    .option('--dry-run', 'Plan repo harness changes without applying them')
    .option('--target <target>', `Host target for adapters and external skills: ${VALID_TARGETS.join('|')}`, 'both')
    .option('--no-sync-skill', 'Skip refreshing repo-harness skill aliases under host skill roots')
    .option('--skill-scope <scope>', `repo-harness-owned skill scope: ${VALID_SCOPES.join('|')} (default: user)`)
    .option('--no-host-adapters', 'Skip writing Codex/Claude hook adapters')
    .option('--host-adapter-scope <scope>', `Hook adapter scope: ${VALID_SCOPES.join('|')} (default: user)`, 'user')
    .option('--runtime <runtime>', `Hook runtime mode: ${VALID_RUNTIMES.join('|')} (default: auto)`, 'auto')
    .option('--no-external-skills', 'Skip Waza and Mermaid third-party skill bootstrap')
    .option('--external-tool-scope <scope>', `Third-party tooling scope: ${VALID_SCOPES.join('|')} (default: user)`)
    .option('--no-verify', 'Skip repo workflow verification after apply')
    .option('--no-codegraph', 'Skip building the CodeGraph index and MCP readiness check')
    .option('--configure-codegraph', 'Auto-register the CodeGraph MCP server for Codex and Claude (legacy shorthand for --codegraph-mcp-scope user)')
    .option('--codegraph-mcp-scope <scope>', `CodeGraph MCP scope: ${VALID_SCOPES.join('|')} (default: none unless --configure-codegraph)`)
    .option('--sync-codegraph', 'Sync the CodeGraph index after ensure')
    .option('--brain-root <path>', 'Brain vault root for manifest sync')
    .option('--brain-mode <mode>', 'Brain sync mode: skip|manifest-only|install-gbrain-cli', 'skip')
    .option('--interactive', 'Run the numbered interactive install planner')
    .option('--json', 'Output JSON instead of human-readable text')
    .action(async (rawOpts: {
      repo?: string;
      dryRun?: boolean;
      target: string;
      syncSkill?: boolean;
      skillScope?: string;
      hostAdapters?: boolean;
      hostAdapterScope?: string;
      runtime?: string;
      externalSkills?: boolean;
      externalToolScope?: string;
      verify?: boolean;
      codegraph?: boolean;
      configureCodegraph?: boolean;
      codegraphMcpScope?: string;
      syncCodegraph?: boolean;
      brainRoot?: string;
      brainMode?: string;
      interactive?: boolean;
      json?: boolean;
    }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness update: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      if (!['skip', 'manifest-only', 'install-gbrain-cli'].includes(rawOpts.brainMode ?? 'skip')) {
        console.error('repo-harness update: invalid --brain-mode (expected: skip, manifest-only, install-gbrain-cli)');
        process.exit(2);
      }
      if (!VALID_SCOPES.includes(rawOpts.hostAdapterScope as InstallScope)) {
        console.error(
          `repo-harness update: invalid --host-adapter-scope "${rawOpts.hostAdapterScope}" (expected: ${VALID_SCOPES.join(', ')})`,
        );
        process.exit(2);
      }
      for (const [flag, value] of [
        ['--skill-scope', rawOpts.skillScope],
        ['--external-tool-scope', rawOpts.externalToolScope],
        ['--codegraph-mcp-scope', rawOpts.codegraphMcpScope],
      ] as const) {
        if (value && !VALID_SCOPES.includes(value as InstallScope)) {
          console.error(`repo-harness update: invalid ${flag} "${value}" (expected: ${VALID_SCOPES.join(', ')})`);
          process.exit(2);
        }
      }
      if (!isRuntimeSelection(rawOpts.runtime ?? 'auto')) {
        console.error(
          `repo-harness update: invalid --runtime "${rawOpts.runtime}" (expected: ${VALID_RUNTIMES.join(', ')})`,
        );
        process.exit(2);
      }
      const common = {
        repo: rawOpts.repo,
        apply: rawOpts.dryRun !== true,
        target: rawOpts.target as InstallTargetSpec,
        syncSkill: rawOpts.syncSkill !== false,
        skillScope: rawOpts.skillScope as ToolingScope | undefined,
        hostAdapters: rawOpts.hostAdapters !== false,
        hostAdapterScope: rawOpts.hostAdapterScope as InstallScope,
        runtime: rawOpts.runtime as RuntimeSelection,
        externalSkills: rawOpts.externalSkills !== false,
        externalToolScope: rawOpts.externalToolScope as ToolingScope | undefined,
        verify: rawOpts.verify !== false,
        codegraph: rawOpts.codegraph !== false,
        configureCodegraphMcp: rawOpts.configureCodegraph === true,
        codegraphMcpScope: rawOpts.codegraphMcpScope as ToolingScope | undefined,
        syncCodegraph: rawOpts.syncCodegraph === true,
        brainRoot: rawOpts.brainRoot,
        brainMode: rawOpts.brainMode as InitBrainMode,
      };
      const result = rawOpts.interactive === true
        ? await runInteractiveInit({
            ...common,
            output: rawOpts.json === true ? process.stderr : process.stdout,
          })
        : runInit(common);
      if (rawOpts.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const line of result.lines) console.log(line);
      }
      process.exit(result.exitCode);
    });

  program
    .command('install')
    .description('Install hook adapters into Codex and/or Claude host config')
    .requiredOption('--target <target>', `Target host: ${VALID_TARGETS.join('|')}`)
    .option('--location <location>', `Install location: ${VALID_LOCATIONS.join('|')}`)
    .option('--scope <scope>', `Install scope: ${VALID_SCOPES.join('|')}`)
    .option('--runtime <runtime>', `Hook runtime mode: ${VALID_RUNTIMES.join('|')} (default: auto)`, 'auto')
    .action((rawOpts: { target: string; location?: string; scope?: string; runtime?: string }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness install: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      if (rawOpts.location && rawOpts.scope) {
        console.error('repo-harness install: use either --location or --scope, not both');
        process.exit(2);
      }
      if (!rawOpts.location && !rawOpts.scope) {
        console.error('repo-harness install: one of --location or --scope is required');
        process.exit(2);
      }
      if (rawOpts.location && !VALID_LOCATIONS.includes(rawOpts.location as Location)) {
        console.error(
          `repo-harness install: invalid --location "${rawOpts.location}" (expected: ${VALID_LOCATIONS.join(', ')})`,
        );
        process.exit(2);
      }
      if (rawOpts.scope && !VALID_SCOPES.includes(rawOpts.scope as InstallScope)) {
        console.error(
          `repo-harness install: invalid --scope "${rawOpts.scope}" (expected: ${VALID_SCOPES.join(', ')})`,
        );
        process.exit(2);
      }
      if (!isRuntimeSelection(rawOpts.runtime ?? 'auto')) {
        console.error(
          `repo-harness install: invalid --runtime "${rawOpts.runtime}" (expected: ${VALID_RUNTIMES.join(', ')})`,
        );
        process.exit(2);
      }
      const result = runInstall({
        target: rawOpts.target as InstallTargetSpec,
        location: rawOpts.location as Location | undefined,
        scope: rawOpts.scope as InstallScope | undefined,
        runtime: rawOpts.runtime as RuntimeSelection,
      });
      for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    });

  program
    .command('uninstall')
    .description('Remove repo-harness-managed hook adapters from Codex and/or Claude host config')
    .requiredOption('--target <target>', `Target host: ${VALID_TARGETS.join('|')}`)
    .option('--location <location>', `Install location: ${VALID_LOCATIONS.join('|')}`)
    .option('--scope <scope>', `Install scope: ${VALID_SCOPES.join('|')}`)
    .action((rawOpts: { target: string; location?: string; scope?: string }) => {
      if (!VALID_TARGETS.includes(rawOpts.target as InstallTargetSpec)) {
        console.error(
          `repo-harness uninstall: invalid --target "${rawOpts.target}" (expected: ${VALID_TARGETS.join(', ')})`,
        );
        process.exit(2);
      }
      if (rawOpts.location && rawOpts.scope) {
        console.error('repo-harness uninstall: use either --location or --scope, not both');
        process.exit(2);
      }
      if (!rawOpts.location && !rawOpts.scope) {
        console.error('repo-harness uninstall: one of --location or --scope is required');
        process.exit(2);
      }
      if (rawOpts.location && !VALID_LOCATIONS.includes(rawOpts.location as Location)) {
        console.error(
          `repo-harness uninstall: invalid --location "${rawOpts.location}" (expected: ${VALID_LOCATIONS.join(', ')})`,
        );
        process.exit(2);
      }
      if (rawOpts.scope && !VALID_SCOPES.includes(rawOpts.scope as InstallScope)) {
        console.error(
          `repo-harness uninstall: invalid --scope "${rawOpts.scope}" (expected: ${VALID_SCOPES.join(', ')})`,
        );
        process.exit(2);
      }
      const result = runUninstall({
        target: rawOpts.target as InstallTargetSpec,
        location: rawOpts.location as Location | undefined,
        scope: rawOpts.scope as InstallScope | undefined,
      });
      for (const line of result.lines) console.log(line);
      process.exit(result.exitCode);
    });

  program
    .command('hook')
    .description('Dispatch a hook event to opt-in repo .ai/hooks/<script>')
    .argument('<event>', 'Hook event name')
    .requiredOption('--route <route>', 'Route id (default, edit, bash, always)')
    .action((event: string, rawOpts: { route: string }) => {
      const result = runHook({
        event: event as HookEvent,
        routeId: rawOpts.route as RouteId,
      });
      process.exit(result.exitCode);
    });

  program
    .command('status')
    .description('Show CLI version, host install status, route coverage, and repo opt-in state')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { json?: boolean }) => {
      const report = runStatus();
      console.log(formatStatus(report, rawOpts.json === true));
      process.exit(0);
    });

  program
    .command('doctor')
    .description('Run read-only readiness diagnostics (PATH, version, hosts, trust state)')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { json?: boolean }) => {
      const report = runDoctor();
      console.log(formatDoctor(report, rawOpts.json === true));
      process.exit(report.summary.fail > 0 ? 1 : 0);
    });

  program.addCommand(buildInitHookCommand());

  program
    .command('migrate')
    .description('Remove retired project-level hook adapters while preserving managed project/user adapters')
    .option('--apply', 'Commit changes (default is dry-run)')
    .option('--json', 'Output JSON plan')
    .action((rawOpts: { apply?: boolean; json?: boolean }) => {
      const plan = runMigrate({ apply: rawOpts.apply === true });
      console.log(formatMigratePlan(plan, rawOpts.json === true));
      process.exit(0);
    });

  const security = program
    .command('security')
    .description('Read-only security checks for local hook and editor task configs');
  security
    .command('scan')
    .description('Scan Claude/Codex hook configs and VS Code folder-open tasks')
    .option('--json', 'Output JSON instead of human-readable text')
    .option('--strict', 'Exit non-zero when high-risk or failed findings are present')
    .action((rawOpts: { json?: boolean; strict?: boolean }) => {
      const report = runSecurityScan();
      console.log(formatSecurityScan(report, rawOpts.json === true));
      const strictFailure = report.findings.some((finding) => finding.severity === 'high' || finding.severity === 'fail');
      process.exit(rawOpts.strict === true && strictFailure ? 1 : 0);
    });

  program.addCommand(buildToolsCommand());
  program.addCommand(buildBrainCommand());
  program.addCommand(buildCapabilityContextCommand());
  program.addCommand(buildDocsCommand());
  program
    .command('prompt-guard-decide', { hidden: true })
    .description('Internal prompt-guard intent/state decision engine')
    .action(() => {
      console.log(runPromptGuardDecideCli());
      process.exit(0);
    });

  return program;
}

if (import.meta.main) {
  try {
    await buildProgram().parseAsync(process.argv);
  } catch (err) {
    const e = err as { exitCode?: number; message?: string };
    if (typeof e.exitCode === 'number') process.exit(e.exitCode);
    if (e.message) console.error(e.message);
    process.exit(1);
  }
}

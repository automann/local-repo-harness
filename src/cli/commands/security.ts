/**
 * `repo-harness security scan` -- read-only checks for high-value local
 * config injection surfaces. It reports findings only; it never mutates host
 * or repo config.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { LEGACY_MANAGED_TAG, MANAGED_TAG, type HookEntry } from '../installer/managed-entries';

export type SecurityStatus = 'ok' | 'warn' | 'fail';
export type SecuritySeverity = 'warn' | 'high' | 'fail';
export type ScannedFileKind = 'claude-hooks' | 'codex-hooks' | 'vscode-tasks';

export interface SecurityFinding {
  filePath: string;
  host: 'claude' | 'codex' | 'vscode';
  scope: 'user' | 'project';
  ruleId: string;
  severity: SecuritySeverity;
  summary: string;
  recommendation: string;
}

export interface SecurityScannedFile {
  filePath: string;
  kind: ScannedFileKind;
  exists: boolean;
}

export interface SecurityScanReport {
  status: SecurityStatus;
  findings: SecurityFinding[];
  scannedFiles: SecurityScannedFile[];
}

export interface SecurityScanOptions {
  cwd?: string;
  home?: string;
}

interface HookCommand {
  type?: string;
  command?: unknown;
}

interface HookConfig {
  hooks?: Record<string, HookEntry[]>;
}

interface VscodeTask {
  label?: unknown;
  taskName?: unknown;
  command?: unknown;
  args?: unknown;
  runOptions?: { runOn?: unknown };
  windows?: { command?: unknown; args?: unknown };
  osx?: { command?: unknown; args?: unknown };
  linux?: { command?: unknown; args?: unknown };
}

interface VscodeTasksFile {
  tasks?: VscodeTask[];
}

const SUSPICIOUS_COMMAND_PATTERNS: Array<{ ruleId: string; regex: RegExp; summary: string }> = [
  {
    ruleId: 'remote-shell-pipe',
    regex: /\b(curl|wget)\b[\s\S]{0,240}\|\s*(bash|sh|zsh)\b/i,
    summary: 'Command downloads remote content and pipes it into a shell',
  },
  {
    ruleId: 'base64-exec',
    regex: /\bbase64\b[\s\S]{0,240}(-d|--decode|decode)[\s\S]{0,240}(\||`|\$\(|bash|sh|zsh|python|node)/i,
    summary: 'Command decodes base64 content near an execution sink',
  },
  {
    ruleId: 'apple-script-exec',
    regex: /\bosascript\b/i,
    summary: 'Command invokes osascript',
  },
  {
    ruleId: 'persistence-launch-agent',
    regex: /\blaunchctl\b|\bcrontab\b/i,
    summary: 'Command touches persistence mechanisms',
  },
  {
    ruleId: 'network-shell',
    regex: /(^|[;&|()\s])(nc|ncat)\s/i,
    summary: 'Command invokes netcat/ncat',
  },
  {
    ruleId: 'inline-shell-exec',
    regex: /\b(bash|sh|zsh|python|node)\s+-[ce]\b/i,
    summary: 'Command uses inline interpreter execution',
  },
];

function homeDir(): string {
  return process.env.HOME ?? os.homedir();
}

function resolveRepoRoot(cwd: string): string {
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() || cwd;
  } catch {
    return cwd;
  }
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function pushJsonFailure(
  findings: SecurityFinding[],
  filePath: string,
  err: unknown,
  host: SecurityFinding['host'],
  scope: SecurityFinding['scope'],
): void {
  findings.push({
    filePath,
    host,
    scope,
    ruleId: 'invalid-json',
    severity: 'fail',
    summary: `Could not parse JSON: ${(err as Error).message}`,
    recommendation: 'Inspect the file manually before trusting any configured hooks or tasks.',
  });
}

function suspiciousMatch(command: string): { ruleId: string; summary: string } | null {
  for (const pattern of SUSPICIOUS_COMMAND_PATTERNS) {
    if (pattern.regex.test(command)) {
      return { ruleId: pattern.ruleId, summary: pattern.summary };
    }
  }
  return null;
}

function commandSnippet(command: string): string {
  const compact = command.replace(/\s+/g, ' ').trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function hookBlocks(config: HookConfig): Array<{ event: string; hook: HookCommand }> {
  const out: Array<{ event: string; hook: HookCommand }> = [];
  for (const [event, blocks] of Object.entries(config.hooks ?? {})) {
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      const commands = Array.isArray(block?.hooks) ? block.hooks : [];
      for (const hook of commands) out.push({ event, hook });
    }
  }
  return out;
}

function scanHookConfig(
  findings: SecurityFinding[],
  filePath: string,
  hostLabel: string,
  host: 'claude' | 'codex',
  scope: 'user' | 'project',
): void {
  if (!fs.existsSync(filePath)) return;

  let parsed: unknown;
  try {
    parsed = readJson(filePath);
  } catch (err) {
    pushJsonFailure(findings, filePath, err, host, scope);
    return;
  }

  const config = parsed as HookConfig;
  const commands = hookBlocks(config);

  for (const { event, hook } of commands) {
    const command = typeof hook.command === 'string' ? hook.command : '';
    if (!command) continue;
    const suspicious = suspiciousMatch(command);
    const managed = command.includes(MANAGED_TAG) || (scope === 'user' && command.includes(LEGACY_MANAGED_TAG));
    if (managed && suspicious === null) continue;
    if (scope === 'project' && command.includes('run-hook.sh') && suspicious === null) {
      findings.push({
        filePath,
        host,
        scope,
        ruleId: 'legacy-project-hook-adapter',
        severity: 'warn',
        summary: `${hostLabel} ${event} hook uses the retired run-hook.sh project adapter`,
        recommendation: 'Run repo-harness migrate --apply or reinstall project adapters with repo-harness install --target both --scope project.',
      });
      continue;
    }
    findings.push({
      filePath,
      host,
      scope,
      ruleId: suspicious?.ruleId ?? 'unmanaged-hook-command',
      severity: suspicious ? 'high' : 'warn',
      summary: suspicious
        ? `${hostLabel} ${event} hook looks risky: ${suspicious.summary}`
        : `${hostLabel} ${event} hook is not managed by repo-harness`,
      recommendation: `Review this command before trusting it: ${commandSnippet(command)}`,
    });
  }
}

function taskLabel(task: VscodeTask): string {
  const label = typeof task.label === 'string'
    ? task.label
    : typeof task.taskName === 'string'
      ? task.taskName
      : '(unnamed task)';
  return label;
}

function commandParts(task: VscodeTask): string {
  const parts: string[] = [];
  for (const source of [task, task.osx, task.linux, task.windows]) {
    if (!source) continue;
    if (typeof source.command === 'string') parts.push(source.command);
    if (Array.isArray(source.args)) {
      parts.push(source.args.filter((arg) => typeof arg === 'string').join(' '));
    }
  }
  return parts.join(' ');
}

function scanVscodeTasks(findings: SecurityFinding[], filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  let parsed: unknown;
  try {
    parsed = readJson(filePath);
  } catch (err) {
    pushJsonFailure(findings, filePath, err, 'vscode', 'project');
    return;
  }

  const config = parsed as VscodeTasksFile;
  for (const task of config.tasks ?? []) {
    if (task?.runOptions?.runOn !== 'folderOpen') continue;
    const command = commandParts(task);
    const suspicious = suspiciousMatch(command);
    findings.push({
      filePath,
      host: 'vscode',
      scope: 'project',
      ruleId: suspicious ? 'vscode-folder-open-suspicious' : 'vscode-folder-open-task',
      severity: suspicious ? 'high' : 'warn',
      summary: suspicious
        ? `VS Code folderOpen task "${taskLabel(task)}" looks risky: ${suspicious.summary}`
        : `VS Code task "${taskLabel(task)}" runs automatically on folder open`,
      recommendation: command
        ? `Review or disable this automatic task: ${commandSnippet(command)}`
        : 'Review or disable this automatic task before opening the folder in VS Code.',
    });
  }
}

function reportStatus(findings: SecurityFinding[]): SecurityStatus {
  if (findings.some((finding) => finding.severity === 'fail')) return 'fail';
  if (findings.length > 0) return 'warn';
  return 'ok';
}

export function runSecurityScan(opts: SecurityScanOptions = {}): SecurityScanReport {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homeDir();
  const repoRoot = resolveRepoRoot(cwd);
  const scannedFiles: SecurityScannedFile[] = [
    { filePath: path.join(home, '.claude', 'settings.json'), kind: 'claude-hooks', exists: false },
    { filePath: path.join(home, '.codex', 'hooks.json'), kind: 'codex-hooks', exists: false },
    { filePath: path.join(repoRoot, '.vscode', 'tasks.json'), kind: 'vscode-tasks', exists: false },
    { filePath: path.join(repoRoot, '.claude', 'settings.json'), kind: 'claude-hooks', exists: false },
    { filePath: path.join(repoRoot, '.codex', 'hooks.json'), kind: 'codex-hooks', exists: false },
  ].map((entry) => ({ ...entry, exists: fs.existsSync(entry.filePath) }));

  const findings: SecurityFinding[] = [];
  scanHookConfig(findings, scannedFiles[0].filePath, 'Claude user-level', 'claude', 'user');
  scanHookConfig(findings, scannedFiles[1].filePath, 'Codex user-level', 'codex', 'user');
  scanVscodeTasks(findings, scannedFiles[2].filePath);
  scanHookConfig(findings, scannedFiles[3].filePath, 'Claude project-level', 'claude', 'project');
  scanHookConfig(findings, scannedFiles[4].filePath, 'Codex project-level', 'codex', 'project');

  return { status: reportStatus(findings), findings, scannedFiles };
}

export function formatSecurityScan(report: SecurityScanReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines: string[] = [];
  lines.push(`Security config: ${report.status}`);
  lines.push(`Scanned files: ${report.scannedFiles.length}`);
  if (report.findings.length === 0) {
    lines.push('No findings.');
    return lines.join('\n');
  }
  for (const finding of report.findings) {
    lines.push(`- [${finding.severity}] ${finding.ruleId} (${finding.host}/${finding.scope}): ${finding.summary}`);
    lines.push(`  ${finding.filePath}`);
    lines.push(`  ${finding.recommendation}`);
  }
  return lines.join('\n');
}

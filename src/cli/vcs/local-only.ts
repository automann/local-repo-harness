import { spawnSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join, normalize, resolve, sep } from "path";

export type VcsScope = "local" | "tracked";
export type VcsArtifactGroup = "install-state" | "workflow-state" | "product-intent";
export type VcsMode = "minimal" | "standard" | "self-host";

export interface LocalVcsPolicyOptions {
  vcsScope?: VcsScope;
  installStateScope?: VcsScope;
  workflowStateScope?: VcsScope;
  productIntentScope?: VcsScope;
  mode?: VcsMode;
  projectScoped?: boolean;
}

export interface LocalVcsPolicy {
  installStateScope: VcsScope;
  workflowStateScope: VcsScope;
  productIntentScope: VcsScope;
  excludeStrategy: "git-info-exclude-plus-local-overlays";
  manifestPath: string;
  source: "options" | "policy" | "default";
}

export interface LocalOnlyEntry {
  path: string;
  group: VcsArtifactGroup;
  owner: string;
  autoCleanup: boolean;
  generatedMarkerRequired?: boolean;
}

export interface LocalOnlyManifest {
  version: number;
  generated_by: string;
  vcs_scope: {
    install_state: VcsScope;
    workflow_state: VcsScope;
    product_intent: VcsScope;
  };
  local_only: LocalOnlyEntry[];
  requires_user_review: string[];
}

export interface VcsIssue {
  path: string;
  group?: VcsArtifactGroup;
  reason?: string;
}

export interface VcsAuditReport {
  repoRoot: string;
  policy: LocalVcsPolicy;
  manifestPath: string;
  localOnly: LocalOnlyEntry[];
  infoExcludePath: string | null;
  infoExcludeStatus: "present" | "missing" | "not-git-repo";
  overlays: Array<{ path: string; status: "present" | "missing" }>;
  trackedLocalOnly: VcsIssue[];
  unignoredLocalOnly: VcsIssue[];
  requiresUserReview: VcsIssue[];
  safeToCommit: boolean;
}

export interface VcsCleanupPlan extends VcsAuditReport {
  dryRun: boolean;
  commands: string[][];
  removedFromIndex: string[];
}

export interface VcsBoundarySyncResult {
  repoRoot: string;
  policy: LocalVcsPolicy;
  manifestPath: string;
  localOnly: LocalOnlyEntry[];
  infoExcludePath: string | null;
  overlays: string[];
  changed: boolean;
  readOnly: boolean;
  skipped: boolean;
  reason?: string;
}

const MANAGED_BEGIN = "# BEGIN: local-repo-harness local-only (managed)";
const MANAGED_END = "# END: local-repo-harness local-only";
export const DEFAULT_LOCAL_ONLY_MANIFEST = ".ai/harness/local-only-manifest.json";

const INSTALL_STATE_PATHS: readonly string[] = [
  ".ai/harness/tools/local-repo-harness/",
  ".ai/harness/tools/codegraph/",
  ".ai/harness/bin/local-repo-harness",
  ".ai/harness/bin/local-repo-harness-hook",
  ".ai/harness/bin/codegraph",
  ".ai/harness/runtime/local-repo-harness/",
  ".ai/harness/codegraph-runtime/",
  ".ai/harness/local-only-manifest.json",
  ".agents/skills/repo-harness/",
  ".agents/skills/think/",
  ".agents/skills/hunt/",
  ".agents/skills/check/",
  ".agents/skills/health/",
  ".agents/skills/mermaid/",
  ".agents/skills/claude-review/",
  ".claude/skills/repo-harness/",
  ".claude/skills/codex-review/",
  ".codex/hooks.json",
  ".codex/config.toml",
  ".codex/.gitignore",
  ".claude/settings.json",
  ".claude/.gitignore",
  ".agents/.gitignore",
  ".ai/.gitignore",
  ".ai/harness/.gitignore",
  ".mcp.json",
  ".codegraph/",
  "_ops/",
];

const WORKFLOW_STATE_PATHS: readonly string[] = [
  "plans/",
  "tasks/",
  ".ai/context/",
  ".ai/harness/",
  ".ai/hooks/",
  ".claude/.skill-version",
  ".claude/templates/",
  "docs/reference-configs/",
  "deploy/README.md",
  "deploy/env/.gitkeep",
  "deploy/scripts/.gitkeep",
  "deploy/submissions/.gitkeep",
  "deploy/runbooks/.gitkeep",
  "deploy/release-checklists/.gitkeep",
  "deploy/sql/.gitkeep",
  "CLAUDE.md",
  "AGENTS.md",
];

const PRODUCT_INTENT_PATHS: readonly string[] = [
  "docs/spec.md",
  "docs/architecture/",
  "docs/researches/",
];

const GENERATED_HELPER_PATHS: readonly string[] = [
  "scripts/new-spec.sh",
  "scripts/new-sprint.sh",
  "scripts/new-plan.sh",
  "scripts/capture-plan.sh",
  "scripts/plan-to-todo.sh",
  "scripts/contract-run.ts",
  "scripts/contract-worktree.sh",
  "scripts/archive-workflow.sh",
  "scripts/refresh-current-status.sh",
  "scripts/prepare-handoff.sh",
  "scripts/verify-contract.sh",
  "scripts/summarize-failures.sh",
  "scripts/verify-sprint.sh",
  "scripts/check-task-sync.sh",
  "scripts/check-deploy-sql-order.sh",
  "scripts/check-agent-tooling.sh",
  "scripts/check-context-files.sh",
  "scripts/check-brain-manifest.sh",
  "scripts/check-architecture-sync.sh",
  "scripts/sync-brain-docs.sh",
  "scripts/ensure-task-workflow.sh",
  "scripts/check-task-workflow.sh",
  "scripts/maintenance-triage.sh",
  "scripts/heartbeat-triage.sh",
  "scripts/sprint-backlog.sh",
  "scripts/capability-resolver.ts",
  "scripts/architecture-event.ts",
  "scripts/capability-config.ts",
  "scripts/architecture-queue.sh",
  "scripts/archive-architecture-request.sh",
  "scripts/context-contract-sync.sh",
  "scripts/workstream-sync.sh",
  "scripts/prepare-codex-handoff.sh",
  "scripts/codex-handoff-resume.sh",
  "scripts/select-agent-context-blocks.sh",
  "scripts/ship-worktrees.sh",
  "scripts/check-skill-version.ts",
  "scripts/inspect-project-state.ts",
  "scripts/migrate-project-template.sh",
  "scripts/migrate-workflow-docs.ts",
  "scripts/switch-plan.sh",
  "scripts/workflow-contract.ts",
];

const GENERATED_MARKERS = [
  "local-repo-harness run",
  "repo-harness template source",
  "generated helper",
  "generated by local-repo-harness",
];

function normalizeRelPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function safeRelPath(value: string): string {
  const normalized = normalizeRelPath(normalize(value));
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`invalid repo-relative path: ${value}`);
  }
  return normalized;
}

function readJson(filePath: string): Record<string, any> | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function scopeFrom(value: unknown): VcsScope | undefined {
  return value === "local" || value === "tracked" ? value : undefined;
}

export function resolveGitRepoRoot(input?: string): string | null {
  const cwd = resolve(input ?? process.cwd());
  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function policyFile(repoRoot: string): Record<string, any> | null {
  return readJson(join(repoRoot, ".ai", "harness", "policy.json"));
}

function policyDefaults(opts: LocalVcsPolicyOptions): VcsScope {
  if (opts.mode === "self-host") return "tracked";
  if (opts.projectScoped === true) return "local";
  return "tracked";
}

export function resolveLocalVcsPolicy(repoRoot: string, opts: LocalVcsPolicyOptions = {}): LocalVcsPolicy {
  const data = policyFile(repoRoot);
  const raw = data?.vcs ?? {};
  const base = opts.vcsScope ?? scopeFrom(raw.scope) ?? policyDefaults(opts);
  const source: LocalVcsPolicy["source"] =
    opts.vcsScope || opts.installStateScope || opts.workflowStateScope || opts.productIntentScope
      ? "options"
      : data?.vcs
        ? "policy"
        : "default";
  return {
    installStateScope:
      opts.installStateScope ?? opts.vcsScope ?? scopeFrom(raw.install_state_scope) ?? scopeFrom(raw.installStateScope) ?? base,
    workflowStateScope:
      opts.workflowStateScope ?? opts.vcsScope ?? scopeFrom(raw.workflow_state_scope) ?? scopeFrom(raw.workflowStateScope) ?? base,
    productIntentScope:
      opts.productIntentScope ?? opts.vcsScope ?? scopeFrom(raw.product_intent_scope) ?? scopeFrom(raw.productIntentScope) ?? base,
    excludeStrategy: "git-info-exclude-plus-local-overlays",
    manifestPath:
      typeof raw.local_only_manifest === "string" && raw.local_only_manifest.trim()
        ? safeRelPath(raw.local_only_manifest)
        : DEFAULT_LOCAL_ONLY_MANIFEST,
    source,
  };
}

function entry(path: string, group: VcsArtifactGroup, autoCleanup = true, generatedMarkerRequired = false): LocalOnlyEntry {
  return {
    path: safeRelPath(path),
    group,
    owner: "local-repo-harness",
    autoCleanup,
    generatedMarkerRequired,
  };
}

export function computeLocalOnlyEntries(policy: LocalVcsPolicy): LocalOnlyEntry[] {
  const out: LocalOnlyEntry[] = [];
  const seen = new Set<string>();
  const add = (next: LocalOnlyEntry) => {
    if (seen.has(next.path)) return;
    seen.add(next.path);
    out.push(next);
  };

  if (policy.installStateScope === "local") {
    for (const path of INSTALL_STATE_PATHS) add(entry(path, "install-state"));
  }
  if (policy.workflowStateScope === "local") {
    for (const path of WORKFLOW_STATE_PATHS) add(entry(path, "workflow-state"));
    for (const path of GENERATED_HELPER_PATHS) add(entry(path, "workflow-state", true, true));
  }
  if (policy.productIntentScope === "local") {
    for (const path of PRODUCT_INTENT_PATHS) add(entry(path, "product-intent"));
  }
  return out;
}

function gitPath(repoRoot: string, args: string[]): { ok: boolean; stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf-8",
  });
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout ?? "",
    stderr: result.stderr || (result.error ? String(result.error.message || result.error) : ""),
    status: result.status,
  };
}

export function gitInfoExcludePath(repoRoot: string): string | null {
  const result = gitPath(repoRoot, ["rev-parse", "--git-path", "info/exclude"]);
  if (!result.ok) return null;
  const value = result.stdout.trim();
  if (!value) return null;
  return resolve(repoRoot, value);
}

function replaceManagedBlock(existing: string, lines: string[]): { next: string; changed: boolean } {
  const block = [MANAGED_BEGIN, ...lines, MANAGED_END, ""].join("\n");
  const pattern = new RegExp(`${escapeRegExp(MANAGED_BEGIN)}[\\s\\S]*?${escapeRegExp(MANAGED_END)}\\n?`, "m");
  const trimmed = existing.replace(pattern, "").replace(/\s+$/g, "");
  const next = `${trimmed ? `${trimmed}\n\n` : ""}${block}`;
  return { next, changed: next !== existing };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ignoreLines(entries: LocalOnlyEntry[]): string[] {
  return entries.map((entry) => entry.path).sort();
}

export function ensureGitInfoExclude(repoRoot: string, entries: LocalOnlyEntry[], apply: boolean): {
  path: string | null;
  changed: boolean;
} {
  const excludePath = gitInfoExcludePath(repoRoot);
  if (!excludePath) return { path: null, changed: false };
  const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf-8") : "";
  const { next, changed } = replaceManagedBlock(existing, ignoreLines(entries));
  if (apply && changed) {
    mkdirSync(dirname(excludePath), { recursive: true });
    writeFileSync(excludePath, next);
  }
  return { path: excludePath, changed };
}

function overlayLinesFor(dir: string, entries: LocalOnlyEntry[]): string[] {
  const prefix = `${dir}/`;
  const direct = entries
    .filter((entry) => entry.path.startsWith(prefix))
    .map((entry) => entry.path.slice(prefix.length))
    .filter((path) => path && path !== ".gitignore");
  return [...new Set(direct)].sort();
}

function overlayDirs(entries: LocalOnlyEntry[]): string[] {
  const candidates = [".codex", ".claude", ".agents", ".ai", ".ai/harness"];
  return candidates.filter((dir) => overlayLinesFor(dir, entries).length > 0);
}

export function ensureLocalIgnoreOverlays(repoRoot: string, entries: LocalOnlyEntry[], apply: boolean): {
  overlays: string[];
  changed: boolean;
} {
  let changed = false;
  const overlays: string[] = [];
  for (const dir of overlayDirs(entries)) {
    const lines = overlayLinesFor(dir, entries);
    const overlayPath = join(repoRoot, ...dir.split("/"), ".gitignore");
    overlays.push(normalizeRelPath(`${dir}/.gitignore`));
    const existing = existsSync(overlayPath) ? readFileSync(overlayPath, "utf-8") : "";
    const { next, changed: oneChanged } = replaceManagedBlock(existing, lines);
    changed = changed || oneChanged;
    if (apply && oneChanged) {
      mkdirSync(dirname(overlayPath), { recursive: true });
      writeFileSync(overlayPath, next);
    }
  }
  return { overlays, changed };
}

function writeManifest(repoRoot: string, policy: LocalVcsPolicy, entries: LocalOnlyEntry[], review: VcsIssue[], apply: boolean): {
  path: string;
  changed: boolean;
} {
  const manifestPath = join(repoRoot, ...policy.manifestPath.split("/"));
  const manifest: LocalOnlyManifest = {
    version: 1,
    generated_by: "local-repo-harness",
    vcs_scope: {
      install_state: policy.installStateScope,
      workflow_state: policy.workflowStateScope,
      product_intent: policy.productIntentScope,
    },
    local_only: entries,
    requires_user_review: review.map((item) => item.path),
  };
  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  const existing = existsSync(manifestPath) ? readFileSync(manifestPath, "utf-8") : "";
  const changed = existing !== next;
  if (apply && changed) {
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, next);
  }
  return { path: manifestPath, changed };
}

function pathExists(repoRoot: string, relPath: string): boolean {
  return existsSync(join(repoRoot, ...relPath.split("/")));
}

function isDirectoryEntry(entry: LocalOnlyEntry): boolean {
  return entry.path.endsWith("/");
}

function hasGeneratedMarker(repoRoot: string, relPath: string): boolean {
  const absolute = join(repoRoot, ...relPath.split("/"));
  if (!existsSync(absolute)) return true;
  try {
    if (statSync(absolute).isDirectory()) return true;
    const content = readFileSync(absolute, "utf-8");
    return GENERATED_MARKERS.some((marker) => content.includes(marker));
  } catch {
    return false;
  }
}

function trackedFiles(repoRoot: string, entries: LocalOnlyEntry[]): string[] {
  if (entries.length === 0) return [];
  const paths = entries.map((entry) => entry.path);
  const result = gitPath(repoRoot, ["ls-files", "--", ...paths]);
  if (!result.ok) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function entryForPath(entries: LocalOnlyEntry[], trackedPath: string): LocalOnlyEntry | undefined {
  return entries.find((entry) => (
    isDirectoryEntry(entry)
      ? trackedPath === entry.path.slice(0, -1) || trackedPath.startsWith(entry.path)
      : trackedPath === entry.path
  ));
}

function isIgnored(repoRoot: string, relPath: string): boolean {
  const result = gitPath(repoRoot, ["check-ignore", "-q", "--", relPath]);
  return result.status === 0;
}

function unignoredEntries(repoRoot: string, entries: LocalOnlyEntry[], tracked: Set<string>): VcsIssue[] {
  const issues: VcsIssue[] = [];
  for (const entry of entries) {
    if (!pathExists(repoRoot, entry.path)) continue;
    if (tracked.has(entry.path)) continue;
    const probePath = isDirectoryEntry(entry) ? entry.path.slice(0, -1) : entry.path;
    if (!isIgnored(repoRoot, probePath)) {
      issues.push({ path: entry.path, group: entry.group, reason: "local-only path is not ignored" });
    }
  }
  return issues;
}

function reviewIssues(repoRoot: string, entries: LocalOnlyEntry[], paths: string[]): VcsIssue[] {
  const issues: VcsIssue[] = [];
  for (const relPath of paths) {
    const entry = entryForPath(entries, relPath);
    if (!entry) {
      issues.push({ path: relPath, reason: "tracked path is not in the local-only manifest" });
      continue;
    }
    if (!entry.autoCleanup) {
      issues.push({ path: relPath, group: entry.group, reason: "auto cleanup disabled" });
      continue;
    }
    if (entry.generatedMarkerRequired && !hasGeneratedMarker(repoRoot, relPath)) {
      issues.push({ path: relPath, group: entry.group, reason: "generated helper marker missing" });
    }
  }
  return issues;
}

export function auditLocalOnlyVcs(repoRootInput: string, opts: LocalVcsPolicyOptions = {}): VcsAuditReport {
  const repoRoot = resolveGitRepoRoot(repoRootInput) ?? resolve(repoRootInput);
  const policy = resolveLocalVcsPolicy(repoRoot, opts);
  const entries = computeLocalOnlyEntries(policy);
  const tracked = trackedFiles(repoRoot, entries);
  const trackedSet = new Set(tracked);
  const review = reviewIssues(repoRoot, entries, tracked);
  const unignored = unignoredEntries(repoRoot, entries, trackedSet);
  const excludePath = gitInfoExcludePath(repoRoot);
  const overlays = overlayDirs(entries).map((dir) => {
    const relPath = normalizeRelPath(`${dir}/.gitignore`);
    return { path: relPath, status: pathExists(repoRoot, relPath) ? "present" as const : "missing" as const };
  });
  const trackedIssues = tracked.map((path) => {
    const entry = entryForPath(entries, path);
    return { path, group: entry?.group, reason: "local-only path is tracked" };
  });
  return {
    repoRoot,
    policy,
    manifestPath: join(repoRoot, ...policy.manifestPath.split("/")),
    localOnly: entries,
    infoExcludePath: excludePath,
    infoExcludeStatus: excludePath ? (existsSync(excludePath) ? "present" : "missing") : "not-git-repo",
    overlays,
    trackedLocalOnly: trackedIssues,
    unignoredLocalOnly: unignored,
    requiresUserReview: review,
    safeToCommit: trackedIssues.length === 0 && unignored.length === 0 && review.length === 0,
  };
}

export function syncLocalVcsBoundary(
  repoRootInput: string,
  opts: LocalVcsPolicyOptions & { apply?: boolean } = {},
): VcsBoundarySyncResult {
  const repoRoot = resolveGitRepoRoot(repoRootInput) ?? resolve(repoRootInput);
  const policy = resolveLocalVcsPolicy(repoRoot, opts);
  const entries = computeLocalOnlyEntries(policy);
  const apply = opts.apply !== false;
  const readOnly = !apply;
  if (entries.length === 0) {
    return {
      repoRoot,
      policy,
      manifestPath: join(repoRoot, ...policy.manifestPath.split("/")),
      localOnly: entries,
      infoExcludePath: gitInfoExcludePath(repoRoot),
      overlays: [],
      changed: false,
      readOnly,
      skipped: true,
      reason: "all vcs scopes are tracked",
    };
  }

  const exclude = ensureGitInfoExclude(repoRoot, entries, apply);
  const overlays = ensureLocalIgnoreOverlays(repoRoot, entries, apply);
  const review = reviewIssues(repoRoot, entries, trackedFiles(repoRoot, entries));
  const manifest = writeManifest(repoRoot, policy, entries, review, apply);
  return {
    repoRoot,
    policy,
    manifestPath: manifest.path,
    localOnly: entries,
    infoExcludePath: exclude.path,
    overlays: overlays.overlays,
    changed: exclude.changed || overlays.changed || manifest.changed,
    readOnly,
    skipped: false,
  };
}

export function cleanupLocalOnlyVcs(
  repoRootInput: string,
  opts: LocalVcsPolicyOptions & { apply?: boolean } = {},
): VcsCleanupPlan {
  const repoRoot = resolveGitRepoRoot(repoRootInput) ?? resolve(repoRootInput);
  const audit = auditLocalOnlyVcs(repoRoot, opts);
  const dryRun = opts.apply !== true;
  const reviewPaths = new Set(audit.requiresUserReview.map((issue) => issue.path));
  const cleanupPaths = audit.trackedLocalOnly
    .map((issue) => issue.path)
    .filter((path) => !reviewPaths.has(path));
  const commands = cleanupPaths.length > 0
    ? [["git", "-C", repoRoot, "rm", "--cached", "-r", "--ignore-unmatch", "--", ...cleanupPaths]]
    : [];
  const removedFromIndex: string[] = [];
  if (!dryRun && cleanupPaths.length > 0) {
    const result = gitPath(repoRoot, ["rm", "--cached", "-r", "--ignore-unmatch", "--", ...cleanupPaths]);
    if (!result.ok) {
      throw new Error(result.stderr || result.stdout || "git rm --cached failed");
    }
    removedFromIndex.push(...cleanupPaths);
  }
  if (!dryRun) {
    syncLocalVcsBoundary(repoRoot, { ...opts, apply: true });
  }
  return {
    ...auditLocalOnlyVcs(repoRoot, opts),
    dryRun,
    commands,
    removedFromIndex,
  };
}

export function formatVcsAudit(report: VcsAuditReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines: string[] = [];
  lines.push(`Repo: ${report.repoRoot}`);
  lines.push(
    `VCS scope: install=${report.policy.installStateScope}; workflow=${report.policy.workflowStateScope}; productIntent=${report.policy.productIntentScope}`,
  );
  lines.push(`Local-only entries: ${report.localOnly.length}`);
  lines.push(`Tracked local-only: ${report.trackedLocalOnly.length}`);
  lines.push(`Unignored local-only: ${report.unignoredLocalOnly.length}`);
  lines.push(`Requires review: ${report.requiresUserReview.length}`);
  lines.push(`Safe to commit: ${report.safeToCommit ? "yes" : "no"}`);
  for (const issue of [...report.trackedLocalOnly, ...report.unignoredLocalOnly, ...report.requiresUserReview].slice(0, 12)) {
    lines.push(`- ${issue.path}${issue.reason ? ` (${issue.reason})` : ""}`);
  }
  return lines.join("\n");
}

export function formatVcsCleanup(plan: VcsCleanupPlan, asJson = false): string {
  if (asJson) return JSON.stringify(plan, null, 2);
  const lines = [formatVcsAudit(plan, false)];
  lines.push(`Dry run: ${plan.dryRun ? "yes" : "no"}`);
  if (plan.commands.length > 0) {
    lines.push("Commands:");
    for (const command of plan.commands) {
      lines.push(`  ${command.map((part) => part.includes(" ") ? JSON.stringify(part) : part).join(" ")}`);
    }
  }
  if (plan.removedFromIndex.length > 0) {
    lines.push("Removed from index:");
    for (const path of plan.removedFromIndex) lines.push(`  ${path}`);
  }
  return lines.join("\n");
}

export function scopesAreValid(value: string | undefined): value is VcsScope {
  return value === "local" || value === "tracked";
}

export function projectScopedRequested(scopes: {
  skillScope?: string;
  hostAdapterScope?: string;
  externalToolScope?: string;
  codegraphMcpScope?: string;
  brainMode?: string;
}): boolean {
  return (
    scopes.skillScope === "project" ||
    scopes.hostAdapterScope === "project" ||
    scopes.externalToolScope === "project" ||
    scopes.codegraphMcpScope === "project" ||
    (scopes.brainMode !== undefined && scopes.brainMode !== "skip")
  );
}

export function chmodExecutableIfExists(filePath: string): void {
  if (existsSync(filePath)) chmodSync(filePath, 0o755);
}

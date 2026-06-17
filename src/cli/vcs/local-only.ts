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
export type VcsProfileName = "project-local-install" | "ephemeral-agent-workspace" | "tracked-governance" | "self-host";

export interface LocalVcsPolicyOptions {
  vcsScope?: VcsScope;
  vcsProfile?: string;
  trackedWhitelist?: string[];
  installStateScope?: VcsScope;
  workflowStateScope?: VcsScope;
  productIntentScope?: VcsScope;
  mode?: VcsMode;
  projectScoped?: boolean;
}

export interface LocalVcsProfile {
  version: 1;
  name: VcsProfileName;
  scopes: {
    install_state_scope: VcsScope;
    workflow_state_scope: VcsScope;
    product_intent_scope: VcsScope;
  };
  tracked_whitelist: string[];
}

export interface LocalVcsPolicy {
  profileName: string;
  installStateScope: VcsScope;
  workflowStateScope: VcsScope;
  productIntentScope: VcsScope;
  trackedWhitelist: string[];
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
  vcs_profile: string;
  vcs_scope: {
    install_state: VcsScope;
    workflow_state: VcsScope;
    product_intent: VcsScope;
  };
  tracked_whitelist: string[];
  local_only: LocalOnlyEntry[];
  requires_user_review: string[];
}

export interface VcsIssue {
  path: string;
  group?: VcsArtifactGroup;
  reason?: string;
  source?: string;
  pattern?: string;
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
  projectIgnoredConflicts: VcsIssue[];
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

export const DEFAULT_VCS_PROFILE: VcsProfileName = "project-local-install";
export const VCS_PROFILES: Record<VcsProfileName, LocalVcsProfile> = {
  "project-local-install": {
    version: 1,
    name: "project-local-install",
    scopes: {
      install_state_scope: "local",
      workflow_state_scope: "local",
      product_intent_scope: "tracked",
    },
    tracked_whitelist: [],
  },
  "ephemeral-agent-workspace": {
    version: 1,
    name: "ephemeral-agent-workspace",
    scopes: {
      install_state_scope: "local",
      workflow_state_scope: "local",
      product_intent_scope: "local",
    },
    tracked_whitelist: [],
  },
  "tracked-governance": {
    version: 1,
    name: "tracked-governance",
    scopes: {
      install_state_scope: "local",
      workflow_state_scope: "tracked",
      product_intent_scope: "tracked",
    },
    tracked_whitelist: [],
  },
  "self-host": {
    version: 1,
    name: "self-host",
    scopes: {
      install_state_scope: "tracked",
      workflow_state_scope: "tracked",
      product_intent_scope: "tracked",
    },
    tracked_whitelist: [],
  },
};

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

export function vcsProfileIsValid(value: string | undefined): value is VcsProfileName {
  return value === "project-local-install" ||
    value === "ephemeral-agent-workspace" ||
    value === "tracked-governance" ||
    value === "self-host";
}

function profileFromScope(scope: VcsScope): VcsProfileName {
  return scope === "local" ? "project-local-install" : "self-host";
}

function profileFrom(value: unknown): VcsProfileName | undefined {
  return typeof value === "string" && vcsProfileIsValid(value) ? value : undefined;
}

function whitelistFrom(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean).map(safeRelPath);
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean)
    .map(safeRelPath);
}

export function parseTrackedWhitelist(value: string | string[] | undefined): string[] {
  return uniquePaths(whitelistFrom(value));
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map(safeRelPath))];
}

function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = safeRelPath(path);
  const normalizedPattern = safeRelPath(pattern);
  if (normalizedPattern.endsWith("/")) {
    return normalizedPath === normalizedPattern || normalizedPath.startsWith(normalizedPattern);
  }
  return normalizedPath === normalizedPattern;
}

function matchesAnyPath(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => pathMatchesPattern(path, pattern));
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

function defaultProfileName(opts: LocalVcsPolicyOptions, raw: Record<string, any>): VcsProfileName {
  const rawProfile = profileFrom(raw.profile ?? raw.profile_name ?? raw.name);
  if (opts.vcsProfile && vcsProfileIsValid(opts.vcsProfile)) return opts.vcsProfile;
  if (opts.vcsScope) return profileFromScope(opts.vcsScope);
  if (rawProfile) return rawProfile;
  const rawScope = scopeFrom(raw.scope);
  if (rawScope) return profileFromScope(rawScope);
  if (opts.mode === "self-host") return "self-host";
  if (opts.projectScoped === true) return DEFAULT_VCS_PROFILE;
  return "self-host";
}

function rawGroupScopesAreLegacyBroadScope(raw: Record<string, any>): boolean {
  const scope = scopeFrom(raw.scope);
  if (!scope) return false;
  const install = scopeFrom(raw.install_state_scope) ?? scopeFrom(raw.installStateScope);
  const workflow = scopeFrom(raw.workflow_state_scope) ?? scopeFrom(raw.workflowStateScope);
  const product = scopeFrom(raw.product_intent_scope) ?? scopeFrom(raw.productIntentScope);
  return install === scope && workflow === scope && product === scope;
}

function rawGroupScope(raw: Record<string, any>, snake: string, camel: string, useRawGroupScopes: boolean): VcsScope | undefined {
  if (!useRawGroupScopes) return undefined;
  return scopeFrom(raw[snake]) ?? scopeFrom(raw[camel]);
}

function shouldUseRawGroupScopes(raw: Record<string, any>, opts: LocalVcsPolicyOptions): boolean {
  if (opts.vcsProfile || opts.vcsScope) return false;
  if (profileFrom(raw.profile ?? raw.profile_name ?? raw.name)) return false;
  return !rawGroupScopesAreLegacyBroadScope(raw);
}

export function resolveLocalVcsPolicy(repoRoot: string, opts: LocalVcsPolicyOptions = {}): LocalVcsPolicy {
  const data = policyFile(repoRoot);
  const raw = data?.vcs ?? {};
  const profileName = defaultProfileName(opts, raw);
  const profile = VCS_PROFILES[profileName] ?? VCS_PROFILES[DEFAULT_VCS_PROFILE];
  const useRawGroupScopes = shouldUseRawGroupScopes(raw, opts);
  const source: LocalVcsPolicy["source"] =
    opts.vcsScope || opts.vcsProfile || opts.trackedWhitelist || opts.installStateScope || opts.workflowStateScope || opts.productIntentScope
      ? "options"
      : data?.vcs
        ? "policy"
        : "default";
  const trackedWhitelist = uniquePaths([
    ...profile.tracked_whitelist,
    ...whitelistFrom(raw.tracked_whitelist ?? raw.trackedWhitelist),
    ...(opts.trackedWhitelist ?? []),
  ]);
  return {
    profileName,
    installStateScope:
      opts.installStateScope ??
      rawGroupScope(raw, "install_state_scope", "installStateScope", useRawGroupScopes) ??
      profile.scopes.install_state_scope,
    workflowStateScope:
      opts.workflowStateScope ??
      rawGroupScope(raw, "workflow_state_scope", "workflowStateScope", useRawGroupScopes) ??
      profile.scopes.workflow_state_scope,
    productIntentScope:
      opts.productIntentScope ??
      rawGroupScope(raw, "product_intent_scope", "productIntentScope", useRawGroupScopes) ??
      profile.scopes.product_intent_scope,
    trackedWhitelist,
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

function groupEntries(group: VcsArtifactGroup): LocalOnlyEntry[] {
  if (group === "install-state") {
    return INSTALL_STATE_PATHS.map((path) => entry(path, "install-state"));
  }
  if (group === "workflow-state") {
    return [
      ...WORKFLOW_STATE_PATHS.map((path) => entry(path, "workflow-state", false)),
      ...GENERATED_HELPER_PATHS.map((path) => entry(path, "workflow-state", true, true)),
    ];
  }
  return PRODUCT_INTENT_PATHS.map((path) => entry(path, "product-intent", false));
}

function addUniqueEntry(out: LocalOnlyEntry[], seen: Set<string>, next: LocalOnlyEntry): void {
  if (seen.has(next.path)) return;
  seen.add(next.path);
  out.push(next);
}

export function computeLocalOnlyEntries(policy: LocalVcsPolicy): LocalOnlyEntry[] {
  const out: LocalOnlyEntry[] = [];
  const seen = new Set<string>();

  if (policy.installStateScope === "local") {
    for (const next of groupEntries("install-state")) addUniqueEntry(out, seen, next);
  }
  if (policy.workflowStateScope === "local") {
    for (const next of groupEntries("workflow-state")) addUniqueEntry(out, seen, next);
  }
  if (policy.productIntentScope === "local") {
    for (const next of groupEntries("product-intent")) addUniqueEntry(out, seen, next);
  }
  return out.filter((next) => !matchesAnyPath(next.path, policy.trackedWhitelist));
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
    vcs_profile: policy.profileName,
    vcs_scope: {
      install_state: policy.installStateScope,
      workflow_state: policy.workflowStateScope,
      product_intent: policy.productIntentScope,
    },
    tracked_whitelist: policy.trackedWhitelist,
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

function rootGitignoreMatch(repoRoot: string, relPath: string): { ignored: boolean; source?: string; pattern?: string } {
  const probePath = relPath.endsWith("/") ? relPath.slice(0, -1) : relPath;
  const result = gitPath(repoRoot, ["check-ignore", "-v", "--no-index", "--", probePath]);
  if (result.status !== 0) return { ignored: false };
  const line = result.stdout.split(/\r?\n/).find(Boolean);
  if (!line) return { ignored: false };
  const [meta] = line.split("\t");
  const match = meta.match(/^(.*?):\d+:(.*)$/);
  if (!match) return { ignored: false };
  const source = match[1];
  const pattern = match[2];
  const sourceAbs = resolve(repoRoot, source);
  const rootIgnoreAbs = join(repoRoot, ".gitignore");
  const ignored = source === ".gitignore" || sourceAbs === rootIgnoreAbs;
  return ignored ? { ignored, source, pattern } : { ignored: false, source, pattern };
}

function allKnownEntries(): LocalOnlyEntry[] {
  const out: LocalOnlyEntry[] = [];
  const seen = new Set<string>();
  for (const group of ["install-state", "workflow-state", "product-intent"] as const) {
    for (const next of groupEntries(group)) addUniqueEntry(out, seen, next);
  }
  return out;
}

function trackedIntentEntries(policy: LocalVcsPolicy): LocalOnlyEntry[] {
  const out: LocalOnlyEntry[] = [];
  const seen = new Set<string>();
  if (policy.installStateScope === "tracked") {
    for (const next of groupEntries("install-state")) addUniqueEntry(out, seen, next);
  }
  if (policy.workflowStateScope === "tracked") {
    for (const next of groupEntries("workflow-state")) addUniqueEntry(out, seen, next);
  }
  if (policy.productIntentScope === "tracked") {
    for (const next of groupEntries("product-intent")) addUniqueEntry(out, seen, next);
  }
  const known = allKnownEntries();
  for (const path of policy.trackedWhitelist) {
    const existing = entryForPath(known, path);
    addUniqueEntry(out, seen, existing ?? entry(path, "workflow-state", false));
  }
  return out;
}

function projectIgnoredConflicts(repoRoot: string, policy: LocalVcsPolicy, localOnlyEntries: LocalOnlyEntry[], tracked: Set<string>): VcsIssue[] {
  const issues: VcsIssue[] = [];
  const seen = new Set<string>();
  const trackedPaths = [...tracked];
  const add = (issue: VcsIssue) => {
    const key = `${issue.path}:${issue.reason ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  for (const entry of localOnlyEntries) {
    const trackedEntryPaths = trackedPaths.filter((path) => entryForPath([entry], path));
    for (const trackedPath of trackedEntryPaths) {
      const match = rootGitignoreMatch(repoRoot, trackedPath);
      if (!match.ignored) continue;
      add({
        path: trackedPath,
        group: entry.group,
        reason: "tracked local-only path is ignored by project .gitignore",
        source: match.source,
        pattern: match.pattern,
      });
    }
  }

  for (const entry of trackedIntentEntries(policy)) {
    if (!pathExists(repoRoot, entry.path)) continue;
    const probePath = isDirectoryEntry(entry) ? entry.path.slice(0, -1) : entry.path;
    const match = rootGitignoreMatch(repoRoot, probePath);
    if (match.ignored) {
      const whitelisted = matchesAnyPath(entry.path, policy.trackedWhitelist);
      add({
        path: entry.path,
        group: entry.group,
        reason: whitelisted
          ? "tracked_whitelist path is ignored by project .gitignore"
          : "tracked profile path is ignored by project .gitignore",
        source: match.source,
        pattern: match.pattern,
      });
    }
  }

  return issues;
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
  const ignoredConflicts = projectIgnoredConflicts(repoRoot, policy, entries, trackedSet);
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
    projectIgnoredConflicts: ignoredConflicts,
    safeToCommit: trackedIssues.length === 0 && unignored.length === 0 && review.length === 0 && ignoredConflicts.length === 0,
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
    `VCS profile: ${report.policy.profileName}`,
  );
  lines.push(
    `VCS scope: install=${report.policy.installStateScope}; workflow=${report.policy.workflowStateScope}; productIntent=${report.policy.productIntentScope}`,
  );
  lines.push(`Tracked whitelist: ${report.policy.trackedWhitelist.length}`);
  lines.push(`Local-only entries: ${report.localOnly.length}`);
  lines.push(`Tracked local-only: ${report.trackedLocalOnly.length}`);
  lines.push(`Unignored local-only: ${report.unignoredLocalOnly.length}`);
  lines.push(`Requires review: ${report.requiresUserReview.length}`);
  lines.push(`Project .gitignore conflicts: ${report.projectIgnoredConflicts.length}`);
  lines.push(`Safe to commit: ${report.safeToCommit ? "yes" : "no"}`);
  for (const issue of [...report.trackedLocalOnly, ...report.unignoredLocalOnly, ...report.requiresUserReview, ...report.projectIgnoredConflicts].slice(0, 12)) {
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

import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  auditLocalOnlyVcs,
  cleanupLocalOnlyVcs,
  computeLocalOnlyEntries,
  resolveLocalVcsPolicy,
  syncLocalVcsBoundary,
} from "../../src/cli/vcs/local-only";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function tempRepo(prefix: string): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  return repo;
}

function git(repo: string, args: string[]) {
  return spawnSync("git", ["-C", repo, ...args], { encoding: "utf-8" });
}

describe("local-only VCS boundary", () => {
  test("project-scoped defaults use project-local-install profile", () => {
    const repo = tempRepo("repo-harness-vcs-profile-default-");
    try {
      const policy = resolveLocalVcsPolicy(repo, { projectScoped: true });
      expect(policy.profileName).toBe("project-local-install");
      expect(policy.installStateScope).toBe("local");
      expect(policy.workflowStateScope).toBe("local");
      expect(policy.productIntentScope).toBe("tracked");
      const entries = computeLocalOnlyEntries(policy).map((entry) => entry.path);
      expect(entries).toContain(".mcp.json");
      expect(entries).toContain("AGENTS.md");
      expect(entries).not.toContain("docs/spec.md");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("legacy scope local maps to project-local-install instead of all-local", () => {
    const repo = tempRepo("repo-harness-vcs-profile-legacy-");
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(
        join(repo, ".ai", "harness", "policy.json"),
        JSON.stringify({
          vcs: {
            scope: "local",
            install_state_scope: "local",
            workflow_state_scope: "local",
            product_intent_scope: "local",
          },
        }, null, 2),
      );
      const policy = resolveLocalVcsPolicy(repo);
      expect(policy.profileName).toBe("project-local-install");
      expect(policy.installStateScope).toBe("local");
      expect(policy.workflowStateScope).toBe("local");
      expect(policy.productIntentScope).toBe("tracked");
      expect(computeLocalOnlyEntries(policy).map((entry) => entry.path)).not.toContain("docs/spec.md");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("profiles and tracked whitelist shape local-only entries", () => {
    const repo = tempRepo("repo-harness-vcs-profile-whitelist-");
    try {
      let policy = resolveLocalVcsPolicy(repo, { vcsProfile: "ephemeral-agent-workspace" });
      expect(policy.installStateScope).toBe("local");
      expect(policy.workflowStateScope).toBe("local");
      expect(policy.productIntentScope).toBe("local");
      const ephemeralEntries = computeLocalOnlyEntries(policy).map((entry) => entry.path);
      expect(ephemeralEntries).toContain(".agents/");
      expect(ephemeralEntries).toContain(".claude/");
      expect(ephemeralEntries).toContain("docs/");
      expect(ephemeralEntries).toContain("docs/spec.md");
      expect(ephemeralEntries).toContain("skills-lock.json");

      policy = resolveLocalVcsPolicy(repo, { projectScoped: true });
      const projectLocalEntries = computeLocalOnlyEntries(policy).map((entry) => entry.path);
      expect(projectLocalEntries).not.toContain(".agents/");
      expect(projectLocalEntries).not.toContain(".claude/");
      expect(projectLocalEntries).not.toContain("docs/");
      expect(projectLocalEntries).not.toContain("skills-lock.json");

      policy = resolveLocalVcsPolicy(repo, { vcsProfile: "tracked-governance" });
      expect(policy.installStateScope).toBe("local");
      expect(policy.workflowStateScope).toBe("tracked");
      expect(policy.productIntentScope).toBe("tracked");
      expect(computeLocalOnlyEntries(policy).map((entry) => entry.path)).toContain(".mcp.json");
      expect(computeLocalOnlyEntries(policy).map((entry) => entry.path)).not.toContain("AGENTS.md");

      policy = resolveLocalVcsPolicy(repo, { vcsScope: "tracked" });
      expect(policy.profileName).toBe("self-host");
      expect(computeLocalOnlyEntries(policy)).toEqual([]);

      policy = resolveLocalVcsPolicy(repo, {
        projectScoped: true,
        trackedWhitelist: ["AGENTS.md", "tasks/"],
      });
      const entries = computeLocalOnlyEntries(policy).map((entry) => entry.path);
      expect(entries).not.toContain("AGENTS.md");
      expect(entries).not.toContain("tasks/");
      expect(entries).toContain(".mcp.json");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("explicit profile and scope override persisted policy group scopes", () => {
    const repo = tempRepo("repo-harness-vcs-profile-overrides-policy-");
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(
        join(repo, ".ai", "harness", "policy.json"),
        JSON.stringify({
          vcs: {
            scope: "local",
            profile: "project-local-install",
            install_state_scope: "local",
            workflow_state_scope: "local",
            product_intent_scope: "tracked",
          },
        }, null, 2),
      );

      let policy = resolveLocalVcsPolicy(repo, { vcsProfile: "self-host" });
      expect(policy.profileName).toBe("self-host");
      expect(policy.installStateScope).toBe("tracked");
      expect(policy.workflowStateScope).toBe("tracked");
      expect(policy.productIntentScope).toBe("tracked");
      expect(computeLocalOnlyEntries(policy)).toEqual([]);

      policy = resolveLocalVcsPolicy(repo, { vcsProfile: "ephemeral-agent-workspace" });
      expect(policy.profileName).toBe("ephemeral-agent-workspace");
      expect(policy.installStateScope).toBe("local");
      expect(policy.workflowStateScope).toBe("local");
      expect(policy.productIntentScope).toBe("local");
      expect(computeLocalOnlyEntries(policy).map((entry) => entry.path)).toContain("docs/spec.md");

      policy = resolveLocalVcsPolicy(repo, { vcsScope: "tracked" });
      expect(policy.profileName).toBe("self-host");
      expect(policy.installStateScope).toBe("tracked");
      expect(policy.workflowStateScope).toBe("tracked");
      expect(policy.productIntentScope).toBe("tracked");

      policy = resolveLocalVcsPolicy(repo, { vcsScope: "local" });
      expect(policy.profileName).toBe("project-local-install");
      expect(policy.installStateScope).toBe("local");
      expect(policy.workflowStateScope).toBe("local");
      expect(policy.productIntentScope).toBe("tracked");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("root gitignore wins over tracked whitelist", () => {
    const repo = tempRepo("repo-harness-vcs-root-gitignore-");
    try {
      writeFileSync(join(repo, ".gitignore"), "AGENTS.md\n");
      writeFileSync(join(repo, "AGENTS.md"), "# agents\n");
      const audit = auditLocalOnlyVcs(repo, {
        projectScoped: true,
        trackedWhitelist: ["AGENTS.md"],
      });
      expect(audit.projectIgnoredConflicts.map((issue) => issue.path)).toContain("AGENTS.md");
      expect(audit.projectIgnoredConflicts[0].reason).toContain("tracked_whitelist");
      expect(audit.safeToCommit).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("root gitignore reports ignored tracked children under local workflow dirs", () => {
    const repo = tempRepo("repo-harness-vcs-root-gitignore-dir-");
    try {
      mkdirSync(join(repo, "plans"), { recursive: true });
      writeFileSync(join(repo, ".gitignore"), "plans/\n");
      writeFileSync(join(repo, "plans", "example.md"), "# plan\n");
      expect(git(repo, ["add", "-f", "plans/example.md"]).status).toBe(0);

      const audit = auditLocalOnlyVcs(repo, { projectScoped: true });
      expect(audit.projectIgnoredConflicts.map((issue) => issue.path)).toContain("plans/example.md");
      expect(audit.projectIgnoredConflicts[0].reason).toContain("tracked local-only path");
      expect(audit.safeToCommit).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("local overlay ignores codex hooks even when root .gitignore negates it", () => {
    const repo = tempRepo("repo-harness-vcs-overlay-");
    try {
      mkdirSync(join(repo, ".codex"), { recursive: true });
      writeFileSync(join(repo, ".gitignore"), ".codex/*\n!.codex/hooks.json\n");
      writeFileSync(join(repo, ".codex", "hooks.json"), "{}\n");

      expect(git(repo, ["check-ignore", "-q", "--", ".codex/hooks.json"]).status).toBe(1);
      const synced = syncLocalVcsBoundary(repo, { vcsScope: "local", projectScoped: true, apply: true });

      expect(synced.skipped).toBe(false);
      expect(existsSync(join(repo, ".git", "info", "exclude"))).toBe(true);
      expect(readFileSync(join(repo, ".codex", ".gitignore"), "utf-8")).toContain("hooks.json");
      expect(git(repo, ["check-ignore", "-q", "--", ".codex/hooks.json"]).status).toBe(0);
      const status = git(repo, ["status", "--short", "--ignored", "--untracked-files=all"]);
      expect(status.stdout).not.toContain("?? .codex/hooks.json");
      expect(status.stdout).toContain("!! .codex/hooks.json");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("ephemeral profile ignores governance dirs, product docs, and skills lock", () => {
    const repo = tempRepo("repo-harness-vcs-ephemeral-broad-local-");
    try {
      const trackedPaths = [
        ".agents/skills/codex-review/SKILL.md",
        ".claude/CLAUDE.md",
        ".claude/skills/check/SKILL.md",
        "docs/spec.md",
        "docs/architecture/overview.md",
        "skills-lock.json",
      ];
      for (const rel of trackedPaths) {
        mkdirSync(join(repo, ...rel.split("/").slice(0, -1)), { recursive: true });
        writeFileSync(join(repo, ...rel.split("/")), `${rel}\n`);
      }
      expect(git(repo, ["add", ...trackedPaths]).status).toBe(0);

      const synced = syncLocalVcsBoundary(repo, {
        vcsProfile: "ephemeral-agent-workspace",
        projectScoped: true,
        apply: true,
      });
      expect(synced.overlays).toEqual(expect.arrayContaining([
        ".agents/.gitignore",
        ".claude/.gitignore",
        "docs/.gitignore",
      ]));
      expect(readFileSync(join(repo, ".agents", ".gitignore"), "utf-8")).toContain("*");
      expect(readFileSync(join(repo, ".claude", ".gitignore"), "utf-8")).toContain("*");
      expect(readFileSync(join(repo, "docs", ".gitignore"), "utf-8")).toContain("*");

      const audit = auditLocalOnlyVcs(repo, { vcsProfile: "ephemeral-agent-workspace" });
      const trackedLocalOnly = audit.trackedLocalOnly.map((issue) => issue.path);
      const review = audit.requiresUserReview.map((issue) => issue.path);
      expect(trackedLocalOnly).toEqual(expect.arrayContaining(trackedPaths));
      expect(review).toEqual(expect.arrayContaining(trackedPaths));
      expect(git(repo, ["check-ignore", "-q", "--no-index", "--", ".agents/skills/codex-review/SKILL.md"]).status).toBe(0);
      expect(git(repo, ["check-ignore", "-q", "--no-index", "--", ".claude/skills/check/SKILL.md"]).status).toBe(0);
      expect(git(repo, ["check-ignore", "-q", "--no-index", "--", "docs/spec.md"]).status).toBe(0);
      expect(git(repo, ["check-ignore", "-q", "--no-index", "--", "skills-lock.json"]).status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("cleanup removes safe managed files from the index but leaves files on disk", () => {
    const repo = tempRepo("repo-harness-vcs-cleanup-");
    try {
      const rel = ".ai/harness/bin/local-repo-harness";
      const file = join(repo, ".ai", "harness", "bin", "local-repo-harness");
      mkdirSync(join(repo, ".ai", "harness", "bin"), { recursive: true });
      writeFileSync(file, "#!/bin/bash\nexit 0\n");
      expect(git(repo, ["add", rel]).status).toBe(0);

      syncLocalVcsBoundary(repo, { vcsScope: "local", projectScoped: true, apply: true });
      const audit = auditLocalOnlyVcs(repo, { vcsScope: "local" });
      expect(audit.trackedLocalOnly.map((issue) => issue.path)).toContain(rel);

      const dryRun = cleanupLocalOnlyVcs(repo, { vcsScope: "local", apply: false });
      expect(dryRun.commands.length).toBe(1);
      expect(git(repo, ["ls-files", "--", rel]).stdout.trim()).toBe(rel);

      const applied = cleanupLocalOnlyVcs(repo, { vcsScope: "local", apply: true });
      expect(applied.removedFromIndex).toContain(rel);
      expect(git(repo, ["ls-files", "--", rel]).stdout.trim()).toBe("");
      expect(existsSync(file)).toBe(true);
      expect(auditLocalOnlyVcs(repo, { vcsScope: "local" }).safeToCommit).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("user-authored helper scripts require review instead of automatic cleanup", () => {
    const repo = tempRepo("repo-harness-vcs-review-");
    try {
      const rel = "scripts/check-task-workflow.sh";
      const file = join(repo, "scripts", "check-task-workflow.sh");
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(file, "#!/bin/bash\necho user-authored\n");
      expect(git(repo, ["add", rel]).status).toBe(0);

      syncLocalVcsBoundary(repo, { vcsScope: "local", projectScoped: true, apply: true });
      const audit = auditLocalOnlyVcs(repo, { vcsScope: "local" });
      expect(audit.requiresUserReview.map((issue) => issue.path)).toContain(rel);

      const applied = cleanupLocalOnlyVcs(repo, { vcsScope: "local", apply: true });
      expect(applied.removedFromIndex).not.toContain(rel);
      expect(git(repo, ["ls-files", "--", rel]).stdout.trim()).toBe(rel);
      expect(existsSync(file)).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("cleanup still removes safe files when other files require review", () => {
    const repo = tempRepo("repo-harness-vcs-partial-cleanup-");
    try {
      const safeRel = ".mcp.json";
      const reviewRel = "scripts/check-task-workflow.sh";
      const safeFile = join(repo, safeRel);
      const reviewFile = join(repo, "scripts", "check-task-workflow.sh");
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(safeFile, "{}\n");
      writeFileSync(reviewFile, "#!/bin/bash\necho user-authored\n");
      expect(git(repo, ["add", safeRel, reviewRel]).status).toBe(0);

      syncLocalVcsBoundary(repo, { vcsScope: "local", projectScoped: true, apply: true });
      const audit = auditLocalOnlyVcs(repo, { vcsScope: "local" });
      expect(audit.trackedLocalOnly.map((issue) => issue.path)).toContain(safeRel);
      expect(audit.requiresUserReview.map((issue) => issue.path)).toContain(reviewRel);

      const applied = cleanupLocalOnlyVcs(repo, { vcsScope: "local", apply: true });
      expect(applied.removedFromIndex).toContain(safeRel);
      expect(applied.removedFromIndex).not.toContain(reviewRel);
      expect(git(repo, ["ls-files", "--", safeRel]).stdout.trim()).toBe("");
      expect(git(repo, ["ls-files", "--", reviewRel]).stdout.trim()).toBe(reviewRel);
      expect(existsSync(safeFile)).toBe(true);
      expect(existsSync(reviewFile)).toBe(true);
      expect(applied.safeToCommit).toBe(false);
      expect(applied.requiresUserReview.map((issue) => issue.path)).toContain(reviewRel);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("cleanup does not auto-untrack broad workflow or product intent paths", () => {
    const repo = tempRepo("repo-harness-vcs-review-workflow-product-");
    try {
      const paths = [
        "AGENTS.md",
        "tasks/todos.md",
        "plans/example.md",
        "docs/spec.md",
      ];
      mkdirSync(join(repo, "tasks"), { recursive: true });
      mkdirSync(join(repo, "plans"), { recursive: true });
      mkdirSync(join(repo, "docs"), { recursive: true });
      for (const rel of paths) writeFileSync(join(repo, ...rel.split("/")), `${rel}\n`);
      expect(git(repo, ["add", ...paths]).status).toBe(0);

      syncLocalVcsBoundary(repo, { vcsProfile: "ephemeral-agent-workspace", projectScoped: true, apply: true });
      const audit = auditLocalOnlyVcs(repo, { vcsProfile: "ephemeral-agent-workspace" });
      expect(audit.requiresUserReview.map((issue) => issue.path)).toEqual(expect.arrayContaining(paths));

      const applied = cleanupLocalOnlyVcs(repo, { vcsProfile: "ephemeral-agent-workspace", apply: true });
      for (const rel of paths) {
        expect(applied.removedFromIndex).not.toContain(rel);
        expect(git(repo, ["ls-files", "--", rel]).stdout.trim()).toBe(rel);
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("tracked whitelist keeps workflow paths out of local-only findings", () => {
    const repo = tempRepo("repo-harness-vcs-tracked-whitelist-");
    try {
      mkdirSync(join(repo, "tasks"), { recursive: true });
      writeFileSync(join(repo, "AGENTS.md"), "# agents\n");
      writeFileSync(join(repo, "tasks", "todos.md"), "# todos\n");
      expect(git(repo, ["add", "AGENTS.md", "tasks/todos.md"]).status).toBe(0);

      syncLocalVcsBoundary(repo, {
        projectScoped: true,
        trackedWhitelist: ["AGENTS.md", "tasks/"],
        apply: true,
      });
      const audit = auditLocalOnlyVcs(repo, {
        projectScoped: true,
        trackedWhitelist: ["AGENTS.md", "tasks/"],
      });
      expect(audit.trackedLocalOnly.map((issue) => issue.path)).not.toContain("AGENTS.md");
      expect(audit.trackedLocalOnly.map((issue) => issue.path)).not.toContain("tasks/todos.md");
      expect(audit.requiresUserReview.map((issue) => issue.path)).not.toContain("AGENTS.md");
      expect(audit.requiresUserReview.map((issue) => issue.path)).not.toContain("tasks/todos.md");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("CLI vcs audit and cleanup expose JSON reports", () => {
    const repo = tempRepo("repo-harness-vcs-cli-");
    try {
      const rel = ".mcp.json";
      writeFileSync(join(repo, rel), "{}\n");
      expect(git(repo, ["add", rel]).status).toBe(0);
      syncLocalVcsBoundary(repo, { vcsScope: "local", projectScoped: true, apply: true });

      const audit = spawnSync("bun", [CLI, "vcs", "audit", "--repo", repo, "--vcs-scope", "local", "--json"], {
        cwd: ROOT,
        encoding: "utf-8",
      });
      expect(audit.status).toBe(1);
      const auditJson = JSON.parse(audit.stdout);
      expect(auditJson.policy.profileName).toBe("project-local-install");
      expect(auditJson.policy.productIntentScope).toBe("tracked");
      expect(Array.isArray(auditJson.projectIgnoredConflicts)).toBe(true);
      expect(auditJson.trackedLocalOnly[0].path).toBe(rel);

      const cleanup = spawnSync("bun", [CLI, "vcs", "cleanup", "--repo", repo, "--vcs-scope", "local", "--apply", "--json"], {
        cwd: ROOT,
        encoding: "utf-8",
      });
      expect(cleanup.status).toBe(0);
      expect(JSON.parse(cleanup.stdout).safeToCommit).toBe(true);
      expect(existsSync(join(repo, rel))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  auditLocalOnlyVcs,
  cleanupLocalOnlyVcs,
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
      expect(JSON.parse(audit.stdout).trackedLocalOnly[0].path).toBe(rel);

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

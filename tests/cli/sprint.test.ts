import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function writeActiveSprintFixture(cwd: string, sprintRelPath: string): void {
  mkdirSync(join(cwd, "plans/sprints"), { recursive: true });
  mkdirSync(join(cwd, ".ai/harness/sprint"), { recursive: true });
  writeFileSync(
    join(cwd, sprintRelPath),
    [
      "# Sprint: CLI Fixture Sprint",
      "",
      "> **Status**: Approved",
      "> **Slug**: cli-fixture-sprint",
      "> **Created**: 2026-06-18 00:00",
      "> **Updated**: 2026-06-18 00:00",
      "> **Source Spec**: `docs/spec.md`",
      "> **Goal Mode**: incremental",
      "",
      "## PRD",
      "",
      "Real problem statement with concrete user outcomes.",
      "",
      "## Backlog",
      "",
      "| # | Status | Task | Mode | Acceptance | Plan |",
      "|---|--------|------|------|------------|------|",
      "| 1 | [ ] | docs-row | inline | docs check passes | (pending) |",
      "",
      "## Execution Log",
      "",
      "| When | Task | Plan | Result |",
      "|------|------|------|--------|",
      "",
    ].join("\n")
  );
  writeFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), sprintRelPath);
}

describe("sprint command", () => {
  test("reports next row as JSON through packaged helper dispatch", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-cli-sprint-next-"));
    try {
      expect(spawnSync("git", ["init", "-q"], { cwd: tmp }).status).toBe(0);
      const sprintPath = "plans/sprints/20260618-0000-cli-fixture.sprint.md";
      writeActiveSprintFixture(tmp, sprintPath);

      const res = spawnSync("bun", [CLI, "sprint", "next", "--json"], {
        cwd: tmp,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.sprintFile).toBe(sprintPath);
      expect(parsed.task).toBe("docs-row");
      expect(parsed.nextAction).toContain("execute-approved");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("executes an approved inline row through packaged helper dispatch", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-cli-sprint-execute-"));
    try {
      expect(spawnSync("git", ["init", "-q"], { cwd: tmp }).status).toBe(0);
      const sprintPath = "plans/sprints/20260618-0000-cli-fixture.sprint.md";
      writeActiveSprintFixture(tmp, sprintPath);
      const bodyFile = join(tmp, "approved-plan.md");
      writeFileSync(
        bodyFile,
        [
          "# Approved plan",
          "",
          "## Evidence Contract",
          "",
          "- **State/progress path**: tasks/notes/docs-row.notes.md",
          "- **Verification evidence**: .ai/harness/checks/latest.json and docs check",
          "- **Evaluator rubric**: review file records Status: Reviewed and Recommendation: pass",
          "- **Stop condition**: docs check fails",
          "- **Rollback surface**: revert generated workflow artifacts",
          "",
          "## Task Breakdown",
          "",
          "- [ ] Update docs",
        ].join("\n")
      );

      const res = spawnSync("bun", [CLI, "sprint", "execute-approved", "--body-file", bodyFile, "--json"], {
        cwd: tmp,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.task).toBe("docs-row");
      expect(parsed.mode).toBe("inline");
      expect(parsed.worktreePath).toBe("");
      expect(existsSync(join(tmp, parsed.planFile))).toBe(true);
      expect(existsSync(join(tmp, parsed.contractFile))).toBe(true);
      expect(readFileSync(join(tmp, parsed.planFile), "utf-8")).toContain(`> **Source Ref**: sprint:${sprintPath}#docs-row`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

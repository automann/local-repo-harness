import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

describe("workflow-state shared library", () => {
  test("exports the shared workflow helper functions", () => {
    const content = readFileSync(
      join(ROOT, "assets/hooks/lib/workflow-state.sh"),
      "utf-8"
    );

    expect(content).toContain("is_git_repo()");
    expect(content).toContain("load_changed_paths()");
    expect(content).toContain("has_changes()");
    expect(content).toContain("has_changes_glob()");
    expect(content).toContain("get_active_plan()");
    expect(content).toContain("derive_contract_path()");
    expect(content).toContain("workflow_todo_total()");
    expect(content).toContain("workflow_todo_done()");
    expect(content).toContain("workflow_plan_task_state()");
    expect(content).toContain("workflow_next_action()");
    expect(content).toContain("workflow_cleanup_candidate()");
    expect(content).toContain("workflow_sync_task_state_from_todo()");
    expect(content).toContain("has_research_for_new_plan()");
    expect(content).toContain("validate_plan_transition()");
    expect(content).toContain("contract_references_path()");
    expect(content).toContain("next_action=\"$(workflow_next_action)\"");
    expect(content).toContain("## Task Breakdown");
  });

  test("verify-sprint helper should use the shared terminal review gate", () => {
    const helper = readFileSync(
      join(ROOT, "assets", "templates", "helpers", "verify-sprint.sh"),
      "utf-8"
    );

    expect(helper).toContain("workflow_review_terminal_pass_status");
    expect(helper).toContain("metadata_status");
    expect(helper).not.toContain("review recommends pass");
  });

  test("external acceptance parser enforces reviewer, source, blockers, and manual override", () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "workflow-external-acceptance-")));
    try {
      writeFileSync(
        join(cwd, "pass.review.md"),
        [
          "# Sprint Review: demo",
          "",
          "> **Status**: Reviewed",
          "> **Recommendation**: pass",
          "",
          "## External Acceptance Advice",
          "",
          "> **External Acceptance**: pass",
          "> **External Reviewer**: Claude",
          "> **External Source**: claude-review",
          "> **External Started**: 2026-03-04T14:05:00+0800",
          "> **External Completed**: 2026-03-04T14:06:00+0800",
          "",
          "- P1 blockers: none",
          "- P2 advisories: none",
          "- Acceptance checklist: pass",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "blocker.review.md"),
        readFileSync(join(cwd, "pass.review.md"), "utf-8").replace("- P1 blockers: none", "- P1 blockers: release regression")
      );
      writeFileSync(
        join(cwd, "override.review.md"),
        [
          "# Sprint Review: demo",
          "",
          "> **Status**: Reviewed",
          "> **Recommendation**: pass",
          "",
          "## External Acceptance Advice",
          "",
          "> **External Acceptance**: manual_override",
          "> **External Reviewer**:",
          "> **External Source**: manual-override",
          "",
          "- P1 blockers: none",
          "Manual Override: peer CLI auth is down; local reproduction and checks cover the acceptance surface",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "bad-override.review.md"),
        readFileSync(join(cwd, "override.review.md"), "utf-8").replace("- P1 blockers: none", "- P1 blockers: release regression")
      );
      writeFileSync(
        join(cwd, "implicit-override.review.md"),
        readFileSync(join(cwd, "override.review.md"), "utf-8").replace("> **External Acceptance**: manual_override", "> **External Acceptance**: unavailable")
      );
      writeFileSync(
        join(cwd, "placeholder-override.review.md"),
        readFileSync(join(cwd, "override.review.md"), "utf-8").replace(
          "Manual Override: peer CLI auth is down; local reproduction and checks cover the acceptance surface",
          "Manual Override: n/a"
        )
      );

      const res = spawnSync(
        "bash",
        [
          "-lc",
          [
            'source "$WORKFLOW_STATE"',
            'HOOK_HOST=codex workflow_external_acceptance_status "$PWD/pass.review.md"',
            'HOOK_HOST=codex workflow_external_acceptance_status "$PWD/blocker.review.md"',
            'HOOK_HOST=codex workflow_external_acceptance_status "$PWD/override.review.md"',
            'HOOK_HOST=codex workflow_external_acceptance_status "$PWD/bad-override.review.md"',
            'HOOK_HOST=codex workflow_external_acceptance_status "$PWD/implicit-override.review.md"',
            'HOOK_HOST=codex workflow_external_acceptance_status "$PWD/placeholder-override.review.md"',
          ].join("\n"),
        ],
        {
          cwd,
          encoding: "utf-8",
          env: {
            ...process.env,
            WORKFLOW_STATE: join(ROOT, "assets/hooks/lib/workflow-state.sh"),
          },
        }
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("pass\tClaude\tclaude-review\tExternal acceptance passed.");
      expect(res.stdout).toContain("fail\tClaude\tclaude-review\tExternal acceptance has P1 blockers: release regression");
      expect(res.stdout).toContain("manual_override\t-\tmanual-override\tManual override recorded for external acceptance");
      expect(res.stdout).toContain("fail\t-\tmanual-override\tManual override requires P1 blockers: none; got release regression.");
      expect(res.stdout).toContain("fail\t-\tmanual-override\tManual Override requires External Acceptance: manual_override.");
      expect(res.stdout).toContain("fail\t-\tmanual-override\tManual override requires a concrete non-placeholder reason.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

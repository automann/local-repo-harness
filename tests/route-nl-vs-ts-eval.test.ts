import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  buildRouteReport,
  buildScenarioPack,
  expectedNlDecisions,
  ROUTE_SCENARIOS,
  runTsArm,
  validateReport,
  writeRouteReport,
} from "../scripts/route-nl-vs-ts-eval";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/route-nl-vs-ts-eval.ts");

function tempPath(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

describe("route-nl-vs-ts eval", () => {
  test("scenario pack hides expected answers but includes historical route regressions", () => {
    const pack = buildScenarioPack();
    const serialized = JSON.stringify(pack);

    expect(pack.protocol).toBe("route-nl-vs-ts/scenarios/v1");
    expect(pack.scenarios.length).toBeGreaterThanOrEqual(3);
    expect(serialized).toContain("done-future-wording");
    expect(serialized).toContain("review-hook-bug-mention");
    expect(serialized).toContain("strip-injected-context");
    expect(serialized).not.toContain("expected_action");
  });

  test("TS arm matches the current expected route table", () => {
    for (const scenario of ROUTE_SCENARIOS) {
      const verdict = runTsArm(scenario);
      expect(verdict.intent, scenario.id).toBe(scenario.expected.intent);
      expect(verdict.action, scenario.id).toBe(scenario.expected.action);
    }
  });

  test("matching NL decisions produce a go report with compliance and token metrics", () => {
    const report = buildRouteReport({
      agent: "unit",
      decisions: expectedNlDecisions(),
      now: new Date("2026-06-12T00:00:00Z"),
    });

    validateReport(report);
    expect(report.arms.ts_verdict.compliance_rate).toBe(1);
    expect(report.arms.nl_decision_table.compliance_rate).toBe(1);
    expect(report.arms.nl_decision_table.false_positive_count).toBe(0);
    expect(report.arms.nl_decision_table.false_negative_count).toBe(0);
    expect(report.token_metrics.estimated_token_delta_per_prompt).toBeGreaterThan(0);
    expect(report.go_no_go.recommendation).toBe("go");
  });

  test("NL arm mismatches are recorded as no-go evidence", () => {
    const decisions = expectedNlDecisions();
    decisions[0] = {
      ...decisions[0],
      action: "done_gate",
      rationale: "intentional bad route for regression coverage",
    };
    decisions[3] = {
      ...decisions[3],
      action: "allow",
      rationale: "intentional missing block/advice for regression coverage",
    };

    const report = buildRouteReport({
      agent: "unit",
      decisions,
      now: new Date("2026-06-12T00:00:00Z"),
    });

    validateReport(report);
    expect(report.arms.nl_decision_table.compliance_rate).toBeLessThan(1);
    expect(report.arms.nl_decision_table.false_positive_count).toBe(1);
    expect(report.arms.nl_decision_table.false_negative_count).toBe(1);
    expect(report.go_no_go.recommendation).toBe("no-go");
  });

  test("CLI writes and validates a route report", () => {
    const cwd = tempPath("route-nl-vs-ts");
    try {
      const decisionsPath = join(cwd, "decisions.json");
      const reportPath = join(cwd, ".ai/harness/runs/route-nl-vs-ts-report.json");
      writeFileSync(
        decisionsPath,
        `${JSON.stringify({ decisions: expectedNlDecisions() }, null, 2)}\n`,
        "utf-8",
      );

      const run = spawnSync(
        process.execPath,
        [SCRIPT, "--agent", "unit", "--decisions", decisionsPath, "--out", reportPath],
        { cwd, encoding: "utf-8" },
      );

      expect(run.status).toBe(0);
      expect(run.stdout).toContain("route-nl-vs-ts");
      expect(run.stdout).toContain("go_no_go=go");
      expect(existsSync(reportPath)).toBe(true);

      const check = spawnSync(process.execPath, [SCRIPT, "--check-report", reportPath], {
        cwd,
        encoding: "utf-8",
      });
      expect(check.status).toBe(0);
      expect(check.stdout).toContain("nl_compliance=100.0%");

      const report = JSON.parse(readFileSync(reportPath, "utf-8"));
      validateReport(report);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("writeRouteReport creates parent directories", () => {
    const cwd = tempPath("route-nl-vs-ts-write");
    try {
      const reportPath = join(cwd, ".ai/harness/runs/route-nl-vs-ts-report.json");
      writeRouteReport(
        reportPath,
        buildRouteReport({
          agent: "unit",
          decisions: expectedNlDecisions(),
          now: new Date("2026-06-12T00:00:00Z"),
        }),
      );
      expect(existsSync(reportPath)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

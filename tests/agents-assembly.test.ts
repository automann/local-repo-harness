import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import {
  assembleTemplate,
  getPartials,
  parseTarget,
} from "../scripts/assemble-template";

const ROOT = join(import.meta.dir, "..");

function collectMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("AGENTS Target Assembly", () => {
  test("should read agents partials in correct order", () => {
    const partials = getPartials("agents");
    expect(partials.length).toBeGreaterThanOrEqual(8);

    for (let i = 1; i < partials.length; i++) {
      expect(partials[i].order).toBeGreaterThan(partials[i - 1].order);
    }
  });

  test("should include required AGENTS sections", () => {
    const output = assembleTemplate({
      target: "agents",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    expect(output).toContain("## Operating Mode");
    expect(output).toContain("## Workflow Orchestration");
    expect(output).toContain("## Task Management Protocol");
    expect(output).toContain("## Coding Constraints");
    expect(output).toContain("## Quality & Safety");
    expect(output).toContain("## Deep Docs Index");
    expect(output).toContain("### First Principles");
    expect(output).toContain("### Single Source of Truth");
    expect(output).toContain("Self-Improvement Loop");
    expect(output).toContain("tasks/todos.md");
    expect(output).toContain("tasks/lessons.md");
    expect(output).toContain("sync tasks/");
    expect(output).toContain("Default to **Plan-only**.");
    expect(output).toContain("Runtime profile: Plan-only (recommended).");
    expect(output).toContain("Recovery profile: `hybrid`.");
    expect(output).toContain("State profile: `file-backed`.");
    expect(output).toContain("Context profile: `stable-root-progressive-subdir`.");
    expect(output).toContain("Codex runtime expectation: `sandbox_mode=platform-default, approval_policy=on-failure`.");
    expect(output).toContain(".claude/.require-worktree");
    expect(output).toContain(".ai/harness/policy.json");
    expect(output).toContain(".ai/context/context-map.json");
    expect(output).toContain("Agentic skill routing");
    expect(output).toContain("gstack `plan-eng-review`");
    expect(output).toContain("Waza `/think`, `/hunt`, `/check`");
    expect(output).toContain(".ai/harness/active-plan as authoritative only for this worktree");
    expect(output).toContain("new-spec.sh");
    expect(output).toContain("new-sprint.sh");
    expect(output).toContain("The main agent decides whether to spawn based on task breadth");
    expect(output).toContain("Do not ask the user for spawn confirmation");
    expect(output).toContain("bash scripts/check-task-sync.sh");
    expect(output).toContain("bash scripts/check-task-workflow.sh --strict");
    expect(output).toContain("bash scripts/verify-contract.sh --contract <active-plan-contract> --strict");
    expect(output).toContain("Which workflow artifacts were updated");
  });

  test("should preserve core governance semantics between CLAUDE and AGENTS", () => {
    const claude = assembleTemplate({
      target: "claude",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    const agents = assembleTemplate({
      target: "agents",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    expect(claude.toLowerCase()).toContain("verification");
    expect(agents.toLowerCase()).toContain("verification");
    expect(claude.toLowerCase()).toContain("plan");
    expect(agents.toLowerCase()).toContain("plan");
    expect(claude.toLowerCase()).toContain("product truth");
    expect(agents.toLowerCase()).toContain("product truth");
    expect(claude.toLowerCase()).toContain("execution truth");
    expect(agents.toLowerCase()).toContain("single source of truth");
    expect(claude).toContain("RECOVERY: hybrid");
    expect(agents).toContain("Recovery profile: `hybrid`.");
    expect(claude).toContain("gstack `plan-eng-review`");
    expect(agents).toContain("gstack `plan-eng-review`");
  });

  test("should render cloudflare section for both targets when enabled by plan", () => {
    const claude = assembleTemplate({
      target: "claude",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    const agents = assembleTemplate({
      target: "agents",
      planType: "C",
      variables: { PROJECT_NAME: "TestProject" },
    });

    expect(claude).toContain("Cloudflare Deployment");
    expect(agents).toContain("Cloudflare Deployment Notes");
  });

  test("should omit cloudflare section for both targets when excluded by plan", () => {
    const claude = assembleTemplate({
      target: "claude",
      planType: "F",
      variables: { PROJECT_NAME: "TestProject" },
    });

    const agents = assembleTemplate({
      target: "agents",
      planType: "F",
      variables: { PROJECT_NAME: "TestProject" },
    });

    expect(claude).not.toContain("Cloudflare Deployment");
    expect(agents).not.toContain("Cloudflare Deployment Notes");
  });

  test("should reject invalid target values", () => {
    expect(() => parseTarget("invalid-target")).toThrow("Invalid target");
  });

  test("project-scoped docs do not advertise reclaimed helper paths", () => {
    const files = [
      join(ROOT, "AGENTS.md"),
      join(ROOT, "CLAUDE.md"),
      ...collectMarkdownFiles(join(ROOT, ".claude", "templates")),
      ...collectMarkdownFiles(join(ROOT, "assets", "partials")),
      ...collectMarkdownFiles(join(ROOT, "assets", "partials-agents")),
      ...collectMarkdownFiles(join(ROOT, "assets", "skill-commands")),
      ...collectMarkdownFiles(join(ROOT, "docs", "reference-configs")),
      ...collectMarkdownFiles(join(ROOT, "assets", "reference-configs")),
    ];

    const offenders = files.flatMap((file) => {
      return readFileSync(file, "utf-8")
        .split("\n")
        .map((line, index) => ({ line, index: index + 1 }))
        .filter(({ line }) => /bash \.ai\/harness\/scripts\//.test(line))
        .map(({ line, index }) => `${relative(ROOT, file)}:${index}: ${line.trim()}`);
    });

    expect(offenders).toEqual([]);
  });
});

import { describe, test, expect } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

function tmpWorkspace(prefix: string): string {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-`));
  mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
  writeFileSync(
    join(cwd, ".ai/harness/policy.json"),
    JSON.stringify(
      {
        context_budget: {
          status_file: ".ai/harness/context-budget/latest.json",
          zones: { yellow: 0.55, orange: 0.7, red: 0.8 },
          fallback_model_windows: { "gpt-5.4": 1050000, "gpt-5.5": 258000 },
          fallback_tool_calls: { yellow: 30, orange: 40, red: 50 },
        },
      },
      null,
      2
    ) + "\n"
  );
  return cwd;
}

function runContextBudget(cwd: string, args: string[], env?: Record<string, string>) {
  const res = spawnSync("bun", [join(ROOT, "scripts/context-budget.ts"), "--format", "json", "--cwd", cwd, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  expect(res.status).toBe(0);
  return JSON.parse(res.stdout);
}

function writeRollout(path: string, events: unknown[]): void {
  writeFileSync(path, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
}

function hasSqlite3(): boolean {
  return spawnSync("bash", ["-lc", "command -v sqlite3 >/dev/null 2>&1"]).status === 0;
}

describe("context-budget helper", () => {
  test("uses rollout token_count as the primary context pressure signal", () => {
    const cwd = tmpWorkspace("context-budget-rollout");
    try {
      const rolloutPath = join(cwd, "rollout.jsonl");
      writeRollout(rolloutPath, [
        { payload: { type: "task_started", model: "gpt-5.5", reasoning_effort: "high", model_context_window: 258000 } },
        {
          payload: {
            type: "token_count",
            info: {
              last_token_usage: { total_tokens: 181000 },
              model_context_window: 258000,
            },
          },
        },
      ]);

      const result = runContextBudget(cwd, ["--transcript-path", rolloutPath, "--write-status"]);

      expect(result.source).toBe("rollout-token-count");
      expect(result.zone).toBe("orange");
      expect(result.model).toBe("gpt-5.5");
      expect(result.usageTokens).toBe(181000);
      expect(result.contextWindow).toBe(258000);
      expect(result.estimated).toBe(false);
      expect(result.handoffRecommended).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("falls back to state_5.sqlite thread tokens when rollout token_count is unavailable", () => {
    const cwd = tmpWorkspace("context-budget-sqlite");
    const codexHome = join(cwd, ".codex");
    try {
      if (!hasSqlite3()) return;
      mkdirSync(codexHome, { recursive: true });
      const dbPath = join(codexHome, "state_5.sqlite");
      const sql = [
        "create table threads (id text, cwd text, title text, tokens_used integer, git_branch text, rollout_path text, updated_at_ms integer, first_user_message text, model text, reasoning_effort text, archived integer);",
        `insert into threads values ('thread-a', '${cwd.replaceAll("'", "''")}', 'demo', 900000, 'main', '', 1, 'hello', 'gpt-5.4', 'medium', 0);`,
      ].join("\n");
      const sqlite = spawnSync("sqlite3", [dbPath], { input: sql, encoding: "utf-8" });
      expect(sqlite.status).toBe(0);

      const result = runContextBudget(cwd, ["--codex-home", codexHome]);

      expect(result.source).toBe("state-db-token-total");
      expect(result.zone).toBe("red");
      expect(result.threadId).toBe("thread-a");
      expect(result.usageTokens).toBe(900000);
      expect(result.contextWindow).toBe(1050000);
      expect(result.estimated).toBe(true);
      expect(result.stopRecommended).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("uses config window for unknown rollout model when token_count omits window", () => {
    const cwd = tmpWorkspace("context-budget-config-window");
    const codexHome = join(cwd, ".codex");
    try {
      mkdirSync(codexHome, { recursive: true });
      writeFileSync(join(codexHome, "config.toml"), "model_context_window = 1000\n");
      const rolloutPath = join(cwd, "rollout.jsonl");
      writeRollout(rolloutPath, [
        { payload: { type: "task_started", model: "custom-frontier", reasoning_effort: "xhigh" } },
        { payload: { type: "token_count", info: { last_token_usage: { total_tokens: 560 } } } },
      ]);

      const result = runContextBudget(cwd, ["--codex-home", codexHome, "--transcript-path", rolloutPath]);

      expect(result.source).toBe("rollout-token-count");
      expect(result.zone).toBe("yellow");
      expect(result.model).toBe("custom-frontier");
      expect(result.contextWindow).toBe(1000);
      expect(result.estimated).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("handles corrupt rollout lines and falls back to tool-count thresholds", () => {
    const cwd = tmpWorkspace("context-budget-corrupt-rollout");
    const codexHome = join(cwd, ".codex");
    try {
      mkdirSync(codexHome, { recursive: true });
      const rolloutPath = join(cwd, "rollout.jsonl");
      writeFileSync(rolloutPath, "{not json}\n{\"payload\":{\"type\":\"task_started\",\"model\":\"gpt-5.5\"}}\n");

      const result = runContextBudget(cwd, ["--codex-home", codexHome, "--transcript-path", rolloutPath, "--tool-count", "41"]);

      expect(result.source).toBe("tool-call-count");
      expect(result.zone).toBe("orange");
      expect(result.estimated).toBe(true);
      expect(result.handoffRecommended).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("keeps generated status output inside the repo when policy path is unsafe", () => {
    const cwd = tmpWorkspace("context-budget-safe-status");
    const outsideName = `${cwd.split("/").pop()}-outside.json`;
    const outsidePath = join(cwd, "..", outsideName);
    try {
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ context_budget: { status_file: `../${outsideName}` } }, null, 2) + "\n"
      );

      runContextBudget(cwd, ["--tool-count", "1", "--write-status"]);

      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(true);
      expect(existsSync(outsidePath)).toBe(false);
    } finally {
      rmSync(outsidePath, { force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("rejects policy status paths outside the harness surface", () => {
    const cwd = tmpWorkspace("context-budget-harness-surface");
    try {
      mkdirSync(join(cwd, ".git"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ context_budget: { status_file: ".git/config" } }, null, 2) + "\n"
      );

      runContextBudget(cwd, ["--tool-count", "1", "--write-status"]);

      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(true);
      expect(existsSync(join(cwd, ".git/config"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

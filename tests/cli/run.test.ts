import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { resolveHelper } from "../../src/cli/runtime/helper-runner";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

describe("run command", () => {
  test("passes unknown options through to the selected helper", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-cli-"));
    const helpers = join(tmp, "helpers");
    const logFile = join(tmp, "args.log");
    try {
      mkdirSync(helpers, { recursive: true });
      const helper = join(helpers, "echo-args.sh");
      writeFileSync(helper, `#!/bin/bash\nprintf '%s\\n' "$*" > "${logFile}"\n`);
      chmodSync(helper, 0o755);

      const res = spawnSync("bun", [CLI, "run", "echo-args", "--strict", "--flag", "value"], {
        cwd: tmp,
        encoding: "utf-8",
        env: {
          ...process.env,
          REPO_HARNESS_HELPER_SOURCE: helpers,
        },
      });

      expect(res.status).toBe(0);
      expect(readFileSync(logFile, "utf-8").trim()).toBe("--strict --flag value");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("passes helper-level help through to the selected helper", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-helper-help-"));
    const helpers = join(tmp, "helpers");
    try {
      mkdirSync(helpers, { recursive: true });
      const helper = join(helpers, "helpful.sh");
      writeFileSync(helper, `#!/bin/bash\nif [[ "$1" == "--help" ]]; then echo "Usage: helpful --flag"; exit 0; fi\nexit 1\n`);
      chmodSync(helper, 0o755);

      const res = spawnSync("bun", [CLI, "run", "helpful", "--help"], {
        cwd: tmp,
        encoding: "utf-8",
        env: {
          ...process.env,
          REPO_HARNESS_HELPER_SOURCE: helpers,
        },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Usage: helpful --flag");
      expect(res.stdout).not.toContain("Usage: local-repo-harness run");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("keeps run-level help available without a helper", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-help-"));
    try {
      const res = spawnSync("bun", [CLI, "run", "--help"], {
        cwd: tmp,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Run a bundled repo-harness workflow helper");
      expect(res.stdout).toContain("Helper id, for example check-task-workflow");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("passes the resolved target repo root to package-launched helpers", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-target-root-"));
    const repo = join(tmp, "repo");
    const helpers = join(tmp, "helpers");
    const logFile = join(tmp, "target-root.log");
    try {
      mkdirSync(repo, { recursive: true });
      mkdirSync(helpers, { recursive: true });
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      const helper = join(helpers, "target-root.sh");
      writeFileSync(helper, `#!/bin/bash\nprintf '%s\\n' "$REPO_HARNESS_TARGET_REPO_ROOT" > "${logFile}"\n`);
      chmodSync(helper, 0o755);

      const res = spawnSync("bun", [CLI, "run", "target-root"], {
        cwd: repo,
        encoding: "utf-8",
        env: {
          ...process.env,
          REPO_HARNESS_HELPER_SOURCE: helpers,
        },
      });

      expect(res.status).toBe(0);
      expect(realpathSync(readFileSync(logFile, "utf-8").trim())).toBe(realpathSync(repo));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("resolves bundled helpers from the package by default", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-package-"));
    try {
      const resolved = resolveHelper("check-task-workflow", tmp);

      expect(resolved?.source).toBe("package");
      expect(resolved?.fileName).toBe("check-task-workflow.sh");
      expect(resolved?.path).toContain("assets/templates/helpers/check-task-workflow.sh");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("prefers repo helper runtime when helper_source is repo pinned", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repo-harness-run-repo-pin-"));
    try {
      mkdirSync(join(tmp, ".ai/harness/scripts"), { recursive: true });
      writeFileSync(join(tmp, ".ai/harness/policy.json"), JSON.stringify({ harness: { helper_source: "repo" } }, null, 2));
      writeFileSync(join(tmp, ".ai/harness/scripts/check-task-workflow.sh"), "#!/bin/bash\necho repo\n");

      const resolved = resolveHelper("check-task-workflow", tmp);

      expect(resolved?.source).toBe("repo-pin");
      expect(resolved?.path).toBe(join(tmp, ".ai/harness/scripts/check-task-workflow.sh"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

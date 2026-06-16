import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function makeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function writeFakeBunForHarnessBootstrap(fakeBin: string, logFile: string): void {
  makeExecutable(
    join(fakeBin, "bun"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      `printf 'bun PWD=%s ARGS=%s\\n' "$PWD" "$*" >> ${JSON.stringify(logFile)}`,
      "if [[ \"$*\" == \"install\" ]]; then",
      "  mkdir -p node_modules/.bin",
      "  printf 'fake bun lock\\n' > bun.lock",
      "  cat > node_modules/.bin/local-repo-harness <<'SH'",
      "#!/bin/bash",
      "set -euo pipefail",
      `printf 'managed PWD=%s ARGS=%s\\n' "$PWD" "$*" >> ${JSON.stringify(logFile)}`,
      "if [[ \"${1:-}\" == \"--version\" ]]; then",
      "  echo '0.5.6'",
      "  exit 0",
      "fi",
      "if [[ \"${1:-}\" == \"adopt\" ]]; then",
      "  echo '{\"exitCode\":0,\"steps\":[{\"step\":\"fake managed adopt\",\"status\":\"ok\"}]}'",
      "  exit 0",
      "fi",
      "echo \"unexpected managed command: $*\" >&2",
      "exit 64",
      "SH",
      "  chmod +x node_modules/.bin/local-repo-harness",
      "  exit 0",
      "fi",
      `exec ${JSON.stringify(process.execPath)} "$@"`,
      "",
    ].join("\n"),
  );
}

describe("bootstrap command", () => {
  test("installs local-repo-harness into a harness-managed tool root without touching parent package boundary", () => {
    const tmp = join(tmpdir(), `repo-harness-bootstrap-${Date.now()}`);
    const parent = join(tmp, "parent");
    const repo = join(parent, "harness", "swarm discussion codex");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const logFile = join(tmp, "bootstrap.log");
    const parentPackage = JSON.stringify({ name: "parent-workspace", private: true }, null, 2) + "\n";
    try {
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(parent, "package.json"), parentPackage);
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      writeFakeBunForHarnessBootstrap(fakeBin, logFile);

      const res = spawnSync(
        process.execPath,
        [
          CLI,
          "bootstrap",
          "--repo",
          repo,
          "--host-adapter-scope",
          "none",
          "--skill-scope",
          "none",
          "--external-tool-scope",
          "none",
          "--codegraph-mcp-scope",
          "none",
          "--brain-mode",
          "skip",
          "--no-codegraph",
          "--no-verify",
          "--json",
        ],
        {
          cwd: repo,
          encoding: "utf-8",
          env: {
            ...process.env,
            HOME: home,
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          },
        },
      );

      expect(res.status).toBe(0);
      expect(res.stderr).toBe("");
      const output = JSON.parse(res.stdout);
      expect(output.repoRoot).toBe(repo);
      expect(output.packageSpec).toBe("local-repo-harness@latest");
      expect(output.toolRoot).toBe(join(repo, ".ai", "harness", "tools", "local-repo-harness"));
      expect(output.shim).toBe(join(repo, ".ai", "harness", "bin", "local-repo-harness"));
      expect(output.delegated.status).toBe(0);

      expect(readFileSync(join(parent, "package.json"), "utf-8")).toBe(parentPackage);
      expect(existsSync(join(parent, "bun.lock"))).toBe(false);
      expect(existsSync(join(repo, "package.json"))).toBe(false);
      expect(existsSync(join(repo, "bun.lock"))).toBe(false);
      expect(existsSync(join(repo, "node_modules"))).toBe(false);
      expect(existsSync(join(repo, ".ai", "harness", "tools", "local-repo-harness", "package.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai", "harness", "tools", "local-repo-harness", "bun.lock"))).toBe(true);
      expect(existsSync(join(repo, ".ai", "harness", "tools", "local-repo-harness", "node_modules", ".bin", "local-repo-harness"))).toBe(true);
      expect(existsSync(join(repo, ".ai", "harness", "bin", "local-repo-harness"))).toBe(true);

      const realRepo = realpathSync(repo);
      const log = readFileSync(logFile, "utf-8");
      expect(log).toContain(`bun PWD=${join(realRepo, ".ai", "harness", "tools", "local-repo-harness")} ARGS=install`);
      expect(log).toContain(`managed PWD=${realRepo} ARGS=adopt --repo ${repo}`);
      expect(log).toContain("--host-adapter-scope none");
      expect(log).toContain("--skill-scope none");
      expect(log).toContain("--external-tool-scope none");
      expect(log).toContain("--codegraph-mcp-scope none");
      expect(log).toContain("--brain-mode skip");
      expect(log).toContain("--no-codegraph");
      expect(log).toContain("--no-verify");
      expect(log).toContain("--json");

      unlinkSync(join(repo, ".ai", "harness", "tools", "local-repo-harness", "node_modules", ".bin", "local-repo-harness"));
      const missing = spawnSync(join(repo, ".ai", "harness", "bin", "local-repo-harness"), ["--version"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(missing.status).toBe(127);
      expect(missing.stderr).toContain("local-repo-harness project runtime is missing");
      expect(missing.stderr).toContain("bunx --bun local-repo-harness@latest bootstrap");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);
});

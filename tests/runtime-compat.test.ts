import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const CHECK = join(ROOT, "scripts/check-runtime-compat.sh");

function tmpRepo(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runCheck(repo: string) {
  return spawnSync("bash", [CHECK, "--repo", repo], {
    cwd: ROOT,
    encoding: "utf-8",
  });
}

describe("runtime compatibility gate", () => {
  test("rejects JavaScript runtime stdin heredocs", () => {
    const repo = tmpRepo("runtime-compat-stdin-");
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(
        join(repo, "scripts/bad.sh"),
        [
          "#!/bin/bash",
          "node - \"$file\" <<'JS_EOF'",
          "console.log('bad');",
          "JS_EOF",
          "",
        ].join("\n"),
      );

      const res = runCheck(repo);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("rh-js-stdin-node");
      expect(res.stdout).toContain("scripts/bad.sh");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("rejects stale repo-harness executable fallbacks", () => {
    const repo = tmpRepo("runtime-compat-stale-");
    try {
      mkdirSync(join(repo, "src/cli/repo-adoption"), { recursive: true });
      writeFileSync(
        join(repo, "src/cli/repo-adoption/reclaim-runtime.ts"),
        'const command = ["repo-harness", "run", "check-task-workflow"];\n',
      );

      const res = runCheck(repo);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("rh-stale-wrapper-fallback");
      expect(res.stdout).toContain("src/cli/repo-adoption/reclaim-runtime.ts");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("allows documented hook environment-only Bun eval snippets", () => {
    const repo = tmpRepo("runtime-compat-hook-allow-");
    try {
      mkdirSync(join(repo, "assets/hooks"), { recursive: true });
      writeFileSync(
        join(repo, "assets/hooks/hook-input.sh"),
        [
          "#!/bin/bash",
          "JSON_INPUT=\"$HOOK_STDIN_JSON\" bun -e '",
          "  JSON.parse(process.env.JSON_INPUT ?? \"{}\");",
          "'",
          "",
        ].join("\n"),
      );

      const res = runCheck(repo);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[runtime-compat] OK");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("accepts the live repository runtime surfaces", () => {
    const res = runCheck(ROOT);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("[runtime-compat] OK");
  }, 15000);
});

import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function writeExecutable(filePath: string, content: string) {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
}

function setupFakeEnvironment(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const home = join(root, "home");
  const fakeBin = join(root, "fakebin");
  mkdirSync(home, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  return { root, home, fakeBin };
}

function writeFakeCodeGraph(
  fakeBin: string,
  logFile: string,
  opts: { codexLocalUnsupported?: boolean } = {},
) {
  writeExecutable(
    join(fakeBin, "codegraph"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      `echo "codegraph $*" >> "${logFile}"`,
      `echo "env CODEGRAPH_TELEMETRY=\${CODEGRAPH_TELEMETRY:-} DO_NOT_TRACK=\${DO_NOT_TRACK:-} CODEGRAPH_INSTALL_DIR=\${CODEGRAPH_INSTALL_DIR:-}" >> "${logFile}"`,
      "case \"${1:-}\" in",
      "  \"--version\") echo '0.9.6' ;;",
      "  \"status\") echo 'CodeGraph Status'; echo 'Index is up to date' ;;",
      "  \"install\")",
      "    if [[ \" $* \" == *\" --target codex \"* && \" $* \" == *\" --location local \"* ]]; then",
      ...(opts.codexLocalUnsupported
        ? [
            "      echo '▲  Codex CLI: skipped — does not support --location=local.'",
          ]
        : [
            "      mkdir -p .codex",
            "      cat > .codex/config.toml <<'TOML'",
            "[mcp_servers.codegraph]",
            "command = \"codegraph\"",
            "args = [\"serve\", \"--mcp\"]",
            "TOML",
          ]),
      "    elif [[ \" $* \" == *\" --target codex \"* ]]; then",
      "      mkdir -p \"$HOME/.codex\"",
      "      cat > \"$HOME/.codex/config.toml\" <<'TOML'",
      "[mcp_servers.codegraph]",
      "command = \"codegraph\"",
      "args = [\"serve\", \"--mcp\"]",
      "TOML",
      "    fi",
      "    if [[ \" $* \" == *\" --target claude \"* && \" $* \" == *\" --location local \"* ]]; then",
      "      cat > .mcp.json <<'JSON'",
      "{",
      "  \"mcpServers\": {",
      "    \"codegraph\": {",
      "      \"type\": \"stdio\",",
      "      \"command\": \"codegraph\",",
      "      \"args\": [\"serve\", \"--mcp\"]",
      "    }",
      "  }",
      "}",
      "JSON",
      "    elif [[ \" $* \" == *\" --target claude \"* && ! -f \"$HOME/.claude.json\" ]]; then",
      "      cat > \"$HOME/.claude.json\" <<'JSON'",
      "{",
      "  \"mcpServers\": {",
      "    \"codegraph\": {",
      "      \"type\": \"stdio\",",
      "      \"command\": \"codegraph\",",
      "      \"args\": [\"serve\", \"--mcp\"]",
      "    }",
      "  }",
      "}",
      "JSON",
      "    fi",
      "    echo 'installed' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n")
  );
}

function writeFakeGbrain(fakeBin: string) {
  writeExecutable(
    join(fakeBin, "gbrain"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "case \"$1 ${2:-}\" in",
      "  \"--version \") echo 'gbrain 0.12.0' ;;",
      "  \"doctor --json\") echo '{\"status\":\"warnings\",\"health_score\":90}' ;;",
      "  \"integrations list\") echo '{\"local\":[]}' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n")
  );
}

function writeFakeNpx(fakeBin: string) {
  writeExecutable(
    join(fakeBin, "npx"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "if [[ \"$*\" == *\"skills ls -g --json\"* ]]; then echo '[]'; exit 0; fi",
      "exit 1",
      "",
    ].join("\n")
  );
}

function writeFakeBunInstaller(fakeBin: string, logFile: string) {
  writeExecutable(
    join(fakeBin, "bun"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      `echo "bun $* cwd=$PWD" >> "${logFile}"`,
      "if [[ \"$*\" == \"install\" ]]; then",
      "  mkdir -p node_modules/.bin",
      "  cat > node_modules/.bin/codegraph <<'SH'",
      "#!/bin/bash",
      "set -euo pipefail",
      "case \"${1:-}\" in",
      "  \"--version\") echo '0.9.6' ;;",
      "  \"status\") echo 'CodeGraph Status'; echo 'Index is up to date' ;;",
      "  *) exit 1 ;;",
      "esac",
      "SH",
      "  chmod +x node_modules/.bin/codegraph",
      "  exit 0",
      "fi",
      `exec "${process.execPath}" "$@"`,
      "",
    ].join("\n"),
  );
}

type RunConfigureOptions = {
  // null / undefined → seed empty {} settings.json so the claude-allowed-tools
  // step has something to mutate. Pass "missing" to skip seeding entirely and
  // exercise the "no Claude Code installed" branch.
  seedClaudeSettings?: Record<string, unknown> | "missing" | null;
  seedClaudeRootConfig?: Record<string, unknown> | null;
  location?: "global" | "local";
  codexLocalUnsupported?: boolean;
  skipCodegraphCli?: boolean;
};

function runConfigure(target: string, options: RunConfigureOptions = {}) {
  const envRoot = setupFakeEnvironment(`repo-harness-tools-configure-${target}`);
  const logFile = join(envRoot.root, "tool.log");
  const repo = join(envRoot.root, "repo");
  const claudeSettingsPath = join(envRoot.home, ".claude", "settings.json");
  const claudeRootConfigPath = join(envRoot.home, ".claude.json");
  const location = options.location ?? "global";
  try {
    mkdirSync(repo, { recursive: true });
    if (location === "global") {
      mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
      writeFileSync(join(envRoot.home, ".codex", "config.toml"), "# no codegraph yet\n");
    }

    const seed = options.seedClaudeSettings;
    if (location === "global" && seed !== "missing") {
      mkdirSync(dirname(claudeSettingsPath), { recursive: true });
      writeFileSync(claudeSettingsPath, `${JSON.stringify(seed ?? {}, null, 2)}\n`);
    }
    if (location === "global" && options.seedClaudeRootConfig) {
      writeFileSync(claudeRootConfigPath, `${JSON.stringify(options.seedClaudeRootConfig, null, 2)}\n`);
    }

    if (options.skipCodegraphCli !== true) {
      writeFakeCodeGraph(envRoot.fakeBin, logFile, {
        codexLocalUnsupported: options.codexLocalUnsupported === true,
      });
    }
    if (location === "local") {
      mkdirSync(join(repo, "node_modules", ".bin"), { recursive: true });
      writeExecutable(
        join(repo, "node_modules", ".bin", "codegraph"),
        `#!/bin/bash\nexec "${join(envRoot.fakeBin, "codegraph")}" "$@"\n`,
      );
    }
    writeFakeGbrain(envRoot.fakeBin);
    writeFakeNpx(envRoot.fakeBin);

    const res = spawnSync("bun", [CLI, "tools", "configure", "codegraph", "--target", target, "--location", location, "--json", "--repo", repo], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: envRoot.home,
        PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
        AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        ...(options.skipCodegraphCli === true ? { AGENTIC_DEV_CODEGRAPH_ALLOW_GLOBAL: "0" } : {}),
      },
    });

    let log = "";
    try {
      log = readFileSync(logFile, "utf-8");
    } catch (_error) {
      log = "";
    }
    let claudeSettingsAfter: any = null;
    let claudeRootConfigAfter: any = null;
    let codexConfigAfter = "";
    try {
      claudeSettingsAfter = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
    } catch (_error) {
      claudeSettingsAfter = null;
    }
    try {
      claudeRootConfigAfter = JSON.parse(readFileSync(claudeRootConfigPath, "utf-8"));
    } catch (_error) {
      claudeRootConfigAfter = null;
    }
    try {
      codexConfigAfter = readFileSync(join(envRoot.home, ".codex", "config.toml"), "utf-8");
    } catch (_error) {
      codexConfigAfter = "";
    }
    let projectCodexConfigAfter = "";
    let projectMcpAfter: any = null;
    try {
      projectCodexConfigAfter = readFileSync(join(repo, ".codex", "config.toml"), "utf-8");
    } catch (_error) {
      projectCodexConfigAfter = "";
    }
    try {
      projectMcpAfter = JSON.parse(readFileSync(join(repo, ".mcp.json"), "utf-8"));
    } catch (_error) {
      projectMcpAfter = null;
    }
    return { res, log, repo, claudeSettingsAfter, claudeRootConfigAfter, codexConfigAfter, projectCodexConfigAfter, projectMcpAfter };
  } finally {
    rmSync(envRoot.root, { recursive: true, force: true });
  }
}

describe("tools configure codegraph", () => {
  test("configures Codex through the CodeGraph target adapter", () => {
    const { res, log, repo, codexConfigAfter } = runConfigure("codex");
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("codex");
    expect(result.location).toBe("global");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual([
      "configure-codex",
      "codex-project-path",
    ]);
    expect(log).toContain("codegraph install --target codex --location global --yes");
    expect(log).toContain(`env CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1 CODEGRAPH_INSTALL_DIR=${repo}/.ai/harness/codegraph-runtime`);
    expect(codexConfigAfter).toContain('args = ["serve", "--mcp", "--path", "."]');
    expect(codexConfigAfter).toContain('env = { CODEGRAPH_TELEMETRY = "0", DO_NOT_TRACK = "1" }');
  }, 15000);

  test("configures Claude and registers codegraph for eager schema load", () => {
    const { res, log, repo, claudeSettingsAfter, claudeRootConfigAfter } = runConfigure("claude");
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("claude");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual([
      "configure-claude",
      "claude-project-path",
      "claude-always-load",
      "claude-allowed-tools",
    ]);
    expect(log).toContain("codegraph install --target claude --location global --yes");
    expect(log).toContain(`env CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1 CODEGRAPH_INSTALL_DIR=${repo}/.ai/harness/codegraph-runtime`);

    const alwaysLoad = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-always-load",
    );
    const allowedTools = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-allowed-tools",
    );
    expect(alwaysLoad?.status).toBe("changed");
    expect(allowedTools?.status).toBe("changed");
    expect(claudeRootConfigAfter?.mcpServers?.codegraph?.args).toEqual(["serve", "--mcp", "--path", "."]);
    expect(claudeRootConfigAfter?.mcpServers?.codegraph?.env).toEqual({
      CODEGRAPH_TELEMETRY: "0",
      DO_NOT_TRACK: "1",
    });
    expect(claudeRootConfigAfter?.mcpServers?.codegraph?.alwaysLoad).toBe(true);
    expect(claudeSettingsAfter?.allowedTools).toContain("mcp__codegraph__*");
  }, 15000);

  test("claude project path adds telemetry opt-out when CodeGraph is already pinned", () => {
    const { res, claudeRootConfigAfter } = runConfigure("claude", {
      seedClaudeRootConfig: {
        mcpServers: {
          codegraph: {
            type: "stdio",
          command: "codegraph",
          args: ["serve", "--mcp", "--path", "."],
          alwaysLoad: true,
        },
      },
      },
    });
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    const alwaysLoad = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-always-load",
    );
    const projectPath = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-project-path",
    );
    expect(projectPath?.status).toBe("changed");
    expect(alwaysLoad?.status).toBe("unchanged");
    expect(claudeRootConfigAfter?.mcpServers?.codegraph?.alwaysLoad).toBe(true);
    expect(claudeRootConfigAfter?.mcpServers?.codegraph?.env).toEqual({
      CODEGRAPH_TELEMETRY: "0",
      DO_NOT_TRACK: "1",
    });
  }, 15000);

  test("claude-allowed-tools is idempotent when the wildcard is already present", () => {
    const { res, claudeSettingsAfter } = runConfigure("claude", {
      seedClaudeSettings: { allowedTools: ["Edit", "mcp__codegraph__*"] },
    });
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    const allowedTools = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "claude-allowed-tools",
    );
    expect(allowedTools?.status).toBe("unchanged");
    expect(claudeSettingsAfter?.allowedTools).toEqual(["Edit", "mcp__codegraph__*"]);
  }, 15000);

  test("claude-allowed-tools is skipped when Claude Code is not installed", () => {
    const { res, claudeSettingsAfter } = runConfigure("claude", { seedClaudeSettings: "missing" });
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    const allowedTools = (result.actions as Array<{ action: string; status: string; stderr?: string }>).find(
      (entry) => entry.action === "claude-allowed-tools",
    );
    expect(allowedTools?.status).toBe("skipped");
    expect(allowedTools?.stderr ?? "").toContain("not found");
    expect(claudeSettingsAfter).toBeNull();
  }, 15000);

  test("configures both hosts without exposing host-specific tool call syntax", () => {
    const { res, log } = runConfigure("both");
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("both");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual([
      "configure-codex",
      "codex-project-path",
      "configure-claude",
      "claude-project-path",
      "claude-always-load",
      "claude-allowed-tools",
    ]);
    expect(log).toContain("codegraph install --target codex --location global --yes");
    expect(log).toContain("codegraph install --target claude --location global --yes");
    // CLI output may carry the host-agnostic wildcard mcp__codegraph__* as a
    // configuration value (it is the actual Claude allowedTools entry). What it
    // must NOT carry is concrete codegraph tool invocations such as
    // codegraph_context(...), codegraph_callers(...) etc -- those belong to
    // agent prompts, not adapter output.
    expect(res.stdout).not.toMatch(/codegraph_\w+\s*\(/);
  }, 15000);

  test("configures local project MCP without writing user-level host config", () => {
    const {
      res,
      log,
      repo,
      claudeSettingsAfter,
      claudeRootConfigAfter,
      codexConfigAfter,
      projectCodexConfigAfter,
      projectMcpAfter,
    } = runConfigure("both", {
      location: "local",
      seedClaudeSettings: "missing",
    });

    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("both");
    expect(result.location).toBe("local");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual([
      "configure-codex",
      "codex-project-path",
      "configure-claude",
      "claude-project-path",
      "claude-always-load",
    ]);
    expect(log).toContain("codegraph install --target codex --location local --yes");
    expect(log).toContain("codegraph install --target claude --location local --yes");
    expect(log).toContain(`env CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1 CODEGRAPH_INSTALL_DIR=${repo}/.ai/harness/codegraph-runtime`);
    expect(projectCodexConfigAfter).toContain('command = "./.ai/harness/bin/codegraph"');
    expect(projectCodexConfigAfter).toContain('args = ["serve", "--mcp", "--path", "."]');
    expect(projectCodexConfigAfter).toContain('env = { CODEGRAPH_TELEMETRY = "0", DO_NOT_TRACK = "1", CODEGRAPH_INSTALL_DIR = ".ai/harness/codegraph-runtime", CODEGRAPH_NO_DAEMON = "1" }');
    expect(projectMcpAfter?.mcpServers?.codegraph?.command).toBe("./.ai/harness/bin/codegraph");
    expect(projectMcpAfter?.mcpServers?.codegraph?.args).toEqual(["serve", "--mcp", "--path", "."]);
    expect(projectMcpAfter?.mcpServers?.codegraph?.env).toEqual({
      CODEGRAPH_TELEMETRY: "0",
      DO_NOT_TRACK: "1",
      CODEGRAPH_INSTALL_DIR: ".ai/harness/codegraph-runtime",
      CODEGRAPH_NO_DAEMON: "1",
    });
    expect(codexConfigAfter).toBe("");
    expect(claudeRootConfigAfter).toBeNull();
    expect(claudeSettingsAfter).toBeNull();
    expect(result.actions.some((entry: { action: string }) => entry.action === "claude-allowed-tools")).toBe(false);
  }, 15000);

  test("writes Codex project config when CodeGraph local installer skips Codex", () => {
    const { res, log, codexConfigAfter, projectCodexConfigAfter } = runConfigure("codex", {
      location: "local",
      codexLocalUnsupported: true,
    });

    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    const configure = (result.actions as Array<{ action: string; status: string; stderr?: string }>).find(
      (entry) => entry.action === "configure-codex",
    );
    const projectPath = (result.actions as Array<{ action: string; status: string }>).find(
      (entry) => entry.action === "codex-project-path",
    );

    expect(log).toContain("codegraph install --target codex --location local --yes");
    expect(configure?.status).toBe("skipped");
    expect(configure?.stderr ?? "").toContain("does not support --location=local");
    expect(projectPath?.status).toBe("changed");
    expect(projectCodexConfigAfter).toContain('command = "./.ai/harness/bin/codegraph"');
    expect(projectCodexConfigAfter).toContain('args = ["serve", "--mcp", "--path", "."]');
    expect(projectCodexConfigAfter).toContain('env = { CODEGRAPH_TELEMETRY = "0", DO_NOT_TRACK = "1", CODEGRAPH_INSTALL_DIR = ".ai/harness/codegraph-runtime", CODEGRAPH_NO_DAEMON = "1" }');
    expect(codexConfigAfter).toBe("");
  }, 15000);

  test("writes local project MCP stubs when CodeGraph CLI is missing", () => {
    const {
      res,
      log,
      claudeSettingsAfter,
      claudeRootConfigAfter,
      codexConfigAfter,
      projectCodexConfigAfter,
      projectMcpAfter,
    } = runConfigure("both", {
      location: "local",
      seedClaudeSettings: "missing",
      skipCodegraphCli: true,
    });

    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.codegraph.status).toBe("missing");
    expect(result.actions.map((entry: { action: string; status: string }) => `${entry.action}:${entry.status}`)).toEqual([
      "configure-codex:skipped",
      "codex-project-path:changed",
      "configure-claude:skipped",
      "claude-project-path:changed",
      "claude-always-load:skipped",
    ]);
    expect(log).toBe("");
    expect(projectCodexConfigAfter).toContain('command = "./.ai/harness/bin/codegraph"');
    expect(projectCodexConfigAfter).toContain('args = ["serve", "--mcp", "--path", "."]');
    expect(projectCodexConfigAfter).toContain('env = { CODEGRAPH_TELEMETRY = "0", DO_NOT_TRACK = "1", CODEGRAPH_INSTALL_DIR = ".ai/harness/codegraph-runtime", CODEGRAPH_NO_DAEMON = "1" }');
    expect(projectMcpAfter?.mcpServers?.codegraph?.command).toBe("./.ai/harness/bin/codegraph");
    expect(projectMcpAfter?.mcpServers?.codegraph?.args).toEqual(["serve", "--mcp", "--path", "."]);
    expect(projectMcpAfter?.mcpServers?.codegraph?.env).toEqual({
      CODEGRAPH_TELEMETRY: "0",
      DO_NOT_TRACK: "1",
      CODEGRAPH_INSTALL_DIR: ".ai/harness/codegraph-runtime",
      CODEGRAPH_NO_DAEMON: "1",
    });
    expect(codexConfigAfter).toBe("");
    expect(claudeRootConfigAfter).toBeNull();
    expect(claudeSettingsAfter).toBeNull();
  }, 15000);
});

describe("tools ensure codegraph", () => {
  test("installs project CodeGraph into the harness tool root without creating a root package.json", () => {
    const envRoot = setupFakeEnvironment("repo-harness-tools-ensure-codegraph");
    const repo = join(envRoot.root, "repo");
    const logFile = join(envRoot.root, "tool.log");
    try {
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      writeFileSync(
        join(repo, ".ai", "harness", "policy.json"),
        JSON.stringify({
          external_tooling: {
            codegraph: {
              mcp_scope: "project",
            },
          },
        }, null, 2),
      );
      writeFakeBunInstaller(envRoot.fakeBin, logFile);
      writeFakeGbrain(envRoot.fakeBin);
      writeFakeNpx(envRoot.fakeBin);

      const res = spawnSync(process.execPath, [CLI, "tools", "ensure", "codegraph", "--json", "--repo", repo], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: envRoot.home,
          PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_GLOBAL: "0",
        },
      });

      expect(res.status).toBe(0);
      const result = JSON.parse(res.stdout);
      expect(result.codegraph.source).toBe("local");
      expect(result.codegraph.local_bin_path).toContain(".ai/harness/bin/codegraph");
      expect(result.actions.some((entry: { action: string }) => entry.action === "install-managed-deps")).toBe(true);
      const log = readFileSync(logFile, "utf-8");
      expect(log).toContain("bun install cwd=");
      expect(log).toContain(".ai/harness/tools/codegraph");
      expect(existsSync(join(repo, ".ai", "harness", "tools", "codegraph", "package.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai", "harness", "bin", "codegraph"))).toBe(true);
      expect(existsSync(join(repo, "package.json"))).toBe(false);
    } finally {
      rmSync(envRoot.root, { recursive: true, force: true });
    }
  }, 15000);
});

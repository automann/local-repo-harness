# 项目级安装和应用 local-repo-harness 教程

这份教程面向只想把 local-repo-harness 用在某一个项目里的用户。目标是：

- local-repo-harness CLI 作为目标项目的开发依赖存在。
- hooks、skills、外部工具配置和 CodeGraph MCP 尽量写入目标项目。
- 不注册 user-level Codex/Claude hooks。
- 不把 Waza、Mermaid、gbrain、CodeGraph MCP 写进用户级目录。

这里的“项目级”不是说包管理器完全不使用缓存。Bun、package registry 或 Git 仍可能使用自己的 cache。这里限制的是 local-repo-harness 管理的 runtime、host adapter、skills、MCP config 和 brain state 不写入用户级位置。

## 先分清两个仓库

同步开发或本地测试时，通常会同时看到两个 local-repo-harness 相关副本：

- **源码 local-repo-harness**：你 fork 或 clone 的 local-repo-harness 源码仓库，用来开发、打包、验证 local-repo-harness 本身。
- **下游 / 目标项目**：真正要接入 local-repo-harness 工作流的业务项目。项目级安装时，local-repo-harness 会作为这个项目的 `devDependencies`、项目 hooks runtime 和项目 skills 出现。

除非你正在开发 local-repo-harness 本身，否则不要在目标项目里编辑 `.agents/skills/repo-harness`、`.claude/skills/repo-harness` 或 `.ai/harness/runtime/local-repo-harness`。这些是安装副本和运行时副本，不是产品源码。

## 不要运行这些命令

如果你只想项目级安装，不要运行：

```bash
local-repo-harness init
local-repo-harness update
bunx local-repo-harness init
bun add -g local-repo-harness
bunx skills add tw93/Waza -g
```

原因：

- `local-repo-harness init` 是机器级 bootstrap，会安装或刷新 user-level hooks、skills、brain root 和 CodeGraph MCP。
- `local-repo-harness update` 刷新的是 user-level CLI/runtime，不负责刷新某个项目。
- `-g` 会把外部 skills 或工具装到用户级位置。

项目级刷新使用 `local-repo-harness adopt --repo <target-project>`，并显式传入 project/none scope。

## 前置条件

目标项目需要：

- 已经是 Git 仓库。
- 能运行 `bash`。
- 已安装 Bun。
- 目标项目根目录已经有 `package.json`。如果没有，先建立一个最小项目级 package 边界；不要在没有 `package.json` 的子目录里直接运行 `bun add`，否则 Bun 会沿用上级 package 边界。
- 不要用 `bun init -y` 只为建立 package 边界；它会生成 `README.md`、`index.ts`、`tsconfig.json` 等应用脚手架文件。

建议先从干净分支开始：

```bash
cd /path/to/target-project
git status --short
git checkout -b chore/adopt-local-repo-harness-project-scope
if [ ! -f package.json ]; then
  printf '%s\n' '{' '  "private": true' '}' > package.json
fi
```

## 第一步：把 local-repo-harness 放进目标项目

如果 `local-repo-harness` 已经发布到你要使用的 registry：

```bash
cd /path/to/target-project
bun add -d local-repo-harness
```

如果你要测试自己的 fork，可以先在源码仓库打 tarball，再安装到目标项目：

```bash
cd /path/to/source-local-repo-harness
bun install
mkdir -p /tmp/local-repo-harness-pack
bun pm pack --destination /tmp/local-repo-harness-pack

cd /path/to/target-project
bun add -d /tmp/local-repo-harness-pack/local-repo-harness-*.tgz
```

之后统一用目标项目里的本地 CLI：

```bash
cd /path/to/target-project
bun --bun local-repo-harness --version
```

## 第二步：做最小 dry-run

先只预览 repo-local workflow contract，不写 hooks、skills、外部工具或 CodeGraph MCP：

```bash
cd /path/to/target-project
bun --bun local-repo-harness adopt --dry-run \
  --repo "$PWD" \
  --host-adapter-scope none \
  --skill-scope none \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --no-codegraph
```

这个命令应该只报告将要创建或刷新项目内 workflow 文件。它不应该写：

- `~/.codex/hooks.json`
- `~/.codex/config.toml`
- `~/.codex/skills`
- `~/.claude/settings.json`
- `~/.claude.json`
- `~/.claude/skills`
- `~/.agents/skills`
- `~/.repo-harness`
- `~/.codegraph`

如果 dry-run 输出里出现 user-level hook adapter、user-level skill root、global MCP 或 global brain bootstrap，先停下来检查 scope 参数。

## 第三步：选择一种项目级配方

### 配方 A：只安装 workflow contract

适合先让项目拥有 repo-harness 的文件化协作结构，但暂时不启用 Codex/Claude hooks：

```bash
bun --bun local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope none \
  --skill-scope none \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --no-codegraph
```

常见写入：

- `docs/spec.md`
- `docs/reference-configs/`
- `plans/`
- `tasks/`
- `.ai/harness/workflow-contract.json`
- `.ai/harness/policy.json`
- `.ai/harness/scripts/`

不会写项目 hooks，也不会安装 repo-harness skills。

### 配方 B：项目 hooks + 项目 repo-harness skills

适合只想让当前项目启用 Codex/Claude hooks 和 repo-harness skills，但暂时不安装 Waza、Mermaid、CodeGraph：

```bash
bun --bun local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode manifest-only \
  --no-codegraph
```

常见写入：

- `.codex/hooks.json`
- `.claude/settings.json`
- `.ai/harness/bin/local-repo-harness-hook`
- `.ai/harness/runtime/local-repo-harness/`
- `.agents/skills/repo-harness`
- `.claude/skills/repo-harness`
- `.ai/harness/brain-manifest.json`

Codex Desktop 是否执行项目 hooks，取决于 Codex 是否加载并信任当前项目的 `.codex/hooks.json`。安装后请从目标项目打开 Codex，并在 Codex Settings 中信任这个项目 hooks 文件；不需要为了这个目标去注册 `~/.codex/hooks.json`。

### 配方 C：完整项目级安装，包含外部 skills 和 CodeGraph

适合确认项目级路径已经可控后，再启用 Waza、Mermaid、cross-review skills 和 CodeGraph project MCP。

先确认当前目录就是目标项目根目录，并且这里已经有自己的 `package.json`。这一步必须早于安装 CodeGraph；如果当前目录没有 `package.json`，`bun add` 可能沿用上级 package 边界，把 CodeGraph 装到上级目录。这里只需要最小 `package.json`，不要运行 `bun init -y` 生成应用脚手架。

```bash
cd /path/to/target-project
if [ ! -f package.json ]; then
  printf '%s\n' '{' '  "private": true' '}' > package.json
fi
```

然后把 CodeGraph 放入目标项目，避免 MCP 运行时依赖用户级 `codegraph`：

```bash
bun add -d @colbymchenry/codegraph
```

然后执行：

```bash
bun --bun local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only
```

在这个模式下：

- Waza 和 Mermaid 通过 skills CLI 安装到项目 skill roots，不使用 `-g`。
- local-repo-harness 的 cross-review skills 写入项目 skill roots。
- CodeGraph MCP 写入 `.codex/config.toml` 和 `.mcp.json`。
- CodeGraph env 包含 `CODEGRAPH_TELEMETRY=0`、`DO_NOT_TRACK=1` 和 `CODEGRAPH_INSTALL_DIR=.ai/harness/codegraph-runtime`。
- CodeGraph index 是项目 runtime state，通常位于 `.codegraph/`。

如果暂时不需要 CodeGraph，继续使用 `--codegraph-mcp-scope none --no-codegraph`。

## 项目级安装后的目录地图

按启用的 scope 不同，目标项目里可能出现这些文件：

| 路径 | 作用 |
| --- | --- |
| `.ai/harness/workflow-contract.json` | local-repo-harness 工作流合约入口 |
| `.ai/harness/policy.json` | 当前项目的 harness policy 和 scope 决策 |
| `.ai/harness/scripts/` | 项目内 helper script compatibility layer |
| `.ai/harness/bin/local-repo-harness-hook` | project-vendored hook entrypoint |
| `.ai/harness/runtime/local-repo-harness/` | project-vendored local-repo-harness hook runtime |
| `.ai/harness/codegraph-runtime/` | project-scoped CodeGraph runtime/install state |
| `.codex/hooks.json` | Codex 项目级 hooks adapter |
| `.claude/settings.json` | Claude 项目级 hooks adapter |
| `.agents/skills/` | Codex 项目 skills root |
| `.claude/skills/` | Claude 项目 skills root |
| `.codex/config.toml` | Codex 项目 MCP config |
| `.mcp.json` | Claude 项目 MCP config |
| `.codegraph/` | CodeGraph 项目索引 |

这些是安装产物或 runtime state，不等同于上游 repo-harness 源码。

## 验收：确认没有回退到用户级

如果这些用户级路径原本不存在，安装后可以直接检查：

```bash
test ! -e "$HOME/.codex/hooks.json"
test ! -e "$HOME/.codex/config.toml"
test ! -e "$HOME/.codex/skills"
test ! -e "$HOME/.claude/settings.json"
test ! -e "$HOME/.claude.json"
test ! -e "$HOME/.claude/skills"
test ! -e "$HOME/.agents/skills"
test ! -e "$HOME/.repo-harness"
test ! -e "$HOME/.codegraph"
```

如果这些路径原本就存在，先做安装前后快照：

```bash
snapshot_repo_harness_user_paths() {
  for p in \
    "$HOME/.codex/hooks.json" \
    "$HOME/.codex/config.toml" \
    "$HOME/.codex/skills" \
    "$HOME/.claude/settings.json" \
    "$HOME/.claude.json" \
    "$HOME/.claude/skills" \
    "$HOME/.agents/skills" \
    "$HOME/.repo-harness" \
    "$HOME/.codegraph"
  do
    if [ -e "$p" ]; then
      echo "EXISTS $p"
      find "$p" -type f -print 2>/dev/null | LC_ALL=C sort | while IFS= read -r f; do
        shasum -a 256 "$f"
      done
    else
      echo "MISSING $p"
    fi
  done
}

snapshot_repo_harness_user_paths > /tmp/repo-harness-user-before.txt
# 在这里运行 bun --bun local-repo-harness adopt ...
snapshot_repo_harness_user_paths > /tmp/repo-harness-user-after.txt
diff -u /tmp/repo-harness-user-before.txt /tmp/repo-harness-user-after.txt
```

严格项目级安装下，diff 应该为空。若 diff 显示 user-level hooks、skills、MCP、brain 或 CodeGraph state 被写入，说明命令参数或外部工具安装路径不符合本教程目标。

## 验收：确认项目内功能可用

在目标项目运行：

```bash
bun --bun local-repo-harness status --json
bun --bun local-repo-harness doctor --json
bun --bun local-repo-harness security scan --json
bash .ai/harness/scripts/check-task-workflow.sh --strict
```

如果启用了外部工具和 CodeGraph，再运行：

```bash
bash .ai/harness/scripts/check-agent-tooling.sh --json --host both
bun --bun local-repo-harness tools ensure codegraph --check --json --repo "$PWD"
```

期望结果：

- `status` 能看到 repo opt-in 和 project scope 状态。
- `doctor` 不要求 user-level hooks 才能通过项目级安装。
- `security scan` 不报告项目 hooks adapter 指向未知脚本。
- `check-task-workflow.sh --strict` 通过。
- CodeGraph 使用项目本地 MCP config 和项目 runtime env。

## 后续刷新

升级 local-repo-harness 版本后，先更新目标项目依赖，再用相同 scope 重新执行 `adopt`：

```bash
cd /path/to/target-project
bun add -d local-repo-harness@latest

bun --bun local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode manifest-only \
  --no-codegraph
```

不要用 `local-repo-harness update --repo <path>` 刷新目标项目。`update` 是 user-level runtime 命令；项目级安装和刷新统一由 `adopt` 负责。

## 常见问题

### dry-run 看起来要写用户级 hooks

检查是否忘了传：

```bash
--host-adapter-scope none
```

或：

```bash
--host-adapter-scope project --runtime project-vendored-bun
```

### 外部 skills 安装到了用户级

项目级外部 skills 必须走：

```bash
--external-tool-scope project
```

并且 skills CLI 命令不应该带 `-g`。如果第三方工具不能项目级安装，local-repo-harness 应该报告失败，而不是回退到 global install。

### CodeGraph 仍然依赖用户级命令

先确认当前目录就是目标项目根目录，并且这里已经有自己的 `package.json`。这里只需要最小 package 边界，不需要 `bun init -y`：

```bash
cd /path/to/target-project
if [ ! -f package.json ]; then
  printf '%s\n' '{' '  "private": true' '}' > package.json
fi
```

再安装 CodeGraph：

```bash
bun add -d @colbymchenry/codegraph
```

再运行：

```bash
bun --bun local-repo-harness adopt \
  --repo "$PWD" \
  --codegraph-mcp-scope project \
  --sync-codegraph
```

项目 `.codex/config.toml` 里应该优先使用 `./node_modules/.bin/codegraph`。如果你不想启用 CodeGraph，使用 `--codegraph-mcp-scope none --no-codegraph`。

### Codex Desktop 没有执行项目 hooks

项目级安装只负责写 `.codex/hooks.json`。Codex Desktop 还需要在当前项目中加载并信任该 hooks 文件。请确认：

- Codex 打开的 workspace 是目标项目。
- Codex Settings 中信任的是目标项目的 `.codex/hooks.json`。
- 新开一个 Codex session 后再验证。

不要因为项目 hooks 暂时没执行，就直接运行 `local-repo-harness init` 注册 user-level hooks；那会改变本教程的隔离目标。

# local-repo-harness

> `local-repo-harness` 是一个独立 npm 包，基于原
> [`repo-harness@0.5.0`](https://github.com/Ancienttwo/repo-harness)
> fork 而来。这个 fork 的目标很明确：服务那些只想在某一个项目里安装和应用
> repo-harness 工作流的用户，把 CLI runtime、hooks、skills、外部工具和
> CodeGraph MCP 尽量收束在目标项目内，而不是注册到用户级配置里。

仓库：`https://github.com/automann/local-repo-harness`

当前版本：`local-repo-harness@0.5.16`

## 这个项目适合谁

适合你，如果你想要：

- 在单个项目里安装 repo-harness 风格的计划、任务、验收和 handoff 工作流。
- 让 Codex 和 Claude 读取同一个项目内的 `plans/`、`tasks/`、`.ai/harness/`
  状态，而不是依赖聊天记录。
- 使用项目级 `.codex/hooks.json` 和 `.claude/settings.json`，不注册
  `~/.codex/hooks.json` 或 `~/.claude/settings.json`。
- 把 Waza、Mermaid、repo-harness skills、cross-review skills 和 CodeGraph
  MCP 装进项目目录。
- 让 CodeGraph 使用项目内 `.ai/harness/bin/codegraph`，并默认带
  `CODEGRAPH_NO_DAEMON=1`，避免在 `~/.codegraph/daemons` 写入当前项目的
  daemon registry。

不适合你，如果你要的是：

- 机器级统一 hooks bootstrap。
- user-level skills 或全局 CodeGraph MCP。
- 继续使用上游 `repo-harness` 包名和 `repo-harness` CLI alias。

本项目不提供 `repo-harness` 兼容 alias。公开 CLI 是：

```bash
local-repo-harness
local-repo-harness-hook
```

## 与上游 repo-harness 的关系

这个包保留上游 repo-harness 的文件化 workflow 模型：

- `plans/` 记录可执行计划和 PRD/Sprint。
- `tasks/` 记录 contract、review、notes、current status。
- `.ai/harness/` 记录 policy、runtime、handoff、checks、events。
- hooks 在会话开始、编辑前后、命令后、停止前提供上下文和防护。

但这个 fork 改变了默认重心：

- 默认文档面向 project-scoped install。
- 推荐入口是 `bootstrap` 加项目内 `./.ai/harness/bin/local-repo-harness adopt`。
- 不推荐普通用户从 `local-repo-harness init` 开始。
- 不推荐为了项目级安装去执行 `bun add -g`、`npx -y local-repo-harness init`
  或任何 user-level hook/skill/MCP 注册命令。

## 核心模型

安装以后，请把目标项目分成三层理解：

| 层级 | 典型路径 | 作用 |
| --- | --- | --- |
| 项目 workflow contract | `plans/`, `tasks/`, `docs/spec.md`, `.ai/harness/workflow-contract.json` | 人和 agent 共同认可的工作流事实 |
| 项目 managed runtime | `.ai/harness/tools/local-repo-harness/`, `.ai/harness/bin/local-repo-harness`, `.ai/harness/runtime/local-repo-harness/` | 当前项目自己的 local-repo-harness 运行副本 |
| 项目 host adapter | `.codex/hooks.json`, `.claude/settings.json`, `.codex/config.toml`, `.mcp.json` | 当前项目自己的 Codex/Claude hooks 和 MCP 配置 |

不要把 `.ai/harness/tools/local-repo-harness/` 当成本仓库源码来改。那是下游项目里的安装副本。

## 不要先运行这些命令

如果目标是项目级安装，请不要先运行：

```bash
local-repo-harness init
local-repo-harness update
npx -y local-repo-harness init
bun add -g local-repo-harness
bunx skills add tw93/Waza -g
```

原因：

- `local-repo-harness init` 是广影响面的机器级 bootstrap 路径，会处理
  user-level hooks、skills、brain root 和 CodeGraph MCP。
- `local-repo-harness update` 刷新 user-level CLI/runtime，不负责刷新某个目标项目。
- `-g` 会把包、skills 或工具安装到用户级位置。

维护者仍可以使用这些机器级路径，但它们不是这个 README 的默认用户路径。

## 前置条件

目标项目需要：

- 已经是 Git 仓库。
- 能运行 `bash`。
- 已安装 Bun。
- 不要求目标项目根目录已有 `package.json`。

不要为了安装 local-repo-harness 而运行 `bun init -y`。它会生成
`README.md`、`index.ts`、`tsconfig.json` 等应用脚手架文件，容易污染非 JS 项目。

建议先从干净分支开始：

```bash
cd /path/to/target-project
git status --short
git checkout -b chore/adopt-local-repo-harness-project-scope
```

## Bun minimumReleaseAge

如果你的 Bun 启用了 `minimumReleaseAge`，刚发布的 `local-repo-harness`
可能会被拦截，报类似：

```text
all versions blocked by minimum-release-age
```

可以把包名加入 Bun release-age 白名单：

```toml
# ~/.bunfig.toml
[install]
minimumReleaseAge = 259200
minimumReleaseAgeExcludes = ["local-repo-harness"]
```

这是 Bun 的包管理器安全策略，不是 local-repo-harness 的 user-level hooks、
skills、MCP 或 brain 安装产物。

## 前 5 分钟

### 1. 安全 bootstrap

这一步只把持久 CLI runtime 安装到项目内，并落地最小 workflow contract。它不安装
项目 hooks、不安装 skills、不启用 CodeGraph。

```bash
cd /path/to/target-project
bunx --bun local-repo-harness@latest bootstrap \
  --repo "$PWD" \
  --host-adapter-scope none \
  --skill-scope none \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --vcs-profile project-local-install \
  --no-codegraph
```

需要固定项目内 managed runtime 版本时，不要使用 `bootstrap --version`；统一使用
`--package local-repo-harness@0.5.x`。

之后统一使用项目内 CLI：

```bash
./.ai/harness/bin/local-repo-harness --version
```

bootstrap 会把当前项目自己的 managed package runtime 放在
`.ai/harness/tools/local-repo-harness/`，不要把它当成本仓库源码来编辑。
默认情况下，bootstrap 还会建立 `project-local-install` local-only Git 边界：
安装产物、workflow state、hooks、skills、MCP 配置只留在本地；产品意图文档
默认保留为 tracked，不会被当成安装产物清掉。

### 2. 最小 dry-run

```bash
./.ai/harness/bin/local-repo-harness adopt --dry-run \
  --repo "$PWD" \
  --host-adapter-scope none \
  --skill-scope none \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --vcs-profile project-local-install \
  --no-codegraph
```

这个命令应该只预览项目内 workflow 文件。它不应该写：

- user hooks
- user skills
- user MCP config
- brain root
- `~/.repo-harness`
- `~/.codegraph`

### 3. 选择安装配方

配方 A：只安装 workflow contract。

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope none \
  --skill-scope none \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --vcs-profile project-local-install \
  --no-codegraph
```

配方 B：项目 hooks 加项目 repo-harness skills。

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode manifest-only \
  --vcs-profile project-local-install \
  --no-codegraph
```

配方 C：完整项目级安装，包含外部 skills 和 CodeGraph MCP。

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only \
  --vcs-profile project-local-install
```

配方 C 会：

- 写入 `.codex/hooks.json` 和 `.claude/settings.json`。
- 写入 `.agents/skills/repo-harness` 和 `.claude/skills/repo-harness`。
- 把 Waza、Mermaid、cross-review skills 写入项目 skill roots。
- 把 CodeGraph 安装到 `.ai/harness/tools/codegraph/`。
- 通过 `.ai/harness/bin/codegraph` 暴露项目级 CodeGraph 命令。
- 写入 `.codex/config.toml` 和 `.mcp.json`。
- 让 CodeGraph MCP env 包含 `CODEGRAPH_TELEMETRY=0`、`DO_NOT_TRACK=1`、
  `CODEGRAPH_INSTALL_DIR=.ai/harness/codegraph-runtime` 和 `CODEGRAPH_NO_DAEMON=1`。

如果暂时不需要 CodeGraph，继续使用 `--codegraph-mcp-scope none --no-codegraph`。

## 已有 package.json 的项目

如果目标项目本身已经有根 `package.json`，也可以先把 seed CLI 放进
`devDependencies`。这条路径必须先检查 package 边界，避免 Bun 上溯污染父目录。

```bash
cd /path/to/target-project
test -f package.json || {
  echo "ERROR: package.json missing; use the bootstrap recipe instead." >&2
  exit 1
}
bun add -d local-repo-harness@latest
bun --bun local-repo-harness bootstrap \
  --repo "$PWD" \
  --host-adapter-scope none \
  --skill-scope none \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --vcs-profile project-local-install \
  --no-codegraph
```

如果只是普通项目，不要为了这条路径创建 `package.json`。直接使用前面的
`bunx --bun local-repo-harness@latest bootstrap`。

## 安装后的目录地图

| 路径 | 作用 |
| --- | --- |
| `.ai/harness/workflow-contract.json` | workflow contract 入口 |
| `.ai/harness/policy.json` | 当前项目的 scope 决策 |
| `.ai/harness/bin/local-repo-harness` | project-managed CLI shim |
| `.ai/harness/bin/local-repo-harness-hook` | project-vendored hook entrypoint |
| `.ai/harness/runtime/local-repo-harness/` | project-vendored hook runtime |
| `.ai/harness/tools/local-repo-harness/` | project-managed package runtime |
| `.ai/harness/tools/codegraph/` | project-managed CodeGraph package |
| `.ai/harness/bin/codegraph` | project CodeGraph shim |
| `.ai/harness/codegraph-runtime/` | project-scoped CodeGraph install/runtime state |
| `.ai/harness/local-only-manifest.json` | local-only Git 边界清单 |
| `.git/info/exclude` | 本地 Git exclude；不提交到仓库 |
| `.codex/.gitignore`, `.agents/.gitignore`, `.claude/.gitignore`, `.ai/.gitignore` | 本地 overlay，用来兜底 `.gitignore` negation |
| `.codex/hooks.json` | Codex 项目 hooks adapter |
| `.claude/settings.json` | Claude 项目 hooks adapter |
| `.agents/skills/` | Codex 项目 skills root |
| `.claude/skills/` | Claude 项目 skills root |
| `.codex/config.toml` | Codex 项目 MCP config |
| `.mcp.json` | Claude 项目 MCP config |
| `.codegraph/` | CodeGraph 项目索引 |
| `_ops/` | ignored local operations state |

这些是安装产物或 runtime state，不等同于 `local-repo-harness` 源码仓库。
默认 `--vcs-profile project-local-install` 会让安装态和 workflow 治理态留在本机，
同时让 `docs/spec.md`、`docs/architecture/`、`docs/researches/` 等产品意图文档
保持 tracked。旧的 `--vcs-scope local` 只是兼容 shorthand，等价于
`--vcs-profile project-local-install`，不再表示 install/workflow/product-intent
三类全部 local。

VCS 判定顺序只有三层：

1. 根目录 `.gitignore` 是硬边界；项目作者忽略的路径，profile 和 whitelist
   都不能反向纳入 tracked。
2. `tracked_whitelist` / `--tracked-whitelist` 显式保留治理或意图文件。
3. `--vcs-profile` 提供默认 scopes。

没有 `local_only_whitelist`。如果团队明确要把 repo-harness 治理文件纳入产品仓库，
使用 `--vcs-profile tracked-governance` 或 `adopt --mode self-host`。

常见 profile：

| Profile | install | workflow | product intent | 场景 |
| --- | --- | --- | --- | --- |
| `project-local-install` | local | local | tracked | 默认公开项目友好模式 |
| `tracked-governance` | local | tracked | tracked | 团队要提交治理文件 |
| `ephemeral-agent-workspace` | local | local | local | 临时私有 agent workspace，`.agents/`、`.claude/`、`docs/`、`skills-lock.json` 全部留本地 |
| `self-host` | tracked | tracked | tracked | 维护 local-repo-harness 自身 |

使用 `ephemeral-agent-workspace` 时，治理和产品意图文件仍然是 Git local-only。
创建 contract worktree 时，`contract-worktree start` 会从主 worktree hydrate 一份安全的
本地 workflow context，让 `check-task-workflow --strict` 和 `verify-sprint` 能在 linked
worktree 内运行。这个 hydration 不是完整仓库复制，不会复制 managed tools、skills、
CodeGraph index、MCP/host adapter 配置、`_ops/`、cache、`node_modules/` 或 secrets。

选择 profile 时，先判断这三个问题：

| 问题 | 选项 |
| --- | --- |
| local-repo-harness 安装产物是否应该进 Git | 普通项目选 local；只有维护本仓库或明确 self-host 时才选 tracked |
| `plans/`、`tasks/`、`AGENTS.md` 这类治理文件是否要给团队共享 | 要共享选 `tracked-governance`；只服务本机 agent 工作流选 `project-local-install` |
| `docs/spec.md`、`docs/architecture/`、`docs/researches/` 这类产品意图是否要提交 | 普通项目保持 tracked；临时私有 agent workspace 才选 all-local |

Profile 不是一次性选项。你可以先用 `vcs audit` 预览另一个 profile 的效果：

```bash
./.ai/harness/bin/local-repo-harness vcs audit \
  --repo "$PWD" \
  --vcs-profile tracked-governance \
  --json
```

切换 profile 时，推荐复用你原来的安装配方，只替换 `--vcs-profile`。例如，配方 C
项目级完整安装要切到团队共享治理文件：

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only \
  --vcs-profile tracked-governance
```

如果这个目标项目只是临时 agent workspace，连 `.agents/`、`.claude/`、
`docs/` 和 `skills-lock.json` 也不准备提交：

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --host-adapter-scope project \
  --runtime project-vendored-bun \
  --skill-scope project \
  --external-tool-scope project \
  --codegraph-mcp-scope project \
  --sync-codegraph \
  --brain-mode manifest-only \
  --vcs-profile ephemeral-agent-workspace
```

如果你在维护 `local-repo-harness` 这类 self-host 仓库，才使用：

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --mode self-host \
  --vcs-profile self-host
```

切换后马上重新审计：

```bash
./.ai/harness/bin/local-repo-harness vcs audit \
  --repo "$PWD" \
  --vcs-profile tracked-governance \
  --json
git status --short --ignored --untracked-files=all
```

如果审计显示旧 profile 下曾经 `git add` 过的 local-only 路径，先 dry-run：

```bash
./.ai/harness/bin/local-repo-harness vcs cleanup \
  --repo "$PWD" \
  --vcs-profile tracked-governance \
  --dry-run
```

确认只会 `git rm --cached` 预期的 managed paths 后再应用：

```bash
./.ai/harness/bin/local-repo-harness vcs cleanup \
  --repo "$PWD" \
  --vcs-profile tracked-governance \
  --apply
```

`--vcs-scope local` 和 `--vcs-scope tracked` 只保留给旧脚本兼容。新文档和新命令
都应该优先使用 `--vcs-profile`，因为它能表达 install、workflow、product intent
三层的不同归属。

需要显式提交部分治理文件时：

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --vcs-profile project-local-install \
  --tracked-whitelist AGENTS.md,tasks/,plans/
```

## 验收：确认没有进入产品 Git 历史

项目级安装完成后先检查 local-only 边界：

```bash
./.ai/harness/bin/local-repo-harness vcs audit --repo "$PWD" --json
git status --short --ignored --untracked-files=all
```

期望：

- `vcs audit` 的 `safeToCommit` 是 `true`。
- `trackedLocalOnly`、`unignoredLocalOnly`、`requiresUserReview` 都为空。
- `git status` 不应把 `.ai/harness/tools/local-repo-harness/`、
  `.agents/skills/repo-harness/`、`.codex/hooks.json`、`.mcp.json` 等
  local-repo-harness 产物列为待提交文件。

如果之前误提交或 `git add` 过这些产物，先 dry-run：

```bash
./.ai/harness/bin/local-repo-harness vcs cleanup --repo "$PWD" --dry-run
```

确认只会执行 `git rm --cached` 后再应用：

```bash
./.ai/harness/bin/local-repo-harness vcs cleanup --repo "$PWD" --apply
```

cleanup 只从 Git index 移除 safe managed paths，不删除工作区文件。

## 验收：确认没有回退到用户级

如果这些路径原本不存在，安装后可以直接检查：

```bash
test ! -e "$HOME/.codex/hooks.json"
test ! -e "$HOME/.codex/config.toml"
test ! -e "$HOME/.codex/skills"
test ! -e "$HOME/.claude/settings.json"
test ! -e "$HOME/.claude.json"
test ! -e "$HOME/.claude/skills"
test ! -e "$HOME/.agents/skills"
test ! -e "$HOME/.repo-harness"
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
# 在这里运行 bootstrap 或项目内 adopt
snapshot_repo_harness_user_paths > /tmp/repo-harness-user-after.txt
diff -u /tmp/repo-harness-user-before.txt /tmp/repo-harness-user-after.txt
```

严格项目级安装下，diff 不应该显示 local-repo-harness 管理的 user-level hooks、
skills、MCP、brain 或 CodeGraph state 写入。

CodeGraph MCP 还应额外确认：

```bash
rg -n 'swarm-discussion-codex|/path/to/target-project' "$HOME/.codegraph/daemons" 2>/dev/null || true
```

正常情况下，项目级 MCP 配置带 `CODEGRAPH_NO_DAEMON=1` 后，不应为当前项目创建
`~/.codegraph/daemons/<id>.json`。

## 验收：确认功能可用

在目标项目运行：

```bash
./.ai/harness/bin/local-repo-harness status --json
./.ai/harness/bin/local-repo-harness doctor --json
./.ai/harness/bin/local-repo-harness vcs audit --repo "$PWD" --json
./.ai/harness/bin/local-repo-harness security scan --scope project --json
bash scripts/check-task-workflow.sh --strict
```

如果启用了外部工具和 CodeGraph：

```bash
bash scripts/check-agent-tooling.sh --json --host both
./.ai/harness/bin/local-repo-harness tools ensure codegraph --check --json --repo "$PWD"
```

期望结果：

- `status` 能看到 repo opt-in 和 project scope 状态。
- `doctor --json` 以项目级 readiness 为准。
- `local-only-vcs-boundary` 是 `ok`。
- `cli-on-path`、`codex-adapter`、`claude-adapter` 在 project intent 下可以是 `na`。
- `project-codex-adapter` 和 `project-claude-adapter` 是 `ok`。
- `mixed-scope-adapters` 在没有用户级残留时是 `ok`。
- `security scan` findings 为 0。
- CodeGraph 是 `source=local`，`global_fallback_used=false`。
- Codex/Claude CodeGraph MCP 都指向项目路径。

## Codex Desktop 和项目 hooks

项目级安装只负责写 `.codex/hooks.json`。Codex Desktop 还需要加载并信任该项目 hooks：

- Codex 打开的 workspace 必须是目标项目。
- 需要在 Codex Desktop 中信任目标项目的 `.codex/hooks.json`。
- 新开一个 Codex session 后再验证 hooks 是否触发。

不要因为项目 hooks 暂时没执行，就运行 `local-repo-harness init` 去注册
user-level hooks。那会改变隔离目标。

## 后续刷新

升级 `local-repo-harness` 后，先刷新项目内 managed runtime：

```bash
cd /path/to/target-project
bunx --bun local-repo-harness@latest bootstrap \
  --repo "$PWD" \
  --host-adapter-scope none \
  --skill-scope none \
  --external-tool-scope none \
  --codegraph-mcp-scope none \
  --brain-mode skip \
  --vcs-profile project-local-install \
  --no-codegraph
```

然后按当前选择重跑配方 A、B 或 C。这样可以把“刷新 local-repo-harness 自身”和
“启用 hooks/skills/CodeGraph”分开检查。

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

如果第三方工具不能项目级安装，local-repo-harness 应该报告失败，而不是回退到
global install。

### CodeGraph 看起来仍然依赖用户级命令

先确认当前目录就是目标项目根目录，然后执行：

```bash
./.ai/harness/bin/local-repo-harness tools ensure codegraph --repo "$PWD"
```

再重跑项目级 adopt：

```bash
./.ai/harness/bin/local-repo-harness adopt \
  --repo "$PWD" \
  --codegraph-mcp-scope project \
  --sync-codegraph
```

项目 `.codex/config.toml` 应优先使用 `./.ai/harness/bin/codegraph`。

### 项目里为什么有 `_ops/`

`_ops/` 是 ignored local operations state，用于 secrets、真实 env、provider
state、artifacts、logs 和 scratch files。可提交的运维资料放在 `deploy/`，
不要让 agent 编辑 `_ops/*`。

## Hook Authority Map

项目级 hooks 的权威边界：

- `.codex/hooks.json` 和 `.claude/settings.json` 是 host adapter。
- `.ai/harness/bin/local-repo-harness-hook` 是项目 hook entrypoint。
- `local-repo-harness-hook` 进入 CLI route registry。
- route registry 再调度 `.ai/hooks/` 或 package 内 hook assets。
- 计划、合同、review、checks 和 handoff 文件才是最终工作流事实。

更多 hook 操作细节见：

- `docs/reference-configs/hook-operations.md`
- `Generated vs Self-Hosted Hook Parity`

## 公开命令与技能入口

这些 action command skills 是公开入口：

- `repo-harness-plan`
- `repo-harness-review`
- `repo-harness-autoplan`
- `repo-harness-ship`
- `repo-harness-init`
- `repo-harness-scaffold`
- `repo-harness-migrate`
- `repo-harness-upgrade`
- `repo-harness-capability`
- `repo-harness-architecture`
- `repo-harness-handoff`
- `repo-harness-deploy`
- `repo-harness-repair`
- `repo-harness-check`
- `repo-harness-prd`
- `repo-harness-sprint`

内部步骤 `hooks-init`、`docs-init`、`create-project-dirs` 不是 public CLI
contract，也就是 not public。

想知道这些 skills 什么时候用、如何和 Waza、Mermaid、cross-review skills、
CodeGraph 搭配，请先读 [QUICK_START.md](QUICK_START.md)。

Sprint backlog row 的标准落地命令是：

```bash
./.ai/harness/bin/local-repo-harness sprint next --json
./.ai/harness/bin/local-repo-harness sprint execute-approved --body-file <approved-plan.md> --task <index-or-task>
```

这两个命令分别负责解析下一条 row、投射已批准的详细计划；row 完成仍然走
`plan -> contract -> worktree -> verify`。

## Verification

维护本仓库时，至少运行：

```bash
bun test
bun run check:release
```

涉及 skill 路由或 command surface 时，使用真实 eval 证据：

```bash
bun run benchmark:skills --eval route-workflow-check
```

不要把全 dry-run benchmark 当成 skill-effectiveness authority。

## Maintainer Reference

机器级安装脚本仍保留给维护者和明确需要 user-level runtime 的用户：

```bash
curl -fsSL https://raw.githubusercontent.com/automann/local-repo-harness/main/install.sh | sh
```

```powershell
irm https://raw.githubusercontent.com/automann/local-repo-harness/main/install.ps1 | iex
```

<details>
<summary>已经有 Bun 或 Node？包管理器路径仅作为维护者参考</summary>

```bash
bun add -g local-repo-harness@latest
npx -y local-repo-harness init
```

这些是 broad-impact machine bootstrap path，不是项目级安装默认路径。

</details>

模板组装示例：

```bash
bun scripts/assemble-template.ts --plan C --name "MyProject"
```

## 贡献归因

如果使用 Codex 参与提交，建议逐 commit 显式添加 commit trailer：

```text
Co-authored-by: codex <codex@openai.com>
```

这是 explicit commit trailer，也就是说不是 `not hidden hook automation`。

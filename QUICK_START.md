# Quick Start：如何使用 local-repo-harness 工作流

这份文档假设你已经按根目录 `README.md` 完成 project-scoped 安装，目标项目里已经有：

- `.ai/harness/`
- `.ai/harness/bin/local-repo-harness`
- `.codex/hooks.json` 或 `.claude/settings.json`
- `.agents/skills/` 或 `.claude/skills/`
- 可选的 `.ai/harness/bin/codegraph`
- local-only Git 边界已经建立：`.git/info/exclude` 和必要的本地 overlay
  `.gitignore` 会阻止安装产物进入产品提交

默认 `project-local-install` VCS profile 会把安装态和 workflow 治理态留在本地，
但产品意图文档默认仍可 tracked。根目录 `.gitignore` 是硬边界；
`tracked_whitelist` 只能显式保留治理/意图文件，不能覆盖项目作者的忽略规则。
没有 `local_only_whitelist`。

`README.md` 负责安装；本文件负责回答三个问题：

- 一件真实任务应该怎么在 repo-harness 工作流里推进。
- `repo-harness-*` action command skills 应该什么时候使用。
- Waza、Mermaid、cross-review skills、CodeGraph 应该怎样搭配，而不是互相替代。

## 一句话模型

repo-harness 的核心不是某个 hook 或某个 skill，而是把 agent 工作流变成项目里的可审查文件：

| 层级 | 作用 | 常见文件 |
| --- | --- | --- |
| 意图层 | 产品方向、PRD、Sprint、计划 | `plans/prds/`, `plans/sprints/`, `plans/plan-*.md` |
| 执行层 | 当前任务、合同、review、notes | `tasks/current.md`, `tasks/contracts/`, `tasks/reviews/`, `tasks/notes/` |
| 证据层 | 检查、运行输出、handoff | `.ai/harness/checks/`, `.ai/harness/runs/`, `.ai/harness/handoff/` |
| 辅助层 | hooks、skills、CodeGraph、外部工具 | `.codex/`, `.claude/`, `.agents/skills/`, `.codegraph/` |

技能和工具只负责推进流程；真正的事实以这些文件为准。

## 装好后的 10 分钟

先在目标项目根目录确认安装状态：

```bash
./.ai/harness/bin/local-repo-harness status --json
./.ai/harness/bin/local-repo-harness doctor --json
./.ai/harness/bin/local-repo-harness vcs audit --repo "$PWD" --json
bash scripts/check-agent-tooling.sh --json --host both
```

如果启用了 CodeGraph：

```bash
./.ai/harness/bin/local-repo-harness tools ensure codegraph --check --json --repo "$PWD"
./.ai/harness/bin/codegraph status .
```

然后按任务类型选择入口：

| 你要做什么 | 首选入口 | 外部工具搭配 |
| --- | --- | --- |
| 写一个产品需求或大功能说明 | `repo-harness-prd` | 需要事实核验时先补研究证据 |
| 把 PRD 拆成可执行阶段 | `repo-harness-sprint` | 每个 sprint row 执行前用 Waza `/think` 展开 |
| 做一个小到中等功能或修复计划 | Waza `/think` 或 `repo-harness-plan` | 计划定稿后 capture 到 `plans/` |
| 查 bug、回归、失败测试 | Waza `/hunt` | 用 CodeGraph 做影响面和调用链追踪 |
| 审查已有计划 | `repo-harness-review` | 必要时用 cross-review skills 做独立意见 |
| 实现后验收、准备合并 | Waza `/check` 和 `repo-harness-check` | cross-review 填 `External Acceptance Advice` |
| 修坏了的 harness 状态 | `repo-harness-repair` | 先复现，再最小修复 |
| 保存或恢复长任务上下文 | `repo-harness-handoff` | 只刷新 handoff，不替代检查 |

## 第一件任务怎么跑

### 1. 普通功能或文档改动

推荐流程：

1. 让 agent 使用 Waza `/think` 或 `repo-harness-plan` 先产出计划。
2. 计划必须有清晰范围、修改面、验证方式和回滚面。
3. 计划被明确批准后，进入实现。
4. 实现后运行项目检查。
5. 用 Waza `/check` 做 diff/evidence review。
6. 需要合并时使用 `repo-harness-ship`。

给 agent 的提示可以这样写：

```text
使用 repo-harness-plan 为这个改动制定计划。先读当前 repo 状态、tasks/current.md、
.ai/harness/policy.json，再给出一个可执行计划。不要开始实现，等我批准。
```

批准后：

```text
按已批准计划执行。实现后运行相关测试，填写 review 证据，并使用 Waza /check 语义审查改动。
```

### 2. Bug、回归、失败测试

不要从“直接修”开始。先让 agent 找到根因：

```text
使用 Waza /hunt 诊断这个失败。先复现，再给出根因句和证据。没有根因前不要改代码。
```

当 bug 涉及复杂代码路径时，加上 CodeGraph：

```text
先用 CodeGraph 查看相关 symbol 的 callers/callees/impact，再用 Waza /hunt 收敛根因。
报告 P1 架构边界、P2 具体数据流、P3 修复决策。
```

修复后：

```text
运行失败用例和相关回归测试，然后使用 Waza /check 审查 diff。把验证命令和结论写进任务证据。
```

### 3. 长功能、多个阶段或产品方向不清

推荐用 PRD -> Sprint -> 单任务计划：

1. `repo-harness-prd` 写 `plans/prds/*.prd.md`。
2. 用户审阅 PRD，明确哪些部分是 Approved。
3. `repo-harness-sprint from-prd <prd-file>` 生成 `plans/sprints/*.sprint.md`。
4. 每个 Sprint row 执行前，用 Waza `/think` 展开成具体计划。
5. 每个计划走 contract、review、checks、handoff 或 ship。

给 agent 的提示：

```text
使用 repo-harness-prd，把这个产品想法写成 plans/prds/ 下的 PRD。
事实不确定的地方标 [UNKNOWN] 或 [UNVERIFIED]，不要编造市场或 API 事实。
```

PRD 审过后：

```text
使用 repo-harness-sprint from-prd <PRD路径> 生成 Sprint backlog。
不要重新决定产品意图，只讨论切片顺序、依赖和可验收标准。
```

执行某个 sprint row：

```text
使用 repo-harness-sprint run。每次只取一个 pending row，用 Waza /think 展开，
再进入 plan -> contract -> worktree -> verify 流程。
```

## Action Command Skills 怎么选

这些 `repo-harness-*` 是 action command skills，不是普通 shell 命令。它们的作用是让 agent 进入对应的工作流协议。

| Skill | 什么时候用 | 主要产物 | 不该拿它做什么 |
| --- | --- | --- | --- |
| `repo-harness-prd` | 从产品想法生成上层需求 | `plans/prds/*.prd.md` | 不直接创建 Sprint 或开始实现 |
| `repo-harness-sprint` | 把 PRD 或大目标拆成有序 backlog | `plans/sprints/*.sprint.md` | 不同时跑多个 backlog row |
| `repo-harness-plan` | 做 repo-local workflow 或实现计划 | `plans/plan-*.md` | 默认不改实现文件 |
| `repo-harness-review` | 审查已有计划 | review findings | 不审已经写完的 diff；那用 `/check` |
| `repo-harness-autoplan` | 用户明确想让 agent 跑完整流程 | 计划、实现、检查、ship closeout | 不用于需求还不清楚的任务 |
| `repo-harness-check` | 验证 harness 或发布/合并 readiness | 检查结果、黄灯项 | 不自动修复 |
| `repo-harness-ship` | 实现完成后创建可审查 PR | commit、branch、draft PR | 不合并 PR、不发布 |
| `repo-harness-handoff` | 长任务换线程或换 session | `.ai/harness/handoff/*` | 不替代 review 和检查 |
| `repo-harness-repair` | harness 本身的 task sync、hooks、handoff、policy 出问题 | targeted fix | 不做大迁移、不脚手架新 app |
| `repo-harness-init` | 给已有 repo 安装或刷新 harness | workflow files | 不创建应用骨架 |
| `repo-harness-migrate` | 老 workflow 面迁移到当前 tasks-first 模型 | migrated/archived docs | 不删除不确定的用户内容 |
| `repo-harness-upgrade` | 已安装 harness 刷新到新 contract | manifest-owned updates | 不刷新 unrelated app code |
| `repo-harness-scaffold` | 新建项目或模块骨架 | app/module scaffold + harness | 不用于已有项目只安装 harness 的场景 |
| `repo-harness-capability` | 只新增某个目录/能力边界 | capability registry, local contracts | 不跑 full init/migrate |
| `repo-harness-architecture` | 处理架构 drift、模块文档、图 | architecture docs, Mermaid | 不全量刷新 harness |
| `repo-harness-deploy` | 只读检查 deploy/_ops 边界 | ops readiness report | 不部署、不发布、不打印 secrets |

## 外部 skills 和工具怎么搭配

### Waza

Waza 是日常开发的三件套：

| Waza route | 使用时机 | 输出要求 |
| --- | --- | --- |
| `/think` | 小/中型功能、修复方案、Sprint row 展开 | 可执行计划 |
| `/hunt` | bug、回归、失败测试、异常行为 | 根因句和证据 |
| `/check` | diff 审查、pre-merge、release follow-through | findings、验证和是否可通过 |
| `/health` | 工作流/工具状态检查 | 状态和修复建议 |

经验规则：

- 需求不清楚时，先 `repo-harness-prd` 或 `repo-harness-plan`，不要直接 `/think` 到实现。
- 有失败现象时，先 `/hunt`，不要跳到 `/check`。
- 声称完成前，必须有 `/check` 风格的 review 证据。

### CodeGraph

CodeGraph 用来减少盲读文件，尤其适合：

- 查 symbol 定义、调用者、被调用者。
- 评估改动影响面。
- 在大仓库里做 P1/P2 discovery。
- 帮助 agent 找到该读的文件，而不是全仓库乱扫。

常用命令：

```bash
./.ai/harness/bin/codegraph sync .
./.ai/harness/bin/codegraph context "<task>"
./.ai/harness/bin/codegraph callers <symbol> --json
./.ai/harness/bin/codegraph callees <symbol> --json
./.ai/harness/bin/codegraph impact <symbol> --json
```

边界：

- CodeGraph 不是测试选择器。
- CodeGraph 不替代 `tasks/`、`plans/`、架构文档或人工决策。
- project-scoped 安装下，MCP 应指向 `./.ai/harness/bin/codegraph`，不要回退到用户级 PATH。

### Mermaid

Mermaid 适合把架构理解固化成可审查文本：

- 模块边界图。
- 请求、事件、任务、数据流。
- hook route 或 agent workflow。
- Sprint 或 release 流程。

优先写 Markdown Mermaid fenced block；只有需要给人看 HTML 图时，再使用 `mermaid` 渲染。

### cross-review skills

cross-review skills 用于让另一个 agent runtime 做独立审查：

- Codex 会话里用 `claude-review`。
- Claude 会话里用 `codex-review`。

推荐时机：

- 大 diff 合并前。
- 涉及安全、数据、部署、hooks、MCP、安装脚本。
- Waza `/check` 通过但你还想要第二视角。
- `repo-harness-ship` 前需要 `External Acceptance Advice`。

边界：

- cross-review 是独立意见，不是自动通过。
- 缺 peer CLI 或超时，要记录为 unavailable evidence，不要当 pass。
- 它审的是当前 reviewable diff，包括 staged、unstaged、untracked 和 branch diff。

## 常见组合

### 新功能

```text
repo-harness-plan 或 Waza /think
-> 用户批准
-> 实现
-> 测试
-> Waza /check
-> repo-harness-check
-> repo-harness-ship
```

### Bug 修复

```text
Waza /hunt
-> CodeGraph callers/callees/impact
-> 最小修复计划
-> 实现
-> 复现用例和回归测试
-> Waza /check
```

### 大需求

```text
repo-harness-prd
-> 用户批准 PRD
-> repo-harness-sprint from-prd
-> 用户批准 Sprint
-> repo-harness-sprint run
-> 每个 row 用 Waza /think 展开
```

### 架构文档或图

```text
CodeGraph context/impact
-> repo-harness-architecture
-> Markdown Mermaid
-> 可选 mermaid HTML
-> check-architecture-sync
```

### 发布或合并

```text
repo-harness-check
-> Waza /check
-> cross-review
-> repo-harness-ship
```

### harness 本身坏了

```text
repo-harness-check
-> repo-harness-repair
-> 重跑失败检查
```

如果 inspector 显示是旧 workflow 面，不要用 repair 硬修，改用 `repo-harness-migrate`。

## 不要这样用

- 不要把 `repo-harness-scaffold` 用在已有项目上；已有项目用 `repo-harness-init` 或根 README 的 project-scoped adopt 配方。
- 不要把 `repo-harness-check` 当作自动修复；它负责判断 readiness。
- 不要跳过计划批准、review、验证证据，直接让 agent 说“完成”。
- 不要把 CodeGraph 查询结果当作测试结果。
- 不要让 project-scoped 安装回退到 `~/.codex`、`~/.claude`、`~/.agents` 或 `~/.codegraph/daemons`。
- 不要把 `.ai/harness/tools/local-repo-harness/`、`.agents/skills/repo-harness/`、
  `.codex/hooks.json`、`.mcp.json` 这类 local-repo-harness 安装产物提交到产品仓库。
- 不要编辑 `_ops/*`，那是 ignored local operations state。

## 每次完成前的最小检查

普通改动至少要能回答：

- 改了哪些文件，为什么这些文件在 scope 内。
- 执行了哪些验证命令，结果是什么。
- 是否更新了相关 `tasks/notes/`、`tasks/reviews/` 或 handoff。
- Waza `/check` 或等价 review 的结论是什么。
- 是否需要 cross-review；如果需要，`External Acceptance Advice` 是否已记录。

命令参考：

```bash
git status --short --branch
./.ai/harness/bin/local-repo-harness vcs audit --repo "$PWD" --json
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
./.ai/harness/bin/local-repo-harness doctor --json
```

如果 `vcs audit` 报告 tracked local-only paths，先看 dry-run：

```bash
./.ai/harness/bin/local-repo-harness vcs cleanup --repo "$PWD" --dry-run
```

确认只会 `git rm --cached` 后再执行：

```bash
./.ai/harness/bin/local-repo-harness vcs cleanup --repo "$PWD" --apply
```

如果要交给下一轮 agent：

```text
使用 repo-harness-handoff 刷新 handoff packet，并在最终回复里给出下一步。
```

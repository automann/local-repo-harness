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

## 目录

1. [一句话模型](#一句话模型) — repo-harness 的分层心智模型
2. [装好后先确认](#装好后先确认) — 安装状态与就绪检查
3. [VCS Profile 怎么选与切换](#vcs-profile-怎么选与切换) — 交付边界、切换与清理
4. [按任务选入口](#按任务选入口) — 任务类型到入口的路由表
5. [第一件任务怎么跑](#第一件任务怎么跑) — 普通改动 / Bug / 大需求
6. [执行 Sprint Backlog Row](#执行-sprint-backlog-row) — just-in-time 三步循环
7. [Action Command Skills 怎么选](#action-command-skills-怎么选) — `repo-harness-*` 速查表
8. [外部 skills 和工具怎么搭配](#外部-skills-和工具怎么搭配) — Waza / CodeGraph / Mermaid / cross-review
9. [常见组合](#常见组合) — 端到端流水线
10. [不要这样用](#不要这样用) — 反模式清单
11. [每次完成前的最小检查](#每次完成前的最小检查) — 收尾 checklist

## 一句话模型

repo-harness 的核心不是某个 hook 或某个 skill，而是把 agent 工作流变成项目里的可审查文件：

| 层级 | 作用 | 常见文件 |
| --- | --- | --- |
| 意图层 | 产品方向、PRD、Sprint、计划 | `plans/prds/`, `plans/sprints/`, `plans/plan-*.md` |
| 执行层 | 当前任务、合同、review、notes | `tasks/current.md`, `tasks/contracts/`, `tasks/reviews/`, `tasks/notes/` |
| 证据层 | 检查、运行输出、handoff | `.ai/harness/checks/`, `.ai/harness/runs/`, `.ai/harness/handoff/` |
| 辅助层 | hooks、skills、CodeGraph、外部工具 | `.codex/`, `.claude/`, `.agents/skills/`, `.codegraph/` |

技能和工具只负责推进流程；真正的事实以这些文件为准。

## 装好后先确认

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

上面的 `vcs audit` 会顺带报告当前 VCS profile 是否符合这个项目的交付方式。要确认
profile 选择、切换策略或清理残留 tracked 文件，见下一节《VCS Profile 怎么选与切换》。

## VCS Profile 怎么选与切换

常用 profile：

| Profile | 什么时候用 |
| --- | --- |
| `project-local-install` | 默认。安装产物和 workflow 治理态只留本地，产品意图文档可提交 |
| `tracked-governance` | 团队想把 `plans/`、`tasks/`、`AGENTS.md` 等治理文件一起提交 |
| `ephemeral-agent-workspace` | 临时/私有 agent workspace，`.agents/`、`.claude/`、`docs/`、`skills-lock.json` 都只留本地 |
| `self-host` | 维护 local-repo-harness 自身或明确要把 harness 治理框架纳入源码 |

如果使用 `ephemeral-agent-workspace`，这些治理和产品意图文件依然不会进 Git。
但创建 contract worktree 时，`contract-worktree start` 会从主 worktree hydrate 安全的
local workflow context，让 linked worktree 可以运行 strict workflow 和 sprint verification。
它不会复制 managed tools、skills、CodeGraph index、MCP/host adapter 配置、`_ops/`、
cache、`node_modules/` 或 secrets。

切换前先预览，不要盲目 apply：

```bash
./.ai/harness/bin/local-repo-harness vcs audit \
  --repo "$PWD" \
  --vcs-profile tracked-governance \
  --json
```

真正切换时，复用 README 里的原安装配方 A/B/C，只改 `--vcs-profile`。例如把完整
项目级安装切到团队共享治理文件：

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

切换后再跑：

```bash
./.ai/harness/bin/local-repo-harness vcs audit --repo "$PWD" --json
git status --short --ignored --untracked-files=all
```

如果有旧 profile 残留的 tracked local-only paths，先 dry-run，再 cleanup：

```bash
./.ai/harness/bin/local-repo-harness vcs cleanup \
  --repo "$PWD" \
  --vcs-profile tracked-governance \
  --dry-run
```

```bash
./.ai/harness/bin/local-repo-harness vcs cleanup \
  --repo "$PWD" \
  --vcs-profile tracked-governance \
  --apply
```

日常沟通里优先说 `--vcs-profile`，不要再用旧 shorthand `--vcs-scope` 描述新策略。
`--vcs-scope local` 等价于 `project-local-install`，`--vcs-scope tracked` 等价于
`self-host`。

## 按任务选入口

确认安装与交付边界后，按任务类型选择入口：

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
使用 repo-harness-sprint run。每次只取一个 pending row，先用 Waza /think 展开；
计划批准后，通过 local-repo-harness sprint execute-approved 进入
plan -> contract -> worktree -> verify 流程。
```

## 执行 Sprint Backlog Row

Sprint backlog 是有序路线图，不是一次性展开全部实现计划的地方。推荐节奏是
just-in-time：每次只处理一个 row，先展开成详细计划，批准后执行，完成后再回到
Sprint 文件选择下一行。

一条 Sprint row 对应一次 `plan -> contract -> worktree -> verify` 循环。不要同时
展开多个 row，也不要从 backlog row 直接跳进代码实现。

项目级安装后，优先使用项目内 shim：

```bash
./.ai/harness/bin/local-repo-harness sprint next --json
```

这条命令只解析下一条 pending row，不会编辑实现文件。计划被用户批准后，把批准后的
详细计划保存为一个临时 Markdown 文件，再执行：

```bash
./.ai/harness/bin/local-repo-harness sprint execute-approved \
  --body-file /path/to/approved-row-plan.md \
  --task <index-or-task> \
  --json
```

`execute-approved` 会 capture 计划，并根据 row 的 mode 投射到 inline 或
contract worktree 流程；它不是完成 row 的命令。row 的完成仍然要靠实现、review、
external acceptance、`verify-sprint` 和 `contract-worktree finish`。

### Step 1：把下一条 Row 展开成详细计划

Prompt template：

```text
你的任务：用 repo-harness-sprint 的 planning mode，把当前 active sprint 的下一条 pending row
展开成一个 decision-complete 详细计划。这一轮只规划，不实现——不要编辑实现文件、不要 capture plan、
不要创建 worktree。

第 1 步，运行并以输出为准：
./.ai/harness/bin/local-repo-harness sprint next --json

把返回的 sprintFile、rowIndex、task、mode、acceptance 作为本轮唯一任务来源。
若 sprintStatus 不是 Approved，或 pending=false：立即停止，只报告原因，不要继续规划。

第 2 步，读取上下文：sprintFile、Source PRD、docs/spec.md、tasks/current.md、.ai/harness/policy.json，
以及与该 row 相关的代码/文档。可用 CodeGraph 做结构定位，但不要把 CodeGraph 结果当作测试或验收证据。

第 3 步，用 $think 产出 detailed landing plan，必须包含：
- row 引用：sprintFile、rowIndex、task、mode
- scope / non-scope
- 可能触及的文件或模块
- 实施顺序
- acceptance command
- repo workflow checks
- 风险、回滚面、verification notes

收尾：把计划完整展示给我，然后停止等待我批准。这一条 row 只对应一次
plan -> contract -> worktree -> verify 循环；不要同时展开下一条 row。
```

### Step 2：按已批准计划执行当前 Row

Prompt template：

```text
你的任务：按已批准的详细计划，执行当前这一条 Sprint backlog row（只此一条，不要开始其他 row）。
保留无关本地变更——发现无关 dirty files 只报告并绕开，不要清理或重置。

第 1 步，把已批准计划完整写入一个临时 Markdown 文件，然后运行：
./.ai/harness/bin/local-repo-harness sprint execute-approved \
  --body-file <approved-plan.md> \
  --task <index-or-task> \
  --json

从输出读取 planFile、contractFile、reviewFile、notesFile、worktreePath，之后只沿用这些文件和
worktree 边界，不要另建第二套计划或合同。

第 2 步，按 row mode 执行：
- inline：在当前 worktree 内实现，并维护对应 plan/contract/review/notes 证据。
- contract：进入 worktreePath，在 contract worktree 内实现、验证并 finish。

第 3 步，严格按计划的 scope / non-scope 实现；把任务本地边界场景写进 contract——预期成功放
`commands_succeed`，预期失败放 `commands_fail`。不要把 `verify-sprint`、`check-task-workflow --strict`
或 `contract-worktree finish` 这类 repo workflow/meta gate 放进 `commands_succeed` / `commands_fail`；
它们要在 review terminal pass 后单独运行。`manual_checks` 只支持文档里的 verifier enum，
自定义人工判断写进 review notes。需要外部验收时用 cross-review skills 填写 External Acceptance Advice。
只有当 review 记录 `Status: Reviewed`、`Recommendation: pass` 且验证全部通过，才可进入 closeout。

收尾：报告 changed files、执行过的命令、verification results、blockers、row status，并明确给出
下一步——验证已通过则进入 Step 3 closeout，未通过则停在这里列出缺口。
```

### Step 3：关闭当前 Row，并准备下一条

Prompt template：

```text
你的任务：关闭当前 Sprint backlog row 并为下一条准备上下文（不要开始实现下一条 row）。

第 1 步，从磁盘重新读取 sprintFile、planFile、contractFile、reviewFile 和当前 git status，
不要依赖旧 session 记忆。若 verification 未通过：立即停止并报告缺口，不要把 row 标成完成。

第 2 步（verification 已通过时），确认 closeout 已落地：
- 当前 row 已标记完成，Plan cell 指向最终或 archived plan。
- Execution Log 记录了本次执行结果。
- 若是 contract worktree，确认 contract-worktree finish 已完成 merge/closeout。
- 若 closeout 未自动完成，只做最小必要的 sprint row 状态更新，并说明依据。

第 3 步，若 closeout 改变了 sprint/handoff/worktree/merge 状态，或 Step 2 的 workflow checks 不是在最终
主 worktree 状态下跑的，重跑：
./.ai/harness/bin/local-repo-harness run check-task-workflow --strict

若 strict check 提示 handoff/resume stale，先刷新 pair 再重跑：
./.ai/harness/bin/local-repo-harness run prepare-handoff closeout
./.ai/harness/bin/local-repo-harness run check-task-workflow --strict

第 4 步，运行：
./.ai/harness/bin/local-repo-harness sprint next --json

收尾：报告本 row 的最终状态、验证命令和结果、剩余风险，以及下一条 pending row 的 rowIndex/task/mode。
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
- `repo-harness-ship` 前需要 `External Acceptance Advice`；手动覆盖必须写成
  `External Acceptance: manual_override`、`External Source: manual-override`、
  `P1 blockers: none` 和具体的 `Manual Override:` 原因。

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
- Waza `/check` 或等价 review 是否已记录 `Status: Reviewed` 和 `Recommendation: pass`。
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

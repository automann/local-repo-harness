#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  REPO_ROOT="$(cd "$REPO_HARNESS_TARGET_REPO_ROOT" && pwd)"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel 2>/dev/null)"; then
  :
elif [[ "$SCRIPT_DIR" == */.ai/harness/scripts ]]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
cd "$REPO_ROOT"

usage() {
  cat <<'USAGE_EOF'
Usage:
  scripts/contract-worktree.sh start --plan <plan-file> [--path <worktree-path>] [--branch <branch-name>]
  scripts/contract-worktree.sh finish [--merge|--no-merge] [--target <branch>] [--message <commit-message>]
  scripts/contract-worktree.sh cleanup --slug <slug> [--target <branch>] [--dry-run]
  scripts/contract-worktree.sh status
USAGE_EOF
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

file_checksum() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    printf '__missing__'
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    cksum "$file" | awk '{print $1 ":" $2}'
  fi
}

plan_source_ref() {
  local plan_file="$1"
  [[ -f "$plan_file" ]] || return 1
  awk '/^> \*\*Source Ref\*\*:/ {sub(/^> \*\*Source Ref\*\*:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$plan_file" \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

plan_sprint_path() {
  local plan_file="$1"
  local source_ref sprint_path
  source_ref="$(plan_source_ref "$plan_file" || true)"
  case "$source_ref" in
    sprint:*#*)
      sprint_path="${source_ref#sprint:}"
      sprint_path="${sprint_path%%#*}"
      printf '%s' "$sprint_path"
      ;;
  esac
}

workflow_sync_paths_for_plan() {
  local plan_file="$1"
  local artifact_stem sprint_path
  artifact_stem="$(derive_artifact_stem_from_plan "$plan_file")"
  sprint_path="$(plan_sprint_path "$plan_file" || true)"

  [[ -z "$sprint_path" ]] || printf '%s\n' "$sprint_path"
  printf '%s\n' "$plan_file"
  printf '%s\n' "tasks/contracts/${artifact_stem}.contract.md"
  printf '%s\n' "tasks/reviews/${artifact_stem}.review.md"
  printf '%s\n' "tasks/notes/${artifact_stem}.notes.md"
  printf '%s\n' "tasks/todos.md"
  printf '%s\n' ".ai/harness/checks/latest.json"
  printf '%s\n' ".ai/harness/handoff/current.md"
  printf '%s\n' ".ai/harness/handoff/resume.md"
}

generated_helper_hydration_paths() {
  cat <<'EOF_HELPERS'
scripts/new-spec.sh
scripts/new-sprint.sh
scripts/new-plan.sh
scripts/capture-plan.sh
scripts/plan-to-todo.sh
scripts/contract-run.ts
scripts/contract-worktree.sh
scripts/ship-worktrees.sh
scripts/archive-workflow.sh
scripts/refresh-current-status.sh
scripts/prepare-handoff.sh
scripts/verify-contract.sh
scripts/summarize-failures.sh
scripts/verify-sprint.sh
scripts/sprint-backlog.sh
scripts/check-task-sync.sh
scripts/check-deploy-sql-order.sh
scripts/check-architecture-sync.sh
scripts/check-agent-tooling.sh
scripts/check-context-files.sh
scripts/check-brain-manifest.sh
scripts/sync-brain-docs.sh
scripts/check-skill-version.ts
scripts/select-agent-context-blocks.sh
scripts/ensure-task-workflow.sh
scripts/check-task-workflow.sh
scripts/maintenance-triage.sh
scripts/heartbeat-triage.sh
scripts/switch-plan.sh
scripts/workflow-contract.ts
scripts/inspect-project-state.ts
scripts/migrate-workflow-docs.ts
scripts/migrate-project-template.sh
scripts/capability-resolver.ts
scripts/architecture-event.ts
scripts/capability-config.ts
scripts/architecture-queue.sh
scripts/archive-architecture-request.sh
scripts/context-contract-sync.sh
scripts/workstream-sync.sh
scripts/prepare-codex-handoff.sh
scripts/codex-handoff-resume.sh
scripts/lib/js-runtime.sh
EOF_HELPERS
}

worktree_hydration_paths_for_plan() {
  local plan_file="$1"

  workflow_sync_paths_for_plan "$plan_file"
  cat <<'EOF_CONTEXT'
plans/archive/
plans/prds/
plans/sprints/
tasks/
docs/spec.md
docs/architecture/
docs/reference-configs/
docs/researches/
deploy/
.ai/context/
.ai/hooks/lib/
.ai/harness/policy.json
.ai/harness/workflow-contract.json
.ai/harness/local-only-manifest.json
.ai/harness/brain-manifest.json
.ai/harness/sprint/
.claude/templates/
AGENTS.md
CLAUDE.md
EOF_CONTEXT
  generated_helper_hydration_paths
}

worktree_context_dirs() {
  cat <<'EOF_DIRS'
plans/archive
plans/prds
plans/sprints
tasks/archive
tasks/contracts
tasks/reviews
tasks/notes
tasks/workstreams
docs/architecture
docs/architecture/domains
docs/architecture/modules
docs/architecture/requests
docs/architecture/snapshots
docs/architecture/diagrams
docs/reference-configs
docs/researches
deploy
deploy/env
deploy/scripts
deploy/submissions
deploy/runbooks
deploy/release-checklists
deploy/sql
.ai/context
.ai/harness
.ai/harness/checks
.ai/harness/failures
.ai/harness/handoff
.ai/harness/security
.ai/harness/planning
.ai/harness/architecture
.ai/harness/worktrees
.ai/harness/runs
.ai/harness/triage
.claude/templates
scripts
EOF_DIRS
}

is_safe_workflow_sync_path() {
  case "$1" in
    /*|*..*|.ai/harness/tools/*|.ai/harness/bin/*|.ai/harness/runtime/*|.ai/harness/codegraph-runtime/*|.agents/skills/*|.claude/skills/*|.codegraph/*|node_modules/*|*/node_modules/*|.codex/hooks.json|.codex/config.toml|.claude/settings.json|.mcp.json)
      return 1
      ;;
    plans/*|tasks/*|.ai/harness/checks/*|.ai/harness/handoff/*|.ai/harness/runs/*|.ai/harness/worktrees/*)
      return 0
      ;;
  esac
  return 1
}

is_denied_worktree_context_path() {
  case "$1" in
    ""|.|/*|..|../*|*/../*|.git|.git/*|_ops|_ops/*|.env|.env.*|*/.env|*/.env.*|node_modules|node_modules/*|*/node_modules|*/node_modules/*|.ai/harness/tools|.ai/harness/tools/*|.ai/harness/bin/codegraph|.ai/harness/runtime|.ai/harness/runtime/*|.ai/harness/codegraph-runtime|.ai/harness/codegraph-runtime/*|.agents/skills|.agents/skills/*|.claude/skills|.claude/skills/*|.codegraph|.codegraph/*|.codex/hooks.json|.codex/config.toml|.claude/settings.json|.mcp.json)
      return 0
      ;;
  esac
  return 1
}

is_generated_helper_hydration_path() {
  local wanted="$1"
  local helper_path
  while IFS= read -r helper_path; do
    [[ "$helper_path" == "$wanted" ]] && return 0
  done < <(generated_helper_hydration_paths)
  return 1
}

is_safe_worktree_hydration_path() {
  local rel="$1"

  is_denied_worktree_context_path "$rel" && return 1
  case "$rel" in
    plans|plans/*|tasks|tasks/*|docs/spec.md|docs/architecture|docs/architecture/*|docs/reference-configs|docs/reference-configs/*|docs/researches|docs/researches/*|deploy|deploy/*|.ai/context|.ai/context/*|.ai/hooks/lib|.ai/hooks/lib/*|.ai/harness/policy.json|.ai/harness/workflow-contract.json|.ai/harness/local-only-manifest.json|.ai/harness/brain-manifest.json|.ai/harness/sprint|.ai/harness/sprint/*|.ai/harness/checks|.ai/harness/checks/*|.ai/harness/failures|.ai/harness/failures/*|.ai/harness/handoff|.ai/harness/handoff/*|.ai/harness/security|.ai/harness/security/*|.ai/harness/planning|.ai/harness/planning/*|.ai/harness/architecture|.ai/harness/architecture/*|.ai/harness/worktrees|.ai/harness/worktrees/*|.ai/harness/runs|.ai/harness/runs/*|.ai/harness/triage|.ai/harness/triage/*|.claude/templates|.claude/templates/*|AGENTS.md|CLAUDE.md|scripts|scripts/lib|scripts/lib/js-runtime.sh)
      return 0
      ;;
  esac

  is_generated_helper_hydration_path "$rel"
}

write_workflow_sync_manifest() {
  local slug="$1"
  local plan_file="$2"
  local source_repo="$3"
  local manifest_file=".ai/harness/worktrees/${slug}.sync"
  local path checksum

  mkdir -p "$(dirname "$manifest_file")"
  : > "$manifest_file"
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    is_safe_workflow_sync_path "$path" || continue
    checksum="$(file_checksum "${source_repo}/${path}")"
    printf '%s\t%s\n' "$checksum" "$path" >> "$manifest_file"
  done < <(workflow_sync_paths_for_plan "$plan_file")
}

policy_get() {
  local jq_path="$1"
  local default_value="${2:-}"
  local value=""

  if [[ -f ".ai/harness/policy.json" ]] && command -v jq >/dev/null 2>&1; then
    value="$(jq -r "$jq_path // empty" ".ai/harness/policy.json" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

check_architecture_freshness() {
  local target_branch="$1"
  local mode

  if [[ -x "scripts/check-architecture-sync.sh" ]]; then
    bash "scripts/check-architecture-sync.sh" --target "$target_branch"
    return $?
  fi

  mode="$(policy_get '.architecture.freshness_gate' 'advisory')"
  if [[ "$mode" == "strict" ]]; then
    echo "contract-worktree: strict architecture freshness gate failed: missing scripts/check-architecture-sync.sh" >&2
    return 1
  fi

  echo "contract-worktree: WARN missing scripts/check-architecture-sync.sh; skipping advisory architecture freshness gate" >&2
  return 0
}

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"
LEGACY_ACTIVE_PLAN_MARKER=".claude/.active-plan"
ACTIVE_WORKTREE_MARKER=".ai/harness/active-worktree"

derive_slug_from_plan() {
  local plan_file="$1"
  local plan_base slug
  plan_base="$(basename "$plan_file")"
  slug="$(printf '%s' "$plan_base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  normalize_slug "${slug:-contract-task}"
}

derive_original_artifact_stem_from_plan() {
  local plan_file="$1"
  local plan_base stem
  plan_base="$(basename "$plan_file")"
  stem="$(printf '%s' "$plan_base" | sed -E 's/^plan-//; s/\.md$//')"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    printf '%s' "$stem"
  else
    derive_slug_from_plan "$plan_file"
  fi
}

is_transient_plan_slug() {
  case "$1" in
    think-plan-[0-9]*|codex-plan-[0-9]*|approved-plan-[0-9]*)
      return 0
      ;;
  esac
  return 1
}

derive_title_slug_from_plan() {
  local plan_file="$1"
  local title slug
  [[ -f "$plan_file" ]] || return 1
  title="$(awk '
    /^# Plan:[[:space:]]*/ {
      sub(/^# Plan:[[:space:]]*/, "")
      print
      exit
    }
  ' "$plan_file" | xargs)"
  [[ -n "$title" ]] || return 1
  slug="$(normalize_slug "$title")"
  [[ -n "$slug" ]] || return 1
  printf '%s' "$slug"
}

derive_artifact_stem_from_plan() {
  local plan_file="$1"
  local stem stamp slug title_slug
  stem="$(derive_original_artifact_stem_from_plan "$plan_file")"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    stamp="$(printf '%s' "$stem" | sed -E 's/^([0-9]{8}-[0-9]{4})-.+$/\1/')"
    slug="$(printf '%s' "$stem" | sed -E 's/^[0-9]{8}-[0-9]{4}-//')"
    if is_transient_plan_slug "$slug"; then
      title_slug="$(derive_title_slug_from_plan "$plan_file" || true)"
      if [[ -n "$title_slug" && "$title_slug" != "$slug" ]]; then
        printf '%s-%s' "$stamp" "$title_slug"
        return 0
      fi
    fi
    printf '%s' "$stem"
  else
    derive_slug_from_plan "$plan_file"
  fi
}

is_linked_worktree() {
  local git_dir
  git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
  [[ "$git_dir" == *".git/worktrees/"* ]]
}

find_worktree_for_branch() {
  local branch="$1"
  git worktree list --porcelain | awk -v branch_ref="refs/heads/${branch}" '
    $1 == "worktree" { path = $2; next }
    $1 == "branch" && $2 == branch_ref { print path; exit }
  '
}

default_worktree_path() {
  local slug="$1"
  local parent repo_name
  parent="$(dirname "$REPO_ROOT")"
  repo_name="$(basename "$REPO_ROOT")"
  printf '%s/%s-wt-%s' "$parent" "$repo_name" "$slug"
}

write_start_metadata() {
  local slug="$1"
  local plan_file="$2"
  local branch_name="$3"
  local worktree_path="$4"
  local base_branch="$5"
  local source_runtime_bin="${REPO_ROOT}/.ai/harness/bin/local-repo-harness"
  local metadata_dir=".ai/harness/worktrees"
  local metadata_file="${metadata_dir}/${slug}.json"
  local sync_manifest="${metadata_dir}/${slug}.sync"
  local hydration_manifest="${metadata_dir}/${slug}.hydration"

  [[ -x "$source_runtime_bin" ]] || source_runtime_bin=""
  mkdir -p "$metadata_dir"
  write_workflow_sync_manifest "$slug" "$plan_file" "$REPO_ROOT"
  cat > "$metadata_file" <<EOF_METADATA
{
  "slug": "$(json_escape "$slug")",
  "plan": "$(json_escape "$plan_file")",
  "branch": "$(json_escape "$branch_name")",
  "worktree": "$(json_escape "$worktree_path")",
  "source_repo": "$(json_escape "$REPO_ROOT")",
  "source_runtime_bin": "$(json_escape "$source_runtime_bin")",
  "base_branch": "$(json_escape "$base_branch")",
  "workflow_sync_manifest": "$(json_escape "$sync_manifest")",
  "worktree_hydration_manifest": "$(json_escape "$hydration_manifest")",
  "started_at": "$(date '+%Y-%m-%dT%H:%M:%S%z')"
}
EOF_METADATA
}

copy_plan_into_worktree() {
  local plan_file="$1"
  local worktree_path="$2"
  local target_plan="$worktree_path/$plan_file"

  mkdir -p "$(dirname "$target_plan")"
  cp "$plan_file" "$target_plan"
}

remove_copied_untracked_source_plan() {
  local plan_file="$1"
  local worktree_path="$2"

  if git ls-files --others --exclude-standard -- "$plan_file" | grep -Fxq "$plan_file" \
    && cmp -s "$plan_file" "$worktree_path/$plan_file"; then
    rm -f "$plan_file"
    echo "[ContractWorktree] Moved untracked source plan into contract worktree: $plan_file"
  fi
}

marker_points_to_plan() {
  local marker_file="$1"
  local plan_file="$2"
  local marker_plan

  [[ -f "$marker_file" ]] || return 1
  marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
  [[ "$marker_plan" == "$plan_file" || "$marker_plan" == "./$plan_file" ]]
}

clear_primary_markers_for_transferred_plan() {
  local plan_file="$1"

  if marker_points_to_plan "$ACTIVE_PLAN_MARKER" "$plan_file" \
    || marker_points_to_plan "$LEGACY_ACTIVE_PLAN_MARKER" "$plan_file"; then
    rm -f "$ACTIVE_PLAN_MARKER" "$LEGACY_ACTIVE_PLAN_MARKER" "$ACTIVE_WORKTREE_MARKER"
    echo "[ContractWorktree] Cleared primary active markers for transferred plan: $plan_file"
  fi
}

seed_project_runtime_bridge() {
  local worktree_path="$1"
  local source_bin="${REPO_ROOT}/.ai/harness/bin/local-repo-harness"
  local rel

  [[ -x "$source_bin" ]] || return 0

  mkdir -p "$worktree_path/.ai/harness/bin" "$worktree_path/.ai/harness"
  cat > "$worktree_path/.ai/harness/bin/local-repo-harness" <<EOF_BRIDGE
#!/bin/bash
set -euo pipefail
primary_bin="$(json_escape "$source_bin")"
if [[ ! -x "\$primary_bin" ]]; then
  echo "local-repo-harness worktree bridge: primary project runtime is missing: \$primary_bin" >&2
  echo "Run bootstrap/adopt in the primary repo, then recreate this contract worktree." >&2
  exit 127
fi
exec "\$primary_bin" "\$@"
EOF_BRIDGE
  chmod +x "$worktree_path/.ai/harness/bin/local-repo-harness"

  for rel in \
    ".ai/harness/policy.json" \
    ".ai/harness/workflow-contract.json" \
    ".ai/harness/local-only-manifest.json"; do
    if [[ -f "$REPO_ROOT/$rel" ]]; then
      mkdir -p "$(dirname "$worktree_path/$rel")"
      cp "$REPO_ROOT/$rel" "$worktree_path/$rel"
    fi
  done

  echo "[ContractWorktree] Seeded project runtime bridge: $worktree_path/.ai/harness/bin/local-repo-harness"
}

normalize_worktree_hydration_path() {
  local rel="${1#./}"
  while [[ "$rel" == */ ]]; do
    rel="${rel%/}"
  done
  printf '%s' "$rel"
}

record_worktree_hydration_manifest() {
  local manifest_file="$1"
  local checksum="$2"
  local role="$3"
  local rel="$4"

  printf '%s\t%s\t%s\n' "$checksum" "$role" "$rel" >> "$manifest_file"
}

seed_one_worktree_context_file() {
  local worktree_path="$1"
  local rel="$2"
  local manifest_file="$3"
  local role="$4"
  local source="$REPO_ROOT/$rel"
  local target="$worktree_path/$rel"
  local checksum

  is_safe_worktree_hydration_path "$rel" || {
    echo "[ContractWorktree] Warning: refusing to hydrate unsafe workflow context path: $rel" >&2
    return 0
  }
  if [[ -L "$source" ]]; then
    echo "[ContractWorktree] Warning: skipping symlink workflow context path: $rel" >&2
    return 0
  fi
  [[ -f "$source" ]] || return 0

  if [[ -e "$target" ]]; then
    if [[ -f "$target" ]] && cmp -s "$source" "$target"; then
      checksum="$(file_checksum "$source")"
      record_worktree_hydration_manifest "$manifest_file" "$checksum" "$role" "$rel"
      return 0
    fi
    if is_local_runtime_marker_path "$rel"; then
      :
    else
      echo "contract-worktree: hydrated workflow context already exists with different content: $rel" >&2
      return 1
    fi
  fi

  mkdir -p "$(dirname "$target")"
  cp "$source" "$target"
  checksum="$(file_checksum "$source")"
  record_worktree_hydration_manifest "$manifest_file" "$checksum" "$role" "$rel"
  echo "[ContractWorktree] Hydrated local workflow context: $rel"
}

seed_one_worktree_context_dir() {
  local worktree_path="$1"
  local rel="$2"
  local manifest_file="$3"
  local role="$4"
  local source="$REPO_ROOT/$rel"
  local target="$worktree_path/$rel"
  local nested nested_rel

  is_safe_worktree_hydration_path "$rel" || {
    echo "[ContractWorktree] Warning: refusing to hydrate unsafe workflow context dir: $rel" >&2
    return 0
  }
  if [[ -L "$source" ]]; then
    echo "[ContractWorktree] Warning: skipping symlink workflow context dir: $rel" >&2
    return 0
  fi

  mkdir -p "$target"
  record_worktree_hydration_manifest "$manifest_file" "__dir__" "$role" "$rel"
  [[ -d "$source" ]] || return 0

  while IFS= read -r nested; do
    [[ -n "$nested" ]] || continue
    case "$nested" in
      "$REPO_ROOT"/*)
        nested_rel="${nested#"$REPO_ROOT"/}"
        ;;
      *)
        echo "[ContractWorktree] Warning: skipping workflow context outside repo root: $nested" >&2
        continue
        ;;
    esac
    nested_rel="$(normalize_worktree_hydration_path "$nested_rel")"
    is_safe_worktree_hydration_path "$nested_rel" || continue
    mkdir -p "$worktree_path/$nested_rel"
    record_worktree_hydration_manifest "$manifest_file" "__dir__" "$role" "$nested_rel"
  done < <(find "$source" -type d -print 2>/dev/null)

  while IFS= read -r nested; do
    [[ -n "$nested" ]] || continue
    case "$nested" in
      "$REPO_ROOT"/*)
        nested_rel="${nested#"$REPO_ROOT"/}"
        ;;
      *)
        echo "[ContractWorktree] Warning: skipping workflow context outside repo root: $nested" >&2
        continue
        ;;
    esac
    nested_rel="$(normalize_worktree_hydration_path "$nested_rel")"
    seed_one_worktree_context_file "$worktree_path" "$nested_rel" "$manifest_file" "$role"
  done < <(find "$source" -type f -print 2>/dev/null)
}

seed_local_workflow_context() {
  local worktree_path="$1"
  local plan_file="$2"
  local slug="$3"
  local manifest_file="$worktree_path/.ai/harness/worktrees/${slug}.hydration"
  local rel source

  mkdir -p "$(dirname "$manifest_file")"
  : > "$manifest_file"

  while IFS= read -r rel; do
    rel="$(normalize_worktree_hydration_path "$rel")"
    [[ -n "$rel" && "$rel" != "$plan_file" ]] || continue
    source="$REPO_ROOT/$rel"
    if [[ -d "$source" && ! -L "$source" ]]; then
      seed_one_worktree_context_dir "$worktree_path" "$rel" "$manifest_file" "workflow-context"
    else
      seed_one_worktree_context_file "$worktree_path" "$rel" "$manifest_file" "workflow-context"
    fi
  done < <(worktree_hydration_paths_for_plan "$plan_file" | awk 'NF && !seen[$0]++')

  while IFS= read -r rel; do
    rel="$(normalize_worktree_hydration_path "$rel")"
    [[ -n "$rel" ]] || continue
    is_safe_worktree_hydration_path "$rel" || continue
    mkdir -p "$worktree_path/$rel"
    record_worktree_hydration_manifest "$manifest_file" "__dir__" "workflow-dir" "$rel"
  done < <(worktree_context_dirs)
}

start_worktree() {
  local plan_file=""
  local worktree_path=""
  local branch_name=""
  local run_plan_to_todo=1

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --plan)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --plan requires a value" >&2; exit 2; }
        plan_file="${2#./}"
        shift 2
        ;;
      --path)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --path requires a value" >&2; exit 2; }
        worktree_path="$2"
        shift 2
        ;;
      --branch)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --branch requires a value" >&2; exit 2; }
        branch_name="$2"
        shift 2
        ;;
      --no-plan-to-todo)
        run_plan_to_todo=0
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "contract-worktree: unknown start argument: $1" >&2
        usage
        exit 2
        ;;
    esac
  done

  [[ -n "$plan_file" ]] || { echo "contract-worktree: start requires --plan" >&2; exit 2; }
  [[ -f "$plan_file" ]] || { echo "contract-worktree: plan file not found: $plan_file" >&2; exit 2; }

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "contract-worktree: not inside a git repository" >&2
    exit 2
  fi

  if is_linked_worktree; then
    echo "[ContractWorktree] Already in a linked worktree: $REPO_ROOT"
    return 0
  fi

  local slug branch_prefix base_branch existing_worktree
  slug="$(derive_slug_from_plan "$plan_file")"
  branch_prefix="$(policy_get '.worktree_strategy.branch_prefix' 'codex/')"
  base_branch="$(policy_get '.worktree_strategy.base_branch' 'main')"
  branch_name="${branch_name:-${branch_prefix}${slug}}"
  worktree_path="${worktree_path:-$(default_worktree_path "$slug")}"

  existing_worktree="$(find_worktree_for_branch "$branch_name" || true)"
  if [[ -n "$existing_worktree" ]]; then
    worktree_path="$existing_worktree"
    echo "[ContractWorktree] Reusing existing worktree: $worktree_path"
  elif git show-ref --verify --quiet "refs/heads/$branch_name"; then
    git worktree add "$worktree_path" "$branch_name"
    echo "[ContractWorktree] Added worktree for existing branch: $worktree_path"
  else
    git worktree add "$worktree_path" -b "$branch_name" HEAD
    echo "[ContractWorktree] Created worktree: $worktree_path"
  fi

  copy_plan_into_worktree "$plan_file" "$worktree_path"
  seed_local_workflow_context "$worktree_path" "$plan_file" "$slug"
  remove_copied_untracked_source_plan "$plan_file" "$worktree_path"
  clear_primary_markers_for_transferred_plan "$plan_file"
  seed_project_runtime_bridge "$worktree_path"

  mkdir -p "$worktree_path/.ai/harness/worktrees"
  (
    cd "$worktree_path"
    write_start_metadata "$slug" "$plan_file" "$branch_name" "$worktree_path" "$base_branch"
    if [[ "$run_plan_to_todo" -eq 1 ]]; then
      if [[ -f "scripts/plan-to-todo.sh" ]]; then
        REPO_HARNESS_CONTRACT_WORKTREE=1 bash "scripts/plan-to-todo.sh" --plan "$plan_file"
      elif [[ -x ".ai/harness/bin/local-repo-harness" ]]; then
        REPO_HARNESS_CONTRACT_WORKTREE=1 ./.ai/harness/bin/local-repo-harness run plan-to-todo --plan "$plan_file"
      else
        echo "contract-worktree: no plan-to-todo helper available in linked worktree" >&2
        exit 1
      fi
    fi
  )

  echo "[ContractWorktree] Branch: $branch_name"
  echo "[ContractWorktree] Plan: $worktree_path/$plan_file"
}

status_worktree() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[ContractWorktree] Not in a git repository"
    return 0
  fi

  if is_linked_worktree; then
    echo "[ContractWorktree] linked worktree"
  else
    echo "[ContractWorktree] primary worktree"
  fi

  echo "branch: $(git branch --show-current 2>/dev/null || true)"
  echo "root: $REPO_ROOT"
}

is_local_runtime_marker_path() {
  case "$1" in
    .ai/harness/active-plan|.ai/harness/active-worktree|.claude/.active-plan)
      return 0
      ;;
  esac
  return 1
}

check_scope_against_contract() {
  local contract_file="$1"
  local changed_paths path blocked=0

  [[ -f "$contract_file" ]] || return 0
  if [[ ! -f ".ai/hooks/lib/workflow-state.sh" ]]; then
    return 0
  fi

  # shellcheck source=/dev/null
  . ".ai/hooks/lib/workflow-state.sh"

  changed_paths="$(
    git status --porcelain=v1 --untracked-files=all \
      | awk '{
          path = substr($0, 4)
          rename_idx = index(path, " -> ")
          if (rename_idx > 0) {
            path = substr(path, rename_idx + 4)
          }
          print path
        }'
  )"

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if is_local_runtime_marker_path "$path"; then
      continue
    fi
    if ! workflow_contract_allows_path "$contract_file" "$path"; then
      echo "[ContractWorktree] Changed path is outside active contract allowed_paths: $path" >&2
      blocked=1
    fi
  done <<< "$changed_paths"

  [[ "$blocked" -eq 0 ]]
}

clean_matching_untracked_target_files() {
  local target_worktree="$1"
  local source_branch="$2"
  local path tmp_file

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    tmp_file="$(mktemp)"
    if git -C "$target_worktree" show "${source_branch}:${path}" > "$tmp_file" 2>/dev/null \
      && cmp -s "$tmp_file" "$target_worktree/$path"; then
      rm -f "$target_worktree/$path"
      echo "[ContractWorktree] Removed matching untracked target file before merge: $path"
    fi
    rm -f "$tmp_file"
  done < <(git -C "$target_worktree" ls-files --others --exclude-standard)
}

clean_local_runtime_markers() {
  rm -f .ai/harness/active-plan .ai/harness/active-worktree .claude/.active-plan
}

run_workflow_helper() {
  local helper="$1"
  shift
  if [[ -f "scripts/${helper}.sh" ]]; then
    bash "scripts/${helper}.sh" "$@"
  elif [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$(dirname "$REPO_HARNESS_HELPER_SOURCE_PATH")/${helper}.sh" ]]; then
    bash "$(dirname "$REPO_HARNESS_HELPER_SOURCE_PATH")/${helper}.sh" "$@"
  elif [[ -x ".ai/harness/bin/local-repo-harness" ]]; then
    ./.ai/harness/bin/local-repo-harness run "$helper" "$@"
  else
    echo "contract-worktree: helper '$helper' is unavailable in this worktree" >&2
    return 1
  fi
}

latest_plan_for_slug() {
  local slug="$1"
  local latest
  latest="$(find plans -maxdepth 1 -type f -name "plan-*-${slug}.md" 2>/dev/null | sort | tail -1)"
  [[ -n "$latest" ]] || return 1
  printf '%s' "$latest"
}

archive_finished_workflow() {
  local plan_file="$1"

  [[ -n "$plan_file" ]] || { echo "contract-worktree: no active plan found to archive" >&2; exit 1; }
  [[ -f "$plan_file" ]] || { echo "contract-worktree: active plan not found for archive: $plan_file" >&2; exit 1; }

  echo "[ContractWorktree] Archiving completed workflow before merge: $plan_file"
  run_workflow_helper archive-workflow --plan "$plan_file" --outcome Completed
}

target_path_is_local_workflow() {
  local target_worktree="$1"
  local rel_path="$2"

  if git -C "$target_worktree" check-ignore -q -- "$rel_path" 2>/dev/null; then
    return 0
  fi

  # Local workflow files may be explicitly untracked rather than ignored. Treat
  # them as syncable only when neither side has the path in Git; tracked files
  # must travel through the normal fast-forward merge.
  if git ls-files --error-unmatch -- "$rel_path" >/dev/null 2>&1; then
    return 1
  fi
  ! git -C "$target_worktree" ls-files --error-unmatch -- "$rel_path" >/dev/null 2>&1
}

sync_one_local_workflow_artifact() {
  local target_worktree="$1"
  local rel_path="$2"
  local original_checksum="$3"
  local source_path="$PWD/$rel_path"
  local target_path="$target_worktree/$rel_path"
  local current_checksum

  [[ -f "$source_path" ]] || return 0
  is_safe_workflow_sync_path "$rel_path" || {
    echo "[ContractWorktree] Warning: refusing to sync unsafe workflow path: $rel_path" >&2
    return 0
  }
  target_path_is_local_workflow "$target_worktree" "$rel_path" || return 0

  if [[ -f "$target_path" ]] && cmp -s "$source_path" "$target_path"; then
    return 0
  fi

  current_checksum="$(file_checksum "$target_path")"
  if [[ "$current_checksum" != "$original_checksum" ]]; then
    echo "contract-worktree: local workflow artifact changed in target worktree; refusing to overwrite: $rel_path" >&2
    echo "contract-worktree: expected start checksum ${original_checksum}, current checksum ${current_checksum}" >&2
    return 1
  fi

  mkdir -p "$(dirname "$target_path")"
  cp "$source_path" "$target_path"
  echo "[ContractWorktree] Synced local workflow artifact: $rel_path"
}

sync_local_workflow_artifacts() {
  local slug="$1"
  local target_worktree="$2"
  local active_plan="$3"
  local sync_file=".ai/harness/worktrees/${slug}.sync"
  local checksum rel_path archived_plan archived_checksum archive_artifact

  [[ -f "$sync_file" ]] || return 0

  while IFS=$'\t' read -r checksum rel_path; do
    [[ -n "$rel_path" ]] || continue
    sync_one_local_workflow_artifact "$target_worktree" "$rel_path" "$checksum"
  done < "$sync_file"

  if [[ -n "$active_plan" ]]; then
    archived_plan="plans/archive/$(basename "$active_plan")"
    if [[ ! -f "$archived_plan" ]]; then
      archived_plan="$(find plans/archive -maxdepth 1 -type f -name "$(basename "$active_plan" .md)*.md" 2>/dev/null | sort | tail -1)"
    fi
    if [[ -n "$archived_plan" && -f "$archived_plan" ]]; then
      archived_checksum="__missing__"
      sync_one_local_workflow_artifact "$target_worktree" "$archived_plan" "$archived_checksum"
    fi

    while IFS= read -r archive_artifact; do
      [[ -n "$archive_artifact" ]] || continue
      sync_one_local_workflow_artifact "$target_worktree" "$archive_artifact" "__missing__"
    done < <(find tasks/archive -maxdepth 1 -type f -name "*-${slug}.md" 2>/dev/null | sort)
  fi
}

workflow_synced_paths_for_slug() {
  local slug="$1"
  local active_plan="$2"
  local sync_file=".ai/harness/worktrees/${slug}.sync"
  local checksum rel_path archived_plan archive_artifact

  if [[ -f "$sync_file" ]]; then
    while IFS=$'\t' read -r checksum rel_path; do
      [[ -n "$rel_path" ]] || continue
      printf '%s\n' "$rel_path"
    done < "$sync_file"
  fi

  if [[ -n "$active_plan" ]]; then
    archived_plan="plans/archive/$(basename "$active_plan")"
    if [[ ! -f "$archived_plan" ]]; then
      archived_plan="$(find plans/archive -maxdepth 1 -type f -name "$(basename "$active_plan" .md)*.md" 2>/dev/null | sort | tail -1)"
    fi
    [[ -n "$archived_plan" ]] && printf '%s\n' "$archived_plan"

    while IFS= read -r archive_artifact; do
      [[ -n "$archive_artifact" ]] || continue
      printf '%s\n' "$archive_artifact"
    done < <(find tasks/archive -maxdepth 1 -type f -name "*-${slug}.md" 2>/dev/null | sort)
  fi
}

status_path_from_porcelain() {
  local line="$1"
  local path="${line:3}"

  case "$line" in
    R*|C*)
      path="${path##* -> }"
      ;;
  esac

  printf '%s' "$path"
}

path_in_synced_workflow_set() {
  local slug="$1"
  local active_plan="$2"
  local wanted="$3"
  local candidate

  while IFS= read -r candidate; do
    [[ "$candidate" == "$wanted" ]] && return 0
  done < <(workflow_synced_paths_for_slug "$slug" "$active_plan")

  return 1
}

target_dirty_status_outside_synced_workflow() {
  local target_worktree="$1"
  local slug="$2"
  local active_plan="$3"
  local line rel_path

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    rel_path="$(status_path_from_porcelain "$line")"
    if is_safe_workflow_sync_path "$rel_path" \
      && path_in_synced_workflow_set "$slug" "$active_plan" "$rel_path" \
      && target_path_is_local_workflow "$target_worktree" "$rel_path"; then
      continue
    fi
    printf '%s\n' "$line"
  done < <(git -C "$target_worktree" status --porcelain=v1 --untracked-files=all)
}

finish_worktree() {
  local merge_back=1
  local target_branch
  local commit_message=""

  target_branch="$(policy_get '.worktree_strategy.merge_back.target' 'main')"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --merge)
        merge_back=1
        shift
        ;;
      --no-merge)
        merge_back=0
        shift
        ;;
      --target)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --target requires a value" >&2; exit 2; }
        target_branch="$2"
        shift 2
        ;;
      --message|-m)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --message requires a value" >&2; exit 2; }
        commit_message="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "contract-worktree: unknown finish argument: $1" >&2
        usage
        exit 2
        ;;
    esac
  done

  if ! is_linked_worktree; then
    echo "contract-worktree: finish must run from the linked contract worktree" >&2
    exit 1
  fi

  local current_branch slug active_plan contract_file review_file target_worktree artifact_stem dirty_status
  local external_status external_state external_reviewer external_source external_message
  current_branch="$(git branch --show-current)"
  [[ -n "$current_branch" ]] || { echo "contract-worktree: detached HEAD is not supported" >&2; exit 1; }
  [[ "$current_branch" != "$target_branch" ]] || { echo "contract-worktree: already on target branch $target_branch" >&2; exit 1; }
  slug="$(normalize_slug "${current_branch##*/}")"
  commit_message="${commit_message:-feat(contract): complete ${slug}}"

  if [[ -f ".ai/hooks/lib/workflow-state.sh" ]]; then
    # shellcheck source=/dev/null
    . ".ai/hooks/lib/workflow-state.sh"
    active_plan="$(get_active_plan || true)"
    if [[ -n "$active_plan" ]]; then
      contract_file="$(workflow_active_contract || true)"
      review_file="$(workflow_active_review || true)"
    fi
  fi

  if [[ -z "${active_plan:-}" ]]; then
    active_plan="$(latest_plan_for_slug "$slug" || true)"
  fi
  if [[ -n "${active_plan:-}" && -z "${contract_file:-}" ]]; then
    artifact_stem="$(derive_artifact_stem_from_plan "$active_plan")"
    if [[ -f "tasks/contracts/${artifact_stem}.contract.md" ]] || [[ ! -f "tasks/contracts/${slug}.contract.md" ]]; then
      contract_file="tasks/contracts/${artifact_stem}.contract.md"
    fi
  fi
  if [[ -n "${active_plan:-}" && -z "${review_file:-}" ]]; then
    artifact_stem="${artifact_stem:-$(derive_artifact_stem_from_plan "$active_plan")}"
    if [[ -f "tasks/reviews/${artifact_stem}.review.md" ]] || [[ ! -f "tasks/reviews/${slug}.review.md" ]]; then
      review_file="tasks/reviews/${artifact_stem}.review.md"
    fi
  fi
  contract_file="${contract_file:-tasks/contracts/${slug}.contract.md}"
  review_file="${review_file:-tasks/reviews/${slug}.review.md}"

  [[ -n "$contract_file" && -f "$contract_file" ]] || { echo "contract-worktree: no active sprint contract found" >&2; exit 1; }
  [[ -n "$review_file" && -f "$review_file" ]] || { echo "contract-worktree: no active sprint review found" >&2; exit 1; }

  if declare -F workflow_external_acceptance_status >/dev/null 2>&1; then
    external_status="$(workflow_external_acceptance_status "$review_file")"
    IFS=$'\t' read -r external_state external_reviewer external_source external_message <<< "$external_status"
    if [[ "$external_state" != "pass" && "$external_state" != "manual_override" ]]; then
      echo "contract-worktree: external acceptance gate failed: ${external_message:-missing external acceptance}" >&2
      echo "contract-worktree: record ## External Acceptance Advice in $review_file via $(workflow_external_acceptance_expected_source) before finish" >&2
      exit 1
    fi
  fi

  check_architecture_freshness "$target_branch"
  run_workflow_helper verify-sprint
  check_scope_against_contract "$contract_file"
  archive_finished_workflow "$active_plan"
  clean_local_runtime_markers
  backfill_sprint_backlog "$active_plan" || true

  if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    git add -A
    git commit -m "$commit_message"
  else
    echo "[ContractWorktree] No tracked changes to commit."
  fi

  if [[ "$merge_back" -eq 0 ]]; then
    echo "[ContractWorktree] Merge skipped by --no-merge."
    return 0
  fi

  target_worktree="$(find_worktree_for_branch "$target_branch" || true)"
  [[ -n "$target_worktree" ]] || { echo "contract-worktree: target branch has no checked-out worktree: $target_branch" >&2; exit 1; }

  clean_matching_untracked_target_files "$target_worktree" "$current_branch"
  sync_local_workflow_artifacts "$slug" "$target_worktree" "$active_plan"

  dirty_status="$(target_dirty_status_outside_synced_workflow "$target_worktree" "$slug" "$active_plan")"
  if [[ -n "$dirty_status" ]]; then
    echo "contract-worktree: target worktree is dirty, refusing merge: $target_worktree" >&2
    printf '%s\n' "$dirty_status" >&2
    exit 1
  fi

  git -C "$target_worktree" merge --ff-only "$current_branch"
  echo "[ContractWorktree] Merged $current_branch into $target_branch at $target_worktree"
}

# Warn-only sprint backlog back-fill: plans captured via sprint-backlog
# start-task carry "> **Source Ref**: sprint:<file>#<task>". After the
# workflow archives, flip that backlog row so the update merges with the
# slice. Any failure warns and never blocks finish.
backfill_sprint_backlog() {
  local plan_file="$1"
  local archived_plan source_ref sprint_path task_ref

  archived_plan="plans/archive/$(basename "$plan_file")"
  if [[ ! -f "$archived_plan" ]]; then
    # Archive may have renamed on collision (-vN suffix); fall back to the
    # newest archived file sharing the stem, then to the original path.
    archived_plan="$(find plans/archive -maxdepth 1 -type f -name "$(basename "$plan_file" .md)*.md" 2>/dev/null | sort | tail -1)"
  fi
  [[ -n "$archived_plan" && -f "$archived_plan" ]] || archived_plan="$plan_file"
  if [[ ! -f "$archived_plan" ]]; then
    echo "[ContractWorktree] Warning: cannot resolve archived plan for sprint back-fill: $plan_file" >&2
    return 0
  fi

  source_ref="$(awk '/^> \*\*Source Ref\*\*:/ {sub(/^> \*\*Source Ref\*\*:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$archived_plan" 2>/dev/null | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  case "$source_ref" in
    sprint:*#*)
      ;;
    *)
      return 0
      ;;
  esac

  # Split on the FIRST '#': the sprint path is slug-generated and cannot
  # contain '#', while the task name is free text and may.
  sprint_path="${source_ref#sprint:}"
  task_ref="${sprint_path#*#}"
  sprint_path="${sprint_path%%#*}"

  if run_workflow_helper sprint-backlog complete-task --sprint "$sprint_path" --task "$task_ref" --plan "$archived_plan"; then
    echo "[ContractWorktree] Sprint backlog updated: $sprint_path ($task_ref)"
  else
    echo "[ContractWorktree] Warning: sprint backlog back-fill failed for $sprint_path ($task_ref); update the row manually." >&2
  fi
  return 0
}

cleanup_worktree() {
  local slug=""
  local target_branch
  local dry_run=0

  target_branch="$(policy_get '.worktree_strategy.merge_back.target' 'main')"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --slug)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --slug requires a value" >&2; exit 2; }
        slug="$2"
        shift 2
        ;;
      --target)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --target requires a value" >&2; exit 2; }
        target_branch="$2"
        shift 2
        ;;
      --dry-run)
        dry_run=1
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "contract-worktree: unknown cleanup argument: $1" >&2
        usage
        exit 2
        ;;
    esac
  done

  [[ -n "$slug" ]] || { echo "contract-worktree: cleanup requires --slug" >&2; exit 2; }
  slug="${slug#codex/}"
  slug="$(normalize_slug "$slug")"
  [[ -n "$slug" ]] || { echo "contract-worktree: slug is empty after normalization" >&2; exit 2; }

  if is_linked_worktree; then
    echo "contract-worktree: cleanup must run from the target primary worktree, not a linked contract worktree" >&2
    exit 1
  fi

  local target_worktree current_root branch_prefix branch_name worktree_path metadata_file
  branch_prefix="$(policy_get '.worktree_strategy.branch_prefix' 'codex/')"
  branch_name="${branch_prefix}${slug}"
  metadata_file=".ai/harness/worktrees/${slug}.json"
  target_worktree="$(find_worktree_for_branch "$target_branch" || true)"
  [[ -n "$target_worktree" ]] || { echo "contract-worktree: target branch has no checked-out worktree: $target_branch" >&2; exit 1; }

  current_root="$(pwd -P)"
  target_worktree="$(cd "$target_worktree" && pwd -P)"
  if [[ "$current_root" != "$target_worktree" ]]; then
    echo "contract-worktree: cleanup must run from target worktree $target_worktree" >&2
    exit 1
  fi

  worktree_path="$(find_worktree_for_branch "$branch_name" || true)"
  if [[ -n "$worktree_path" ]]; then
    worktree_path="$(cd "$worktree_path" && pwd -P)"
    case "$current_root" in
      "$worktree_path"|"$worktree_path"/*)
        echo "contract-worktree: refusing to remove current working directory: $worktree_path" >&2
        exit 1
        ;;
    esac
  fi

  if git show-ref --verify --quiet "refs/heads/$branch_name"; then
    if ! git merge-base --is-ancestor "$branch_name" "$target_branch" >/dev/null 2>&1; then
      echo "contract-worktree: branch $branch_name is not fully merged into $target_branch; refusing cleanup" >&2
      exit 1
    fi
  else
    echo "[ContractWorktree] Branch already absent, skipping: $branch_name"
  fi

  if [[ -n "$worktree_path" ]]; then
    if [[ -n "$(git -C "$worktree_path" status --porcelain=v1 --untracked-files=all)" ]]; then
      echo "contract-worktree: linked worktree is dirty, refusing cleanup: $worktree_path" >&2
      echo "contract-worktree: pick/apply/commit useful changes first; scaffold-only discard belongs in scripts/ship-worktrees.sh --cleanup-merged --discard-scaffold-only" >&2
      exit 1
    fi
  else
    echo "[ContractWorktree] Worktree already absent, skipping: $branch_name"
  fi

  if [[ "$dry_run" -eq 1 ]]; then
    echo "[ContractWorktree] dry-run cleanup slug=$slug target=$target_branch"
    echo "[ContractWorktree] would remove worktree: ${worktree_path:-"(absent)"}"
    echo "[ContractWorktree] would delete branch: $branch_name"
    echo "[ContractWorktree] would remove metadata: $metadata_file"
    return 0
  fi

  if [[ -n "$worktree_path" ]]; then
    git worktree remove "$worktree_path"
    echo "[ContractWorktree] Removed worktree: $worktree_path"
  fi

  if git show-ref --verify --quiet "refs/heads/$branch_name"; then
    git branch -d "$branch_name"
    echo "[ContractWorktree] Deleted branch: $branch_name"
  fi

  if [[ -e "$metadata_file" ]]; then
    rm -f "$metadata_file"
    echo "[ContractWorktree] Removed metadata: $metadata_file"
  else
    echo "[ContractWorktree] Metadata already absent, skipping: $metadata_file"
  fi
}

command_name="${1:-status}"
shift || true

case "$command_name" in
  start)
    start_worktree "$@"
    ;;
  finish)
    finish_worktree "$@"
    ;;
  cleanup)
    cleanup_worktree "$@"
    ;;
  status)
    status_worktree
    ;;
  --help|-h|help)
    usage
    ;;
  *)
    echo "contract-worktree: unknown command: $command_name" >&2
    usage
    exit 2
    ;;
esac

#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

usage() {
  cat <<'USAGE_EOF'
Usage:
  scripts/sprint-backlog.sh init --slug <slug> [--title <title>]
  scripts/sprint-backlog.sh status
  scripts/sprint-backlog.sh next
  scripts/sprint-backlog.sh complete-task --task <index|task> [--plan <plan-file>]

Program-level sprint backlog helper. A Sprint is the program layer
(PRD + ordered backlog); each backlog task executes as one task-contract
slice through the existing plan -> contract -> worktree flow.
tasks/todo.md stays the deferred-goal ledger.

Exit codes: 0 success; 1 error; 2 usage error; 3 no pending backlog task (next).
USAGE_EOF
}

policy_file=".ai/harness/policy.json"

policy_get() {
  local jq_path="$1"
  local default_value="$2"

  if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
    local value
    value="$(jq -r "$jq_path // empty" "$policy_file" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

sprints_dir="$(policy_get '.sprints.dir' 'tasks/sprints')"
marker_file="$(policy_get '.sprints.active_marker_file' '.ai/harness/sprint/active-sprint')"
template_file="$(policy_get '.sprints.template_file' '.claude/templates/sprint.template.md')"

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

# Trim without xargs: xargs chokes on unbalanced quotes in user-edited text.
trim() {
  sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

extract_status() {
  local file="$1"
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | trim
}

active_sprint_file() {
  local sprint_file
  [[ -f "$marker_file" ]] || return 1
  sprint_file="$(trim < "$marker_file" 2>/dev/null)"
  [[ -n "$sprint_file" && -f "$sprint_file" ]] || return 1
  # Containment: the marker is repo-controlled, but complete-task rewrites the
  # file it points at, so never follow it outside the sprints dir.
  case "$sprint_file" in
    "$sprints_dir"/*) ;;
    *) return 1 ;;
  esac
  case "$sprint_file" in
    *..*) return 1 ;;
  esac
  printf '%s' "$sprint_file"
}

require_active_sprint() {
  local sprint_file
  if ! sprint_file="$(active_sprint_file)"; then
    echo "sprint-backlog: no active sprint (marker: $marker_file)" >&2
    exit 1
  fi
  printf '%s' "$sprint_file"
}

# Backlog rows live between '## Backlog' and the next '## ' heading:
# | 1 | [ ] | task-slug | contract | acceptance | plan |
# Output: index<TAB>status<TAB>task<TAB>mode<TAB>acceptance<TAB>plan
backlog_rows() {
  local file="$1"
  awk -F '|' '
    /^## Backlog[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    !in_section { next }
    /^\|[[:space:]]*[0-9]+[[:space:]]*\|/ {
      for (i = 2; i <= 7; i++) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $i)
      }
      printf "%s\t%s\t%s\t%s\t%s\t%s\n", $2, $3, $4, $5, $6, $7
    }
  ' "$file"
}

backlog_counts() {
  local file="$1"
  backlog_rows "$file" | awk -F '\t' '
    { total++ }
    $2 ~ /^\[[xX]\]$/ { done++ }
    END { printf "%d %d\n", done + 0, total + 0 }
  '
}

next_pending_row() {
  local file="$1"
  backlog_rows "$file" | awk -F '\t' '$2 == "[ ]" { print; exit }'
}

render_sprint_file() {
  local target="$1"
  local slug="$2"
  local title="$3"
  local timestamp="$4"

  if [[ ! -f "$template_file" ]]; then
    mkdir -p "$(dirname "$template_file")"
    cat > "$template_file" <<'SPRINT_TEMPLATE_EOF'
# Sprint: {{SPRINT_TITLE}}

> **Status**: Draft
> **Slug**: {{SPRINT_SLUG}}
> **Created**: {{TIMESTAMP}}
> **Updated**: {{TIMESTAMP}}
> **Source Spec**: `docs/spec.md`
> **Goal Mode**: incremental

Program-level sprint container. The PRD and ordered backlog decompose product
intent into task-contract slices; each backlog task executes through the
existing plan -> contract -> worktree -> verify flow. `tasks/todo.md` stays the
deferred-goal ledger and never carries this backlog.

## PRD

### Problem

- ...

### Users

- ...

### Success Criteria

- ...

### Acceptance Scenarios

- ...

### Non-goals

- ...

## Architecture Notes

### Capabilities Touched

- ...

### Dependency Order

- ...

### Risks

- ...

## Backlog

Ordered execution queue; keep rows in dependency order. Mode `contract` runs
the full plan -> contract -> worktree flow; `inline` allows primary-tree
execution for small tasks. Every row needs a concrete acceptance line.

| # | Status | Task | Mode | Acceptance | Plan |
|---|--------|------|------|------------|------|
| 1 | [ ] | {{SPRINT_SLUG}}-task-1 | contract | Replace with a machine-checkable acceptance line | (pending) |

## Execution Log

Keep this section last; `scripts/sprint-backlog.sh complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
SPRINT_TEMPLATE_EOF
  fi

  # Literal placeholder replacement via index/substr: sed/gsub replacement
  # strings treat |, &, \ and newlines as metacharacters, so free-text titles
  # must never reach them. Render to a temp file so a failure cannot leave a
  # half-written sprint file behind.
  local tmp_file
  tmp_file="$(mktemp)"
  if ! SPRINT_SLUG="$slug" SPRINT_TITLE="$title" SPRINT_TS="$timestamp" awk '
    function replace_all(line, ph, val,    out, i) {
      out = ""
      while ((i = index(line, ph)) > 0) {
        out = out substr(line, 1, i - 1) val
        line = substr(line, i + length(ph))
      }
      return out line
    }
    {
      line = $0
      line = replace_all(line, "{{SPRINT_SLUG}}", ENVIRON["SPRINT_SLUG"])
      line = replace_all(line, "{{SPRINT_TITLE}}", ENVIRON["SPRINT_TITLE"])
      line = replace_all(line, "{{TIMESTAMP}}", ENVIRON["SPRINT_TS"])
      print line
    }
  ' "$template_file" > "$tmp_file"; then
    rm -f "$tmp_file"
    echo "sprint-backlog: failed to render sprint template" >&2
    exit 1
  fi
  mv "$tmp_file" "$target"
}

cmd_init() {
  local slug=""
  local title=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --slug)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --slug requires a value" >&2; exit 2; }
        slug="$2"
        shift 2
        ;;
      --title)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --title requires a value" >&2; exit 2; }
        title="$2"
        shift 2
        ;;
      *)
        echo "sprint-backlog: unknown init argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  [[ -n "$slug" ]] || { echo "sprint-backlog: init requires --slug" >&2; usage >&2; exit 2; }
  slug="$(normalize_slug "$slug")"
  [[ -n "$slug" ]] || { echo "sprint-backlog: slug is empty after normalization" >&2; exit 2; }
  [[ -n "$title" ]] || title="$slug"
  # Headings are single-line; fold control characters out of free-text titles.
  title="$(printf '%s' "$title" | tr '\n\r\t' '   ')"

  local existing existing_status
  if existing="$(active_sprint_file)"; then
    existing_status="$(extract_status "$existing")"
    case "$existing_status" in
      Done|Archived)
        ;;
      *)
        echo "sprint-backlog: active sprint already exists with status ${existing_status:-unknown}: $existing" >&2
        echo "sprint-backlog: complete or archive it before starting a new sprint" >&2
        exit 1
        ;;
    esac
  fi

  mkdir -p "$sprints_dir" "$(dirname "$marker_file")"

  local timestamp file_stamp sprint_file counter
  timestamp="$(date '+%Y-%m-%d %H:%M')"
  file_stamp="$(date +%Y%m%d-%H%M)"
  sprint_file="${sprints_dir}/${file_stamp}-${slug}.sprint.md"
  counter=2
  while [[ -e "$sprint_file" ]]; do
    sprint_file="${sprints_dir}/${file_stamp}-${slug}-v${counter}.sprint.md"
    counter=$((counter + 1))
  done

  render_sprint_file "$sprint_file" "$slug" "$title" "$timestamp"
  printf '%s' "$sprint_file" > "$marker_file"

  echo "Created draft sprint: $sprint_file"
  echo "Active sprint marker: $marker_file"
  echo "Fill PRD, Architecture Notes, and Backlog, then set Status to Approved before execution."
}

cmd_status() {
  local sprint_file status done total next_task
  if ! sprint_file="$(active_sprint_file)"; then
    echo "sprint: (none)"
    return 0
  fi

  status="$(extract_status "$sprint_file")"
  read -r done total <<<"$(backlog_counts "$sprint_file")"
  next_task="$(next_pending_row "$sprint_file" | awk -F '\t' '{ print $3 }')"

  echo "sprint: $sprint_file"
  echo "status: ${status:-unknown}"
  echo "tasks_done: $done"
  echo "tasks_total: $total"
  echo "next_task: ${next_task:-(none)}"
}

cmd_next() {
  local sprint_file row
  sprint_file="$(require_active_sprint)"
  row="$(next_pending_row "$sprint_file")"
  if [[ -z "$row" ]]; then
    echo "next_task: (none)"
    exit 3
  fi

  printf '%s\n' "$row" | awk -F '\t' '{
    printf "index: %s\ntask: %s\nmode: %s\nacceptance: %s\nplan: %s\n", $1, $3, $4, $5, $6
  }'
}

cmd_complete_task() {
  local task_ref=""
  local plan_file=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --task)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --task requires a value" >&2; exit 2; }
        task_ref="$2"
        shift 2
        ;;
      --plan)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --plan requires a value" >&2; exit 2; }
        plan_file="$2"
        shift 2
        ;;
      *)
        echo "sprint-backlog: unknown complete-task argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  [[ -n "$task_ref" ]] || { echo "sprint-backlog: complete-task requires --task" >&2; usage >&2; exit 2; }

  local sprint_file target_row target_index target_status target_task target_plan plan_cell match_count
  sprint_file="$(require_active_sprint)"

  # task_ref travels via ENVIRON (awk -v reprocesses backslash escapes).
  match_count="$(backlog_rows "$sprint_file" | TASK_REF="$task_ref" awk -F '\t' '$1 == ENVIRON["TASK_REF"] || $3 == ENVIRON["TASK_REF"] { count++ } END { print count + 0 }')"
  if [[ "$match_count" -eq 0 ]]; then
    echo "sprint-backlog: no backlog row matches task '$task_ref' in $sprint_file" >&2
    exit 1
  fi
  if [[ "$match_count" -gt 1 ]]; then
    echo "sprint-backlog: task reference '$task_ref' is ambiguous (${match_count} backlog rows match); fix duplicate indices or task names first" >&2
    exit 1
  fi

  target_row="$(backlog_rows "$sprint_file" | TASK_REF="$task_ref" awk -F '\t' '$1 == ENVIRON["TASK_REF"] || $3 == ENVIRON["TASK_REF"] { print; exit }')"

  target_index="$(printf '%s' "$target_row" | cut -f1)"
  target_status="$(printf '%s' "$target_row" | cut -f2)"
  target_task="$(printf '%s' "$target_row" | cut -f3)"
  target_plan="$(printf '%s' "$target_row" | cut -f6)"

  if [[ "$target_status" != "[ ]" ]]; then
    echo "sprint-backlog: backlog task '$target_task' (row $target_index) is already complete" >&2
    exit 1
  fi

  plan_cell="$target_plan"
  if [[ -n "$plan_file" ]]; then
    plan_cell="\`${plan_file}\`"
  fi

  local timestamp tmp_file
  timestamp="$(date '+%Y-%m-%d %H:%M')"
  tmp_file="$(mktemp)"
  # plan_cell and target_task travel via ENVIRON: awk -v reprocesses C
  # escapes, so a backslash in either would split or mismatch the table row.
  # The rewrite matches index AND task so a duplicate index can never flip a
  # different row than the one resolved above.
  if ! PLAN_CELL="$plan_cell" TARGET_TASK="$target_task" awk -F '|' -v target="$target_index" -v ts="$timestamp" '
    BEGIN { in_section = 0; rewritten = 0 }
    /^> \*\*Updated\*\*:/ {
      print "> **Updated**: " ts
      next
    }
    /^## Backlog[[:space:]]*$/ { in_section = 1; print; next }
    in_section && /^## / { in_section = 0 }
    {
      if (in_section && !rewritten && $0 ~ /^\|[[:space:]]*[0-9]+[[:space:]]*\|/) {
        idx = $2; task = $4; mode = $5; acceptance = $6
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", idx)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", task)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", mode)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", acceptance)
        if (idx == target && task == ENVIRON["TARGET_TASK"]) {
          printf "| %s | [x] | %s | %s | %s | %s |\n", idx, task, mode, acceptance, ENVIRON["PLAN_CELL"]
          rewritten = 1
          next
        }
      }
      print
    }
  ' "$sprint_file" > "$tmp_file"; then
    rm -f "$tmp_file"
    echo "sprint-backlog: failed to rewrite backlog row" >&2
    exit 1
  fi
  mv "$tmp_file" "$sprint_file"

  if ! grep -Eq '^## Execution Log[[:space:]]*$' "$sprint_file"; then
    {
      echo
      echo "## Execution Log"
      echo
      echo "| When | Task | Plan | Result |"
      echo "|------|------|------|--------|"
    } >> "$sprint_file"
  fi
  printf '| %s | %s | %s | done |\n' "$timestamp" "$target_task" "${plan_cell:-(none)}" >> "$sprint_file"

  local done total
  read -r done total <<<"$(backlog_counts "$sprint_file")"
  echo "Completed backlog task '$target_task' (row $target_index) in $sprint_file"
  echo "Backlog progress: ${done}/${total}"
  if [[ "$done" -eq "$total" ]]; then
    echo "All backlog tasks complete. Set the sprint Status to Done after review."
  fi
}

[[ $# -gt 0 ]] || { usage >&2; exit 2; }

command="$1"
shift

case "$command" in
  init)
    cmd_init "$@"
    ;;
  status)
    cmd_status "$@"
    ;;
  next)
    cmd_next "$@"
    ;;
  complete-task)
    cmd_complete_task "$@"
    ;;
  --help|-h|help)
    usage
    ;;
  *)
    echo "sprint-backlog: unknown command: $command" >&2
    usage >&2
    exit 2
    ;;
esac

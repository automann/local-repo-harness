#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  cd "$REPO_HARNESS_TARGET_REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
elif [[ "$SCRIPT_DIR" == */.ai/harness/scripts ]]; then
  cd "$SCRIPT_DIR/../../.."
else
  cd "$SCRIPT_DIR/.."
fi

usage() {
  cat <<'USAGE_EOF'
Usage:
  scripts/sprint-backlog.sh init --slug <slug> [--title <title>]
  scripts/sprint-backlog.sh status
  scripts/sprint-backlog.sh next [--json] [--sprint <file>]
  scripts/sprint-backlog.sh execute-approved --body-file <file> [--task <index|task>]
                                  [--slug <slug>] [--title <title>] [--sprint <file>]
                                  [--json] [--no-worktree] [--worktree] [--force]
  scripts/sprint-backlog.sh start-task [--task <index|task>] [--execute] [--force] [--sprint <file>]
  scripts/sprint-backlog.sh complete-task --task <index|task> [--plan <plan-file>] [--sprint <file>]

Program-level sprint backlog helper. PRDs live in plans/prds/ as the upper
planning layer; sprints live in plans/sprints/ as ordered execution backlogs.
Each backlog row is expanded with $think before the existing plan -> contract
-> worktree flow. tasks/todos.md stays the deferred-goal ledger.

start-task reserves the next (or named) pending backlog row and can capture a
thin plan seed. The coding agent must still use `$think` to expand the row into
a decision-complete plan before code edits.
--sprint overrides the active-sprint marker (still confined to the sprints
dir), which finish back-fill uses inside worktrees where the runtime marker
is absent.

Exit codes: 0 success; 1 error; 2 usage error; 3 no pending backlog task (next/start-task).
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

sprints_dir="$(policy_get '.sprints.dir' 'plans/sprints')"
marker_file="$(policy_get '.sprints.active_marker_file' '.ai/harness/sprint/active-sprint')"
template_file="$(policy_get '.sprints.template_file' '.claude/templates/sprint.template.md')"

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

# Trim without xargs: xargs chokes on unbalanced quotes in user-edited text.
trim() {
  sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
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

extract_status() {
  local file="$1"
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | trim
}

# Explicit sprint override (--sprint) for callers running where the runtime
# marker does not exist, e.g. finish back-fill inside a contract worktree.
sprint_override=""

sprint_file_under_sprints_dir() {
  local sprint_file="$1"
  local sprints_real sprint_dir_real

  case "$sprint_file" in
    "$sprints_dir"/*) ;;
    *) return 1 ;;
  esac
  case "$sprint_file" in
    *..*) return 1 ;;
  esac
  [[ -f "$sprint_file" ]] || return 1
  [[ ! -L "$sprint_file" ]] || return 1

  sprints_real="$(cd -P "$sprints_dir" 2>/dev/null && pwd)" || return 1
  sprint_dir_real="$(cd -P "$(dirname "$sprint_file")" 2>/dev/null && pwd)" || return 1
  case "$sprint_dir_real" in
    "$sprints_real"|"$sprints_real"/*) ;;
    *) return 1 ;;
  esac
}

active_sprint_file() {
  local sprint_file
  if [[ -n "$sprint_override" ]]; then
    sprint_file="$sprint_override"
  else
    [[ -f "$marker_file" ]] || return 1
    sprint_file="$(trim < "$marker_file" 2>/dev/null)"
  fi
  [[ -n "$sprint_file" ]] || return 1
  # Containment: the marker is repo-controlled, but complete-task rewrites the
  # file it points at, so never follow it outside the sprints dir.
  sprint_file_under_sprints_dir "$sprint_file" || return 1
  printf '%s' "$sprint_file"
}

require_active_sprint() {
  local sprint_file
  if ! sprint_file="$(active_sprint_file)"; then
    if [[ -n "$sprint_override" ]]; then
      echo "sprint-backlog: --sprint does not resolve to a sprint file under ${sprints_dir}: $sprint_override" >&2
    else
      echo "sprint-backlog: no active sprint (marker: $marker_file)" >&2
    fi
    exit 1
  fi
  printf '%s' "$sprint_file"
}

# Serialize read-modify-write mutations: two concurrent complete-task or
# start-task calls would otherwise both render from the same snapshot and the
# second mv would drop the first writer's update.
BACKLOG_LOCK_DIR=""

release_backlog_lock() {
  if [[ -n "$BACKLOG_LOCK_DIR" ]]; then
    rmdir "$BACKLOG_LOCK_DIR" 2>/dev/null || true
    BACKLOG_LOCK_DIR=""
  fi
}

acquire_backlog_lock() {
  local attempts=0
  BACKLOG_LOCK_DIR="$(dirname "$marker_file")/.backlog-lock"
  mkdir -p "$(dirname "$BACKLOG_LOCK_DIR")"
  until mkdir "$BACKLOG_LOCK_DIR" 2>/dev/null; do
    # Reclaim only when the stale dir actually goes away; a non-empty lock dir
    # must fall through to the timeout instead of hot-looping.
    if [[ -n "$(find "$BACKLOG_LOCK_DIR" -maxdepth 0 -mmin +1 2>/dev/null)" ]] \
      && rmdir "$BACKLOG_LOCK_DIR" 2>/dev/null; then
      echo "sprint-backlog: reclaiming stale backlog lock: $BACKLOG_LOCK_DIR" >&2
      continue
    fi
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge 100 ]]; then
      echo "sprint-backlog: timed out acquiring backlog lock: $BACKLOG_LOCK_DIR" >&2
      exit 1
    fi
    sleep 0.1
  done
  trap release_backlog_lock EXIT INT TERM
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
> **Source PRD**: (optional) `plans/prds/<prd>.prd.md`
> **Source Spec**: `docs/spec.md`
> **Goal Mode**: incremental

Program-level sprint container. The Source PRD summary and ordered backlog
decompose product intent into task-contract slices; each backlog row is a
long-task waypoint that must be expanded with `$think` before code edits.
`tasks/todos.md` stays the deferred-goal ledger and never carries this backlog.

## PRD

Summarize or link the upper-layer PRD here. Keep the full PRD in `plans/prds/`.

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
  local json=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json)
        json=1
        shift
        ;;
      --sprint)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --sprint requires a value" >&2; exit 2; }
        sprint_override="$2"
        shift 2
        ;;
      *)
        echo "sprint-backlog: unknown next argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  local sprint_file row sprint_status done total
  sprint_file="$(require_active_sprint)"
  sprint_status="$(extract_status "$sprint_file")"
  read -r done total <<<"$(backlog_counts "$sprint_file")"
  row="$(next_pending_row "$sprint_file")"
  if [[ -z "$row" ]]; then
    if [[ "$json" -eq 1 ]]; then
      printf '{\n'
      printf '  "sprintFile": "%s",\n' "$(json_escape "$sprint_file")"
      printf '  "sprintStatus": "%s",\n' "$(json_escape "${sprint_status:-unknown}")"
      printf '  "pending": false,\n'
      printf '  "tasksDone": %s,\n' "$done"
      printf '  "tasksTotal": %s,\n' "$total"
      printf '  "nextAction": "No pending backlog row remains. Review the sprint and set Status to Done when appropriate."\n'
      printf '}\n'
      exit 3
    fi
    echo "next_task: (none)"
    exit 3
  fi

  if [[ "$json" -eq 1 ]]; then
    printf '%s\n' "$row" | awk -F '\t' \
      -v sprint_file="$sprint_file" \
      -v sprint_status="${sprint_status:-unknown}" \
      -v done="$done" \
      -v total="$total" '
        function esc(value) {
          gsub(/\\/,"\\\\",value)
          gsub(/"/,"\\\"",value)
          gsub(/\t/,"\\t",value)
          gsub(/\r/,"\\r",value)
          gsub(/\n/,"\\n",value)
          return value
        }
        {
          printf "{\n"
          printf "  \"sprintFile\": \"%s\",\n", esc(sprint_file)
          printf "  \"sprintStatus\": \"%s\",\n", esc(sprint_status)
          printf "  \"pending\": true,\n"
          printf "  \"tasksDone\": %s,\n", done
          printf "  \"tasksTotal\": %s,\n", total
          printf "  \"rowIndex\": \"%s\",\n", esc($1)
          printf "  \"task\": \"%s\",\n", esc($3)
          printf "  \"mode\": \"%s\",\n", esc($4)
          printf "  \"acceptance\": \"%s\",\n", esc($5)
          printf "  \"plan\": \"%s\",\n", esc($6)
          printf "  \"planningPrompt\": \"%s\",\n", esc("Use repo-harness-sprint run planning mode for this one row, expand it with $think, and stop for approval before implementation.")
          printf "  \"nextAction\": \"%s\"\n", esc("Generate a just-in-time detailed plan for this row; after approval run local-repo-harness sprint execute-approved.")
          printf "}\n"
        }
      '
    return 0
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
      --sprint)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --sprint requires a value" >&2; exit 2; }
        sprint_override="$2"
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
  acquire_backlog_lock

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
    END { exit rewritten ? 0 : 1 }
  ' "$sprint_file" > "$tmp_file"; then
    rm -f "$tmp_file"
    echo "sprint-backlog: failed to rewrite backlog row (row not rewritten; check the table for malformed cells)" >&2
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

  clear_in_flight "$target_task"

  local done total
  read -r done total <<<"$(backlog_counts "$sprint_file")"
  echo "Completed backlog task '$target_task' (row $target_index) in $sprint_file"
  echo "Backlog progress: ${done}/${total}"
  if [[ "$done" -eq "$total" ]]; then
    echo "All backlog tasks complete. Set the sprint Status to Done after review."
  fi
}

# In-flight markers live under the gitignored runtime dir so duplicate
# start-task calls are refused without writing tracked files in the primary
# tree (contract rows must stay merge-pure until finish back-fills them).
in_flight_dir() {
  printf '%s/in-flight' "$(dirname "$marker_file")"
}

in_flight_marker_for() {
  printf '%s/%s' "$(in_flight_dir)" "$(normalize_slug "$1")"
}

task_in_flight() {
  [[ -f "$(in_flight_marker_for "$1")" ]]
}

record_in_flight() {
  mkdir -p "$(in_flight_dir)"
  printf '%s' "${2:-capturing}" > "$(in_flight_marker_for "$1")"
}

clear_in_flight() {
  rm -f "$(in_flight_marker_for "$1")" 2>/dev/null || true
}

# Drop markers whose backlog row is gone or already complete (finish back-fill
# runs in the worktree and cannot clean the primary tree's markers).
prune_in_flight_markers() {
  local file="$1"
  local marker task_slug keep _idx status task _rest
  [[ -d "$(in_flight_dir)" ]] || return 0
  for marker in "$(in_flight_dir)"/*; do
    [[ -e "$marker" ]] || continue
    task_slug="$(basename "$marker")"
    keep=0
    while IFS=$'\t' read -r _idx status task _rest; do
      if [[ "$(normalize_slug "$task")" == "$task_slug" && "$status" == "[ ]" ]]; then
        keep=1
        break
      fi
    done < <(backlog_rows "$file")
    [[ "$keep" -eq 1 ]] || rm -f "$marker"
  done
}

# Fill only the Plan cell of one backlog row (status untouched); used by
# start-task so the backlog shows in-flight work.
set_row_plan_cell() {
  local sprint_file="$1"
  local target_index="$2"
  local target_task="$3"
  local plan_cell="$4"
  local timestamp tmp_file
  timestamp="$(date '+%Y-%m-%d %H:%M')"
  tmp_file="$(mktemp)"
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
        idx = $2; status = $3; task = $4; mode = $5; acceptance = $6
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", idx)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", task)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", mode)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", acceptance)
        if (idx == target && task == ENVIRON["TARGET_TASK"]) {
          printf "| %s | %s | %s | %s | %s | %s |\n", idx, status, task, mode, acceptance, ENVIRON["PLAN_CELL"]
          rewritten = 1
          next
        }
      }
      print
    }
    END { exit rewritten ? 0 : 1 }
  ' "$sprint_file" > "$tmp_file"; then
    rm -f "$tmp_file"
    echo "sprint-backlog: failed to update backlog plan cell (row not rewritten; check the table for malformed cells)" >&2
    exit 1
  fi
  mv "$tmp_file" "$sprint_file"
}

cmd_start_task() {
  local task_ref=""
  local execute=0
  local force=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --task)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --task requires a value" >&2; exit 2; }
        task_ref="$2"
        shift 2
        ;;
      --execute)
        execute=1
        shift
        ;;
      --force)
        force=1
        shift
        ;;
      --sprint)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --sprint requires a value" >&2; exit 2; }
        sprint_override="$2"
        shift 2
        ;;
      *)
        echo "sprint-backlog: unknown start-task argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  local sprint_file sprint_status
  sprint_file="$(require_active_sprint)"
  sprint_status="$(extract_status "$sprint_file")"
  case "$sprint_status" in
    Approved|Executing)
      ;;
    *)
      echo "sprint-backlog: sprint status is ${sprint_status:-unknown}; approve the sprint before starting tasks" >&2
      exit 1
      ;;
  esac

  [[ -f "scripts/capture-plan.sh" ]] || { echo "sprint-backlog: scripts/capture-plan.sh not found" >&2; exit 1; }

  acquire_backlog_lock
  prune_in_flight_markers "$sprint_file"

  local target_row match_count candidate_task
  if [[ -n "$task_ref" ]]; then
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
  else
    # Auto-select skips rows that are already in flight so repeated runs walk
    # the queue instead of duplicating an active task.
    target_row=""
    while IFS= read -r candidate_row; do
      [[ -n "$candidate_row" ]] || continue
      candidate_task="$(printf '%s' "$candidate_row" | cut -f3)"
      if ! task_in_flight "$candidate_task"; then
        target_row="$candidate_row"
        break
      fi
    done < <(backlog_rows "$sprint_file" | awk -F '\t' '$2 == "[ ]"')
    if [[ -z "$target_row" ]]; then
      if [[ -n "$(next_pending_row "$sprint_file")" ]]; then
        echo "sprint-backlog: every pending backlog task is already in flight; finish one or rerun with --task <ref> --force" >&2
      fi
      echo "next_task: (none)"
      exit 3
    fi
  fi

  local target_index target_status target_task target_mode target_acceptance
  target_index="$(printf '%s' "$target_row" | cut -f1)"
  target_status="$(printf '%s' "$target_row" | cut -f2)"
  target_task="$(printf '%s' "$target_row" | cut -f3)"
  target_mode="$(printf '%s' "$target_row" | cut -f4)"
  target_acceptance="$(printf '%s' "$target_row" | cut -f5)"

  if [[ "$target_status" != "[ ]" ]]; then
    echo "sprint-backlog: backlog task '$target_task' (row $target_index) is already complete" >&2
    exit 1
  fi

  if task_in_flight "$target_task" && [[ "$force" -ne 1 ]]; then
    echo "sprint-backlog: backlog task '$target_task' is already in flight (recorded: $(cat "$(in_flight_marker_for "$target_task")" 2>/dev/null || printf 'capturing')); rerun with --force to restart it" >&2
    exit 1
  fi
  record_in_flight "$target_task" "capturing"

  # Do not hold the backlog lock across capture-plan: with --execute it can
  # run git worktree setup for minutes and the stale-reclaim would hand the
  # lock to a second writer.
  release_backlog_lock

  local body_file capture_output plan_path
  body_file="$(mktemp)"
  cat > "$body_file" <<BODY_EOF
# Sprint Task: ${target_task}

## Context

- Sprint: \`${sprint_file}\`
- Backlog row: ${target_index}
- Mode: ${target_mode}
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task \`${target_task}\` so that the acceptance line holds: ${target_acceptance}

## Planning Expansion

Before editing code, use \`\$think\` to expand this sprint row into a decision-complete implementation plan. The \`\$think\` pass should read the sprint file, preserve the acceptance line, name concrete files or commands, and produce the detailed \`plans/plan-*.md\` body that drives contract execution.

## Task Breakdown

- [ ] Run \`\$think\` for backlog task \`${target_task}\` using sprint \`${sprint_file}\` and acceptance: ${target_acceptance}
- [ ] Capture the approved \`\$think\` output with \`scripts/capture-plan.sh --source waza-think --source-ref sprint:${sprint_file}#${target_task}\`
- [ ] Verify acceptance: ${target_acceptance}
BODY_EOF

  local -a capture_args
  capture_args=(
    --slug "$target_task"
    --title "Sprint task: ${target_task}"
    --status Approved
    --source repo-harness-sprint
    --orchestration-kind sprint-task
    --source-ref "sprint:${sprint_file}#${target_task}"
    --body-file "$body_file"
  )
  if [[ "$execute" -eq 1 ]]; then
    capture_args+=(--execute)
  fi

  # Inline-mode rows execute in the primary tree: suppress the automatic
  # contract worktree for them.
  if [[ "$target_mode" == "inline" ]]; then
    capture_output="$(REPO_HARNESS_DISABLE_CONTRACT_WORKTREE=1 bash scripts/capture-plan.sh "${capture_args[@]}" 2>&1)" || {
      printf '%s\n' "$capture_output" >&2
      rm -f "$body_file"
      clear_in_flight "$target_task"
      echo "sprint-backlog: capture-plan failed for task '$target_task'" >&2
      exit 1
    }
  else
    capture_output="$(bash scripts/capture-plan.sh "${capture_args[@]}" 2>&1)" || {
      printf '%s\n' "$capture_output" >&2
      rm -f "$body_file"
      clear_in_flight "$target_task"
      echo "sprint-backlog: capture-plan failed for task '$target_task'" >&2
      exit 1
    }
  fi
  rm -f "$body_file"
  printf '%s\n' "$capture_output"

  plan_path="$(printf '%s\n' "$capture_output" | sed -nE 's/^Captured plan: (.+)$/\1/p' | head -1)"
  if [[ -z "$plan_path" ]]; then
    echo "sprint-backlog: warning: could not resolve captured plan path; backlog Plan cell unchanged" >&2
    return 0
  fi
  record_in_flight "$target_task" "$plan_path"

  if [[ "$target_mode" == "inline" ]]; then
    acquire_backlog_lock
    set_row_plan_cell "$sprint_file" "$target_index" "$target_task" "\`${plan_path}\`"
    echo "Backlog row ${target_index} ('${target_task}') now references ${plan_path}"
  else
    # Contract mode: the plan moves into a worktree branched from HEAD, so
    # writing the Plan cell here would dirty the primary tree and block the
    # eventual --ff-only merge back. The finish back-fill writes the row
    # (status + plan) atomically with the merged slice instead.
    echo "Backlog row ${target_index} ('${target_task}') stays (pending); contract-worktree finish back-fills the Plan cell after merge."
  fi
}

plan_artifact_stem_from_path() {
  local plan_file="$1"
  local base
  base="$(basename "$plan_file" .md)"
  printf '%s' "${base#plan-}"
}

run_capture_plan_helper() {
  if [[ -f "scripts/capture-plan.sh" ]]; then
    bash "scripts/capture-plan.sh" "$@"
  elif [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$(dirname "$REPO_HARNESS_HELPER_SOURCE_PATH")/capture-plan.sh" ]]; then
    bash "$(dirname "$REPO_HARNESS_HELPER_SOURCE_PATH")/capture-plan.sh" "$@"
  elif [[ -x ".ai/harness/bin/local-repo-harness" ]]; then
    ./.ai/harness/bin/local-repo-harness run capture-plan "$@"
  else
    echo "sprint-backlog: missing scripts/capture-plan.sh and .ai/harness/bin/local-repo-harness" >&2
    return 1
  fi
}

cmd_execute_approved() {
  local body_file=""
  local owned_body_file=""
  local task_ref=""
  local slug=""
  local title=""
  local json=0
  local no_worktree=0
  local force_worktree=0
  local force=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --body-file)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --body-file requires a value" >&2; exit 2; }
        body_file="$2"
        shift 2
        ;;
      --task)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --task requires a value" >&2; exit 2; }
        task_ref="$2"
        shift 2
        ;;
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
      --sprint)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --sprint requires a value" >&2; exit 2; }
        sprint_override="$2"
        shift 2
        ;;
      --json)
        json=1
        shift
        ;;
      --no-worktree)
        no_worktree=1
        shift
        ;;
      --worktree)
        force_worktree=1
        shift
        ;;
      --force)
        force=1
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "sprint-backlog: unknown execute-approved argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  if [[ "$no_worktree" -eq 1 && "$force_worktree" -eq 1 ]]; then
    echo "sprint-backlog: use either --worktree or --no-worktree, not both" >&2
    exit 2
  fi

  if [[ -n "$body_file" ]]; then
    [[ -f "$body_file" ]] || { echo "sprint-backlog: body file not found: $body_file" >&2; exit 1; }
  elif [[ ! -t 0 ]]; then
    owned_body_file="$(mktemp)"
    cat > "$owned_body_file"
    body_file="$owned_body_file"
  else
    echo "sprint-backlog: execute-approved requires --body-file or stdin" >&2
    exit 2
  fi

  if [[ -z "$(tr -d '[:space:]' < "$body_file")" ]]; then
    [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"
    echo "sprint-backlog: approved plan body is empty" >&2
    exit 1
  fi

  local sprint_file sprint_status
  sprint_file="$(require_active_sprint)"
  sprint_status="$(extract_status "$sprint_file")"
  if [[ "$sprint_status" != "Approved" ]]; then
    [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"
    echo "sprint-backlog: sprint status is ${sprint_status:-unknown}; approve the sprint before executing an approved row plan" >&2
    exit 1
  fi

  acquire_backlog_lock
  prune_in_flight_markers "$sprint_file"

  local target_row match_count candidate_row candidate_task
  if [[ -n "$task_ref" ]]; then
    match_count="$(backlog_rows "$sprint_file" | TASK_REF="$task_ref" awk -F '\t' '$1 == ENVIRON["TASK_REF"] || $3 == ENVIRON["TASK_REF"] { count++ } END { print count + 0 }')"
    if [[ "$match_count" -eq 0 ]]; then
      [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"
      echo "sprint-backlog: no backlog row matches task '$task_ref' in $sprint_file" >&2
      exit 1
    fi
    if [[ "$match_count" -gt 1 ]]; then
      [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"
      echo "sprint-backlog: task reference '$task_ref' is ambiguous (${match_count} backlog rows match); fix duplicate indices or task names first" >&2
      exit 1
    fi
    target_row="$(backlog_rows "$sprint_file" | TASK_REF="$task_ref" awk -F '\t' '$1 == ENVIRON["TASK_REF"] || $3 == ENVIRON["TASK_REF"] { print; exit }')"
  else
    target_row=""
    while IFS= read -r candidate_row; do
      [[ -n "$candidate_row" ]] || continue
      candidate_task="$(printf '%s' "$candidate_row" | cut -f3)"
      if ! task_in_flight "$candidate_task"; then
        target_row="$candidate_row"
        break
      fi
    done < <(backlog_rows "$sprint_file" | awk -F '\t' '$2 == "[ ]"')
    if [[ -z "$target_row" ]]; then
      [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"
      if [[ -n "$(next_pending_row "$sprint_file")" ]]; then
        echo "sprint-backlog: every pending backlog task is already in flight; finish one or rerun with --task <ref> --force" >&2
      fi
      echo "next_task: (none)"
      exit 3
    fi
  fi

  local target_index target_status target_task target_mode target_acceptance
  target_index="$(printf '%s' "$target_row" | cut -f1)"
  target_status="$(printf '%s' "$target_row" | cut -f2)"
  target_task="$(printf '%s' "$target_row" | cut -f3)"
  target_mode="$(printf '%s' "$target_row" | cut -f4)"
  target_acceptance="$(printf '%s' "$target_row" | cut -f5)"

  if [[ "$target_status" != "[ ]" ]]; then
    [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"
    echo "sprint-backlog: backlog task '$target_task' (row $target_index) is already complete" >&2
    exit 1
  fi

  if task_in_flight "$target_task" && [[ "$force" -ne 1 ]]; then
    [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"
    echo "sprint-backlog: backlog task '$target_task' is already in flight (recorded: $(cat "$(in_flight_marker_for "$target_task")" 2>/dev/null || printf 'capturing')); rerun with --force to restart it" >&2
    exit 1
  fi
  record_in_flight "$target_task" "capturing"
  release_backlog_lock

  [[ -n "$slug" ]] || slug="$target_task"
  [[ -n "$title" ]] || title="Sprint task: ${target_task}"

  local -a capture_args
  capture_args=(
    --slug "$slug"
    --title "$title"
    --status Approved
    --source waza-think
    --orchestration-kind sprint-task
    --source-ref "sprint:${sprint_file}#${target_task}"
    --body-file "$body_file"
    --execute
  )

  local disable_worktree=0
  if [[ "$no_worktree" -eq 1 || ( "$target_mode" == "inline" && "$force_worktree" -ne 1 ) ]]; then
    disable_worktree=1
  fi

  local capture_output plan_path artifact_stem contract_file review_file notes_file worktree_path branch next_action
  if [[ "$disable_worktree" -eq 1 ]]; then
    capture_output="$(REPO_HARNESS_DISABLE_CONTRACT_WORKTREE=1 run_capture_plan_helper "${capture_args[@]}" 2>&1)" || {
      printf '%s\n' "$capture_output" >&2
      [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"
      clear_in_flight "$target_task"
      echo "sprint-backlog: execute-approved failed for task '$target_task'" >&2
      exit 1
    }
  else
    capture_output="$(run_capture_plan_helper "${capture_args[@]}" 2>&1)" || {
      printf '%s\n' "$capture_output" >&2
      [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"
      clear_in_flight "$target_task"
      echo "sprint-backlog: execute-approved failed for task '$target_task'" >&2
      exit 1
    }
  fi
  [[ -z "$owned_body_file" ]] || rm -f "$owned_body_file"

  plan_path="$(printf '%s\n' "$capture_output" | sed -nE 's/^Captured plan: (.+)$/\1/p' | head -1)"
  if [[ -z "$plan_path" ]]; then
    clear_in_flight "$target_task"
    printf '%s\n' "$capture_output" >&2
    echo "sprint-backlog: could not resolve captured plan path" >&2
    exit 1
  fi

  artifact_stem="$(plan_artifact_stem_from_path "$plan_path")"
  contract_file="tasks/contracts/${artifact_stem}.contract.md"
  review_file="tasks/reviews/${artifact_stem}.review.md"
  notes_file="tasks/notes/${artifact_stem}.notes.md"
  worktree_path="$(printf '%s\n' "$capture_output" | sed -nE 's/^\[ContractWorktree\] (Created worktree|Reusing existing worktree|Added worktree for existing branch): (.+)$/\2/p' | tail -1)"
  branch="$(printf '%s\n' "$capture_output" | sed -nE 's/^\[ContractWorktree\] Branch: (.+)$/\1/p' | tail -1)"

  record_in_flight "$target_task" "$plan_path"

  if [[ "$disable_worktree" -eq 1 ]]; then
    acquire_backlog_lock
    set_row_plan_cell "$sprint_file" "$target_index" "$target_task" "\`${plan_path}\`"
    release_backlog_lock
    next_action="Implement this inline row in the current worktree, run its acceptance command, then close the row after verification."
  else
    next_action="Continue implementation in the contract worktree, run acceptance and review gates, then finish with contract-worktree finish."
  fi

  if [[ "$json" -eq 1 ]]; then
    printf '{\n'
    printf '  "sprintFile": "%s",\n' "$(json_escape "$sprint_file")"
    printf '  "rowIndex": "%s",\n' "$(json_escape "$target_index")"
    printf '  "task": "%s",\n' "$(json_escape "$target_task")"
    printf '  "mode": "%s",\n' "$(json_escape "$target_mode")"
    printf '  "acceptance": "%s",\n' "$(json_escape "$target_acceptance")"
    printf '  "planFile": "%s",\n' "$(json_escape "$plan_path")"
    printf '  "contractFile": "%s",\n' "$(json_escape "$contract_file")"
    printf '  "reviewFile": "%s",\n' "$(json_escape "$review_file")"
    printf '  "notesFile": "%s",\n' "$(json_escape "$notes_file")"
    printf '  "worktreePath": "%s",\n' "$(json_escape "${worktree_path:-}")"
    printf '  "branch": "%s",\n' "$(json_escape "${branch:-}")"
    printf '  "nextAction": "%s"\n' "$(json_escape "$next_action")"
    printf '}\n'
    return 0
  fi

  printf '%s\n' "$capture_output"
  echo "Sprint row execution prepared:"
  echo "  sprint: $sprint_file"
  echo "  row: $target_index"
  echo "  task: $target_task"
  echo "  mode: $target_mode"
  echo "  plan: $plan_path"
  echo "  contract: $contract_file"
  echo "  review: $review_file"
  echo "  notes: $notes_file"
  if [[ -n "$worktree_path" ]]; then
    echo "  worktree: $worktree_path"
  fi
  if [[ -n "$branch" ]]; then
    echo "  branch: $branch"
  fi
  echo "  next: $next_action"
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
  execute-approved)
    cmd_execute_approved "$@"
    ;;
  start-task)
    cmd_start_task "$@"
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

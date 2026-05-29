#!/bin/bash
# SessionStart context injector for compact-independent Codex resumes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

resume_file="$(workflow_resume_packet_file)"

resume_available() {
  [[ -f "$resume_file" ]] || return 1
  grep -Fq "<!-- generated-by: project-initializer codex-handoff-resume v1 -->" "$resume_file" || return 1
  grep -Fq "## Resume Prompt" "$resume_file"
}

resume_reason() {
  resume_available || return 1
  awk '/^\> \*\*Reason\*\*:/ {sub(/^.*\> \*\*Reason\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$resume_file" | xargs
}

context_budget_active() {
  local budget_file zone
  budget_file="$(workflow_context_budget_status_file)"
  [[ -s "$budget_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    zone="$(jq -r '.zone // empty' "$budget_file" 2>/dev/null || true)"
    [[ "$zone" == "orange" || "$zone" == "red" ]] && return 0
    return 1
  fi

  grep -Eq '"zone"[[:space:]]*:[[:space:]]*"(orange|red)"' "$budget_file"
}

active_plan_exists() {
  local plan_file status
  plan_file="$(get_active_plan || true)"
  [[ -n "$plan_file" && -f "$plan_file" ]] || return 1
  status="$(get_plan_status "$plan_file" | tr '[:upper:]' '[:lower:]')"
  case "$status" in
    approved|executing|review|reviewing|active|in-progress|in\ progress)
      return 0
      ;;
  esac
  return 1
}

active_todo_exists() {
  [[ -f "tasks/todo.md" ]] || return 1

  if grep -Eq '^\> \*\*Status\*\*:[[:space:]]*(Executing|Active|Review|Reviewing|In Progress)[[:space:]]*$' tasks/todo.md; then
    return 0
  fi

  if grep -Eq '^[[:space:]]*-[[:space:]]\[[[:space:]]\][[:space:]]+' tasks/todo.md \
    && ! grep -Fq "No active execution checklist" tasks/todo.md; then
    return 0
  fi

  return 1
}

handoff_section_has_signal() {
  local header="$1"
  local handoff_file
  handoff_file="$(workflow_handoff_file)"
  [[ -f "$handoff_file" ]] || return 1

  awk -v header="$header" '
    $0 == header { in_section = 1; next }
    /^## / && in_section { exit }
    in_section {
      line = $0
      gsub(/^[[:space:]-]+/, "", line)
      gsub(/[[:space:]]+$/, "", line)
      if (line == "" || line == "```" || line == "(none)" || line == "(none recorded)") {
        next
      }
      found = 1
    }
    END { exit found ? 0 : 1 }
  ' "$handoff_file"
}

resume_reason_active() {
  local reason
  reason="$(resume_reason)"
  case "$reason" in
    context-orange-zone|context-red-zone)
      return 0
      ;;
  esac
  return 1
}

capability_context_pending() {
  local queue_file=".ai/harness/capability-context/requests.jsonl"
  local pending_lines=""
  local pending_count="0"

  [[ -s "$queue_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    pending_count="$(jq -r 'select(.status == "pending") | .request_id' "$queue_file" 2>/dev/null | wc -l | xargs)"
    pending_lines="$(jq -r 'select(.status == "pending") | "- " + .capability_id + " <- `" + .path + "`"' "$queue_file" 2>/dev/null | sort -u | head -10 || true)"
  else
    pending_count="$(grep -c '"status":"pending"' "$queue_file" 2>/dev/null || true)"
    pending_lines="$(grep '"status":"pending"' "$queue_file" 2>/dev/null | head -10 | sed -E 's/^/- /' || true)"
  fi

  [[ "${pending_count:-0}" != "0" && -n "$pending_lines" ]] || return 1

  cat <<EOF_CONTEXT
# Capability Context Queue

Pending capability context requests detected (${pending_count}). Run:

\`\`\`bash
repo-harness capability-context sync --pending --apply
\`\`\`

Queued capabilities:
${pending_lines}
EOF_CONTEXT
}

context=""
if resume_available; then
  if context_budget_active \
    || active_plan_exists \
    || active_todo_exists \
    || handoff_section_has_signal "## Blockers" \
    || handoff_section_has_signal "## Changed Files" \
    || resume_reason_active; then
    context="$(awk 'length(total) < 12000 { total = total $0 "\n" } END { printf "%s", total }' "$resume_file")"
  fi
fi

pending_context="$(capability_context_pending || true)"
if [[ -n "$pending_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${pending_context}"
  else
    context="$pending_context"
  fi
fi

# Cross-review availability note for Codex. On the Codex host the hook dispatcher
# swallows prompt-guard's success stdout, so the per-moment [CrossReview] nudges
# emitted there never surface; deliver a one-time availability note here instead.
# On the Claude host prompt-guard handles the contextual nudges, so skip it.
if [[ "${HOOK_HOST:-}" == "codex" ]]; then
  cross_review_note="[CrossReview] For an independent cross-model second opinion (a different training distribution has non-overlapping blind spots), run /claude-review on a diff before merging, on a hard bug, or after writing a spec or tests. The agent decides when it is worth it."
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${cross_review_note}"
  else
    context="$cross_review_note"
  fi
fi

[[ -n "$context" ]] || exit 0

if command -v jq >/dev/null 2>&1; then
  jq -nc --arg context "$context" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: $context
    }
  }'
  exit 0
fi

printf '%s\n' "$context"

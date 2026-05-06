#!/bin/bash
# SessionStart context injector for compact-independent Codex resumes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

resume_file="$(workflow_resume_packet_file)"
[[ -f "$resume_file" ]] || exit 0
grep -Fq "<!-- generated-by: project-initializer codex-handoff-resume v1 -->" "$resume_file" || exit 0
grep -Fq "## Resume Prompt" "$resume_file" || exit 0

context="$(awk 'length(total) < 12000 { total = total $0 "\n" } END { printf "%s", total }' "$resume_file")"
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

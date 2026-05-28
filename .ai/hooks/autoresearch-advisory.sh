#!/bin/bash
# Autoresearch Advisory Hook — UserPromptSubmit and PostToolUse on Edit|Write
# Detects skill-optimization intent and SKILL.md edits, then routes to the
# agent-owned autoresearch loop without mutating files in the background.

set -eo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

latest_autoresearch_session() {
  find . -maxdepth 3 \
    \( -path './autoresearch-*/session.json' -o -path './autoresearch/autoresearch-*/session.json' \) \
    -type f -print 2>/dev/null |
    while IFS= read -r session_file; do
      mtime="$(stat -f '%m' "$session_file" 2>/dev/null || stat -c '%Y' "$session_file" 2>/dev/null || echo 0)"
      printf '%s\t%s\n' "$mtime" "${session_file#./}"
    done |
    sort -nr |
    awk 'NR == 1 { print $2 }'
}

session_status() {
  local session_file="$1"
  [[ -n "$session_file" && -f "$session_file" ]] || return 0

  if command -v jq >/dev/null 2>&1; then
    jq -r '.status // "unknown"' "$session_file" 2>/dev/null || true
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    SESSION_FILE="$session_file" bun -e '
      const fs = require("fs");
      const data = JSON.parse(fs.readFileSync(process.env.SESSION_FILE, "utf8"));
      process.stdout.write(String(data.status || "unknown"));
    ' 2>/dev/null || true
  fi
}

latest_score_line() {
  local session_file="$1"
  local results_file
  [[ -n "$session_file" ]] || return 0

  results_file="$(dirname "$session_file")/results.tsv"
  [[ -f "$results_file" ]] || return 0
  tail -n 1 "$results_file" 2>/dev/null || true
}

is_autoresearch_prompt() {
  local text="$1"
  printf '%s\n' "$text" | grep -qEi '(autoresearch|auto[- ]?research|optimi[sz]e[[:space:]].*(skill|hook|workflow)|benchmark[[:space:]].*(skill|prompt)|pressure-test[[:space:]].*skill|优化.*(skill|技能|hook|钩子|workflow|工作流)|跑.*autoresearch|SKILL\.md.*优化|优化.*SKILL\.md)'
}

is_skill_path() {
  local path="$1"
  [[ "$path" == "SKILL.md" || "$path" == */SKILL.md ]]
}

is_autoresearch_candidate_path() {
  local path="$1"
  [[ "$path" == autoresearch-*/candidates/*/SKILL.md || "$path" == */autoresearch-*/candidates/*/SKILL.md ]]
}

emit_route() {
  local reason="$1"
  local session_file status score_line

  session_file="$(latest_autoresearch_session)"
  status="$(session_status "$session_file")"
  score_line="$(latest_score_line "$session_file")"

  echo "[AutoresearchAdvisory] ${reason}"
  echo "  Route: use the autoresearch skill as an agent-run loop: baseline -> candidate copy -> binary evals -> record_experiment -> promote only winners."
  echo "  Guardrail: hooks may detect intent or point at state; hooks must not mutate SKILL.md, run hidden experiments, or promote candidates in the background."

  if [[ -n "$session_file" ]]; then
    echo "  Latest session: ${session_file}${status:+ (status: ${status})}"
    [[ -n "$score_line" ]] && echo "  Latest score line: ${score_line}"
  else
    echo "  Latest session: none found; initialize one before mutation when this is skill optimization."
  fi
}

PROMPT_TEXT="$(hook_get_prompt "${1:-}")"
FILE_PATH="$(hook_get_file_path "${1:-}")"

if [[ -n "$PROMPT_TEXT" ]] && is_autoresearch_prompt "$PROMPT_TEXT"; then
  emit_route "Autoresearch or skill-optimization intent detected."
  exit 0
fi

if [[ -n "$FILE_PATH" ]] && is_autoresearch_candidate_path "$FILE_PATH"; then
  emit_route "Autoresearch candidate SKILL.md edited; record the experiment before deciding keep/discard."
  exit 0
fi

if [[ -n "$FILE_PATH" ]] && is_skill_path "$FILE_PATH"; then
  emit_route "SKILL.md edited; if this was prompt/skill optimization, keep the autoresearch evidence trail current."
fi

#!/bin/bash
# Shared hook dispatcher that resolves the repo root once before invoking a hook.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${HOOK_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
HOOK_NAME="${1:-}"

if [[ -z "$HOOK_NAME" ]]; then
  echo "[HookRunner] Missing hook name." >&2
  exit 2
fi

shift || true

HOOK_PATH="$REPO_ROOT/.ai/hooks/$HOOK_NAME"
if [[ ! -f "$HOOK_PATH" ]]; then
  echo "[HookRunner] Hook not found: $REPO_ROOT/.ai/hooks/$HOOK_NAME" >&2
  exit 1
fi

export HOOK_REPO_ROOT="$REPO_ROOT"
cd "$REPO_ROOT"

if [[ "${HOOK_HOST:-}" == "codex" && "$HOOK_NAME" != "session-start-context.sh" ]]; then
  tmp_stdout="$(mktemp)"
  if bash "$HOOK_PATH" "$@" >"$tmp_stdout"; then
    rm -f "$tmp_stdout"
    exit 0
  fi
  hook_status=$?
  if [[ -s "$tmp_stdout" ]]; then
    cat "$tmp_stdout" >&2
  fi
  rm -f "$tmp_stdout"
  exit "$hook_status"
fi

exec bash "$HOOK_PATH" "$@"

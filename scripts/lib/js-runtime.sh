#!/bin/bash
# Shared JavaScript runtime helpers for repo-harness shell scripts.

rh_resolve_js_runtime() {
  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi

  if [[ -x "${HOME:-}/.bun/bin/bun" ]]; then
    printf '%s\n' "${HOME}/.bun/bin/bun"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  return 1
}

rh_run_js_file() {
  local script_path="$1"
  shift
  local runtime

  runtime="$(rh_resolve_js_runtime || true)"
  if [[ -z "$runtime" ]]; then
    echo "[repo-harness] Missing JavaScript runtime (expected bun or node)" >&2
    return 127
  fi

  "$runtime" "$script_path" "$@"
}

rh_run_ts_file() {
  local script_path="$1"
  shift

  if command -v bun >/dev/null 2>&1; then
    bun "$script_path" "$@"
    return $?
  fi

  if [[ -x "${HOME:-}/.bun/bin/bun" ]]; then
    "${HOME}/.bun/bin/bun" "$script_path" "$@"
    return $?
  fi

  if command -v node >/dev/null 2>&1; then
    node --experimental-strip-types "$script_path" "$@"
    return $?
  fi

  echo "[repo-harness] Missing JavaScript runtime for TypeScript helper: $script_path" >&2
  return 127
}

rh_run_js_source() {
  local script_path
  local status
  local had_errexit=0

  script_path="$(mktemp "${TMPDIR:-/tmp}/repo-harness-js.XXXXXX.js")" || return 1
  cat > "$script_path"

  case "$-" in
    *e*)
      had_errexit=1
      set +e
      ;;
  esac

  rh_run_js_file "$script_path" "$@"
  status=$?
  rm -f "$script_path"

  if [[ "$had_errexit" -eq 1 ]]; then
    set -e
  fi

  return "$status"
}

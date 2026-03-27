#!/usr/bin/env bash

set -euo pipefail

MODE="full"
SKIP_INSTALL="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    setup|validate|watch|bridge|full)
      MODE="$1"
      shift
      ;;
    --skip-install)
      SKIP_INSTALL="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [setup|validate|watch|bridge|full] [--skip-install]" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

WATCH_PIDS=()

cleanup_watchers() {
  for pid in "${WATCH_PIDS[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" 2>/dev/null || true
      echo "Stopped watcher (PID: $pid)."
    fi
  done
}

trap cleanup_watchers EXIT

run_setup() {
  cd "$REPO_ROOT"
  npm ci
}

ensure_dev_tooling() {
  cd "$REPO_ROOT"
  if ! node -e "require.resolve('typescript/package.json')" >/dev/null 2>&1; then
    echo "TypeScript dependency missing. Running npm install..."
    npm install
  fi
}

run_validate() {
  cd "$REPO_ROOT"
  npm run lint
  npm run typecheck
  npm run test
}

start_watchers() {
  cd "$REPO_ROOT"
  npm run build -w @byom-ai/bridge -- --watch &
  WATCH_PIDS+=("$!")
  echo "Started bridge watcher (PID: ${WATCH_PIDS[-1]})."

  npm run build -w @byom-ai/extension -- --watch &
  WATCH_PIDS+=("$!")
  echo "Started extension watcher (PID: ${WATCH_PIDS[-1]})."
}

run_bridge() {
  ensure_dev_tooling

  cd "$REPO_ROOT"
  npm run typecheck -w @byom-ai/bridge
  echo "Bridge starting. Load extension from: $REPO_ROOT/apps/extension"
  node --loader "$REPO_ROOT/scripts/dev/ts-js-specifier-loader.mjs" \
    "$REPO_ROOT/apps/bridge/src/main.ts"
}

case "$MODE" in
  setup)
    run_setup
    ;;
  validate)
    run_validate
    ;;
  watch)
    start_watchers
    echo "Watchers are running. Press Ctrl+C to stop."
    wait
    ;;
  bridge)
    run_bridge
    ;;
  full)
    if [[ "$SKIP_INSTALL" != "true" ]]; then
      run_setup
    fi

    start_watchers
    echo "Started full dev mode (watchers + bridge). Press Ctrl+C to stop all."
    run_bridge
    ;;
  *)
    echo "Unsupported mode: $MODE" >&2
    exit 1
    ;;
esac

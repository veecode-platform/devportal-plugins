#!/usr/bin/env bash
set -euo pipefail

if (( $# == 0 )); then
  printf 'Usage: %s <plugin-directory> [...]\n' "$0" >&2
  exit 1
fi

workspace_root=$(pwd -P)
repo_root=$(CDPATH= cd -- "$workspace_root/../.." && pwd -P)
resolver="$repo_root/.agents/skills/devportal-context/scripts/resolve-devportal-local-dir.sh"
devportal_local_dir=$("$resolver")
dynamic_plugins_root="$devportal_local_dir/dynamic-plugins-root-dev"
mkdir -p "$dynamic_plugins_root"

export_one() {
  local plugin_dir=$1
  local plugin_path="$workspace_root/$plugin_dir"
  if [[ ! -d "$plugin_path" ]]; then
    printf 'Plugin directory does not exist: %s\n' "$plugin_path" >&2
    exit 1
  fi
  printf 'Exporting %s to %s\n' "$plugin_dir" "$dynamic_plugins_root"
  (
    cd -- "$plugin_path"
    YARN_ENABLE_IMMUTABLE_INSTALLS=false \
      npx @red-hat-developer-hub/cli@latest plugin export \
      --dev \
      --dynamic-plugins-root "$dynamic_plugins_root"
  )
}

for plugin_dir in "$@"; do export_one "$plugin_dir"; done

printf '\nRun in devportal-local:\n'
printf 'cd %q && docker compose -f docker-compose.yml -f docker-compose.dynamic-plugins-root.yml up -d\n' "$devportal_local_dir"

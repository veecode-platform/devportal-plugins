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
workspace_dynamic_config="$workspace_root/dynamic-plugins.yaml"

if [[ ! -f "$workspace_dynamic_config" ]]; then
  printf 'Workspace dynamic plugin config not found: %s\n' "$workspace_dynamic_config" >&2
  exit 1
fi

mkdir -p "$dynamic_plugins_root"

declare -a source_package_bases=()
declare -a exported_plugin_dirs=()

flatten_package_name() {
  local package_name=$1
  if [[ "$package_name" == */* ]]; then
    printf '%s-%s\n' "${package_name%%/*}" "${package_name#*/}" | sed 's/^@//'
  else
    printf '%s\n' "$package_name"
  fi
}

export_one() {
  local plugin_dir=$1
  local plugin_path="$workspace_root/$plugin_dir"
  local package_manifest
  local package_name
  local source_package_base
  local exported_plugin_dir

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

  package_manifest="$plugin_path/dist-dynamic/package.json"
  if [[ ! -f "$package_manifest" ]]; then
    printf 'Dynamic export did not produce package metadata: %s\n' "$package_manifest" >&2
    exit 1
  fi

  package_name=$(node -e '
    const fs = require("node:fs");
    const packageJson = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(packageJson.name);
  ' "$package_manifest")
  source_package_base=$(flatten_package_name "$package_name")
  exported_plugin_dir=${source_package_base%-dynamic}

  if [[ ! -d "$dynamic_plugins_root/$exported_plugin_dir" ]]; then
    printf 'Dynamic export directory not found: %s\n' "$dynamic_plugins_root/$exported_plugin_dir" >&2
    exit 1
  fi

  if ! grep -Fq "./dynamic-plugins/dist/$source_package_base" "$workspace_dynamic_config"; then
    printf 'Workspace dynamic plugin config has no package entry for %s\n' "$package_name" >&2
    exit 1
  fi

  source_package_bases+=("$source_package_base")
  exported_plugin_dirs+=("$exported_plugin_dir")
}

for plugin_dir in "$@"; do export_one "$plugin_dir"; done

local_dynamic_config="$dynamic_plugins_root/dynamic-plugins.local.yaml"
temporary_dynamic_config=$(mktemp "$dynamic_plugins_root/.dynamic-plugins.local.XXXXXX")
trap 'rm -f "$temporary_dynamic_config"' EXIT

awk '
  /^plugins:[[:space:]]*$/ { found = 1; print; next }
  found { print }
' "$workspace_dynamic_config" > "$temporary_dynamic_config"

if ! grep -q '^plugins:[[:space:]]*$' "$temporary_dynamic_config"; then
  printf 'Workspace dynamic plugin config has no top-level plugins list: %s\n' "$workspace_dynamic_config" >&2
  exit 1
fi

for index in "${!source_package_bases[@]}"; do
  sed -i \
    "s#./dynamic-plugins/dist/${source_package_bases[$index]}#./dynamic-plugins-root/${exported_plugin_dirs[$index]}#g" \
    "$temporary_dynamic_config"
done

if grep -Eq '^[[:space:]]*- package:[[:space:]]*\./dynamic-plugins/dist/' "$temporary_dynamic_config"; then
  printf 'Workspace dynamic plugin config references an unexported package. Pass every plugin directory listed in dynamic-plugins.yaml.\n' >&2
  exit 1
fi

mv "$temporary_dynamic_config" "$local_dynamic_config"

local_compose_override="$dynamic_plugins_root/docker-compose.dynamic-plugins-root.local.yml"
cat > "$local_compose_override" <<'YAML'
services:
  install-dynamic-plugins:
    volumes:
      - ./dynamic-plugins-root-dev/dynamic-plugins.local.yaml:/opt/app-root/src/dynamic-plugins.operator.yaml:ro
YAML

printf '\nRun in devportal-local:\n'
printf 'cd %q && docker compose -f docker-compose.yml -f docker-compose.dynamic-plugins-root.yml -f dynamic-plugins-root-dev/docker-compose.dynamic-plugins-root.local.yml up -d\n' "$devportal_local_dir"

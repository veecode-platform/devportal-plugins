#!/usr/bin/env bash
set -euo pipefail

if (( $# == 0 )); then
  printf 'Usage: %s <plugin-directory> [export-option...] [<plugin-directory> ...]\n' "$0" >&2
  exit 1
fi

workspace_root=$(pwd -P)
repo_root=$(CDPATH= cd -- "$workspace_root/../.." && pwd -P)
resolver="$repo_root/.agents/skills/devportal-context/scripts/resolve-devportal-local-dir.sh"
devportal_local_dir=$("$resolver")
dynamic_plugins_root="$devportal_local_dir/dynamic-plugins-root-dev"
# The export lands beside the runner's plugin root, never inside it. The
# portal scans every directory under the root, so an export sitting there is
# loaded a second time next to the copy the installer writes, and a backend
# plugin then dies with "Plugin '<id>' is already registered".
export_source_root="$devportal_local_dir/dynamic-plugins-src-dev"
workspace_dynamic_config="$workspace_root/dynamic-plugins.yaml"

if [[ ! -f "$workspace_dynamic_config" ]]; then
  printf 'Workspace dynamic plugin config not found: %s\n' "$workspace_dynamic_config" >&2
  exit 1
fi

mkdir -p "$dynamic_plugins_root" "$export_source_root"

# The export reads dist-types/, which only the type build writes. The
# Makefile's build-dynamic runs it first; dev:dynamic calls this script
# directly, so a fresh install stopped at "No declaration files found".
printf 'Building types in %s\n' "$workspace_root"
(cd -- "$workspace_root" && yarn tsc)

declare -a source_package_bases=()
declare -a exported_plugin_dirs=()
declare -a exported_package_names=()

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
  shift
  local -a export_options=("$@")
  local plugin_path="$workspace_root/$plugin_dir"
  local package_manifest
  local package_name
  local source_package_base
  local exported_plugin_dir

  if [[ ! -d "$plugin_path" ]]; then
    printf 'Plugin directory does not exist: %s\n' "$plugin_path" >&2
    exit 1
  fi
  # A backend export resolves its dependencies from npm, where a workspace-only
  # library such as a -common package does not exist. The CLI embeds a sibling
  # library by itself only when its name is the plugin's with -backend swapped
  # for -common; the overlay passes --embed-package for the rest, and so does this.
  local -a embed_args=()
  mapfile -t embed_args < <(node -e '
    const pkg = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    if (!["backend-plugin", "backend-plugin-module"].includes(pkg.backstage?.role)) process.exit(0);
    const embedded = Object.entries(pkg.dependencies ?? {})
      .filter(([, spec]) => spec.startsWith("workspace:"))
      .map(([name]) => name);
    if (embedded.length > 0) console.log(["--embed-package", ...embedded].join("\n"));
  ' "$plugin_path/package.json")
  printf 'Exporting %s to %s\n' "$plugin_dir" "$export_source_root"
  (
    cd -- "$plugin_path"
    YARN_ENABLE_IMMUTABLE_INSTALLS=false \
      npx @red-hat-developer-hub/cli@latest plugin export \
      --dev \
      --dynamic-plugins-root "$export_source_root" \
      "${embed_args[@]}" \
      "${export_options[@]}"
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

  # The CLI drops the -dynamic suffix from the copied folder for a frontend
  # plugin and keeps it for a backend one, so probe for both rather than
  # assuming either. Stripping unconditionally aborted every backend export.
  exported_plugin_dir=$source_package_base
  if [[ ! -d "$export_source_root/$exported_plugin_dir" ]]; then
    exported_plugin_dir=${source_package_base%-dynamic}
  fi

  if [[ ! -d "$export_source_root/$exported_plugin_dir" ]]; then
    printf 'Dynamic export directory not found: %s (nor %s)\n' \
      "$export_source_root/$source_package_base" \
      "$export_source_root/${source_package_base%-dynamic}" >&2
    exit 1
  fi

  if ! grep -Fq "./dynamic-plugins/dist/$source_package_base" "$workspace_dynamic_config"; then
    printf 'Workspace dynamic plugin config has no package entry for %s\n' "$package_name" >&2
    exit 1
  fi

  source_package_bases+=("$source_package_base")
  exported_plugin_dirs+=("$exported_plugin_dir")
  exported_package_names+=("$package_name")
}

# Arguments read like the overlay's plugins-list.yaml: a plugin directory, then
# the export options for that plugin only, such as --embed-package for a -node
# library the portal does not ship.
declare -a plugin_arguments=()
for argument in "$@"; do
  if [[ -d "$workspace_root/$argument" && ${#plugin_arguments[@]} -gt 0 ]]; then
    export_one "${plugin_arguments[@]}"
    plugin_arguments=()
  fi
  plugin_arguments+=("$argument")
done
export_one "${plugin_arguments[@]}"

local_dynamic_config="$dynamic_plugins_root/dynamic-plugins.local.yaml"
temporary_dynamic_config=$(mktemp "$dynamic_plugins_root/.dynamic-plugins.local.XXXXXX")
trap 'rm -f "$temporary_dynamic_config"' EXIT

# Carry the devportal-local operator config's `includes:` (the product face:
# the catalog-index default plus dynamic-plugins.veecode.yaml) into the generated
# config. merge-dynamic-plugins.js writes the mounted operator config verbatim and
# does not re-inject the defaults, so without these includes the portal comes up
# with only the workspace plugin (no catalog, no product face).
operator_baseline="$devportal_local_dir/dynamic-plugins.yaml"
if [[ -f "$operator_baseline" ]]; then
  awk '
    /^includes:[[:space:]]*$/ { in_includes = 1; print; next }
    in_includes && /^[^[:space:]#-]/ { in_includes = 0 }
    in_includes { print }
  ' "$operator_baseline" > "$temporary_dynamic_config"
fi

awk '
  /^plugins:[[:space:]]*$/ { found = 1; print; next }
  found { print }
' "$workspace_dynamic_config" >> "$temporary_dynamic_config"

if ! grep -q '^plugins:[[:space:]]*$' "$temporary_dynamic_config"; then
  printf 'Workspace dynamic plugin config has no top-level plugins list: %s\n' "$workspace_dynamic_config" >&2
  exit 1
fi

for index in "${!source_package_bases[@]}"; do
  sed -i \
    "s#./dynamic-plugins/dist/${source_package_bases[$index]}#./dynamic-plugins-src/${exported_plugin_dirs[$index]}#g" \
    "$temporary_dynamic_config"
done

# A ./dynamic-plugins/dist/ entry left over is either a plugin the image ships
# (a host plugin the workspace extends, such as the kubernetes backend) or a
# workspace plugin that was not exported; only the second is a mistake.
unexported_workspace_plugins=$(node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const [config, pluginsRoot] = process.argv.slice(1);
  const refs = [...fs.readFileSync(config, "utf8").matchAll(/^\s*- package:\s*\.\/dynamic-plugins\/dist\/(\S+)/gm)]
    .map(([, ref]) => ref);
  const workspacePackages = fs.readdirSync(pluginsRoot)
    .filter((dir) => fs.existsSync(path.join(pluginsRoot, dir, "package.json")))
    .map((dir) => JSON.parse(fs.readFileSync(path.join(pluginsRoot, dir, "package.json"), "utf8")).name)
    .map((name) => name.replace(/^@/, "").replace("/", "-"));
  console.log(refs.filter((ref) => workspacePackages.includes(ref.replace(/-dynamic$/, ""))).join(" "));
' "$temporary_dynamic_config" "$workspace_root/plugins")
if [[ -n "$unexported_workspace_plugins" ]]; then
  printf 'Workspace dynamic plugin config references unexported workspace plugins: %s. Pass every plugin directory listed in dynamic-plugins.yaml.\n' "$unexported_workspace_plugins" >&2
  exit 1
fi

# A plugin the product face already ships would load twice on the runner (the
# face copy and this export) and the backend refuses the second registration.
# The face is baked into the runner's image, so read it there and disable the
# face copy of each exported plugin with a level-1 override, the mechanism in
# devportal-chart docs/product-face-overrides.md. Matching is by plugin
# identity, so a plugin added to the face later needs no change here.
devportal_image=${DEVPORTAL_IMAGE:-$({ grep -o -m1 'DEVPORTAL_IMAGE:-[^}]*' "$devportal_local_dir/docker-compose.yml" || true; } | sed 's/^DEVPORTAL_IMAGE:-//')}
if [[ -z "$devportal_image" ]]; then
  printf 'Could not find the runner image: set DEVPORTAL_IMAGE or check %s\n' "$devportal_local_dir/docker-compose.yml" >&2
  exit 1
fi
if ! product_face=$(docker run --rm --entrypoint cat "$devportal_image" /opt/app-root/src/dynamic-plugins.veecode.yaml); then
  printf 'Could not read the product face from %s; without it face plugins would load twice.\n' "$devportal_image" >&2
  exit 1
fi
package_indent=$({ grep -m1 -o '^[[:space:]]*- package:' "$temporary_dynamic_config" || true; } | sed 's/- package://')
printf '%s\n' "$product_face" | node -e '
  const [indent, ...exported] = process.argv.slice(1);
  const flatten = (name) => name.replace(/^@/, "").replace("/", "-");
  const identities = new Set();
  for (const name of exported) {
    for (const id of [name, flatten(name)]) {
      identities.add(id);
      identities.add(id.replace(/-dynamic$/, ""));
    }
  }
  const identityOf = (ref) => {
    if (ref.startsWith("oci://")) return ref.slice(ref.indexOf("!") + 1);
    if (ref.startsWith("./")) return ref.split("/").pop();
    const at = ref.indexOf("@", ref.startsWith("@") ? 1 : 0);
    return at === -1 ? ref : ref.slice(0, at);
  };
  const face = require("node:fs").readFileSync(0, "utf8");
  for (const [, raw] of face.matchAll(/^- package:\s*("[^"]+"|\x27[^\x27]+\x27|\S+)/gm)) {
    const ref = raw.replace(/^["\x27]|["\x27]$/g, "");
    const id = identityOf(ref);
    if (!identities.has(id) && !identities.has(id.replace(/-dynamic$/, ""))) continue;
    process.stderr.write(`Disabling the face copy of ${ref}\n`);
    process.stdout.write(`${indent}- package: ${JSON.stringify(ref)}\n${indent}  disabled: true\n`);
  }
' "$package_indent" "${exported_package_names[@]}" >> "$temporary_dynamic_config"

mv "$temporary_dynamic_config" "$local_dynamic_config"

local_compose_override="$dynamic_plugins_root/docker-compose.dynamic-plugins-root.local.yml"
cat > "$local_compose_override" <<'YAML'
services:
  install-dynamic-plugins:
    volumes:
      - ./dynamic-plugins-root-dev/dynamic-plugins.local.yaml:/opt/app-root/src/dynamic-plugins.operator.yaml:ro
      - ./dynamic-plugins-src-dev:/opt/app-root/src/dynamic-plugins-src
YAML

printf '\nRun in devportal-local:\n'
printf 'cd %q && docker compose -f docker-compose.yml -f docker-compose.dynamic-plugins-root.yml -f dynamic-plugins-root-dev/docker-compose.dynamic-plugins-root.local.yml up -d\n' "$devportal_local_dir"

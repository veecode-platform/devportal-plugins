#!/usr/bin/env bash
set -euo pipefail

if (( $# == 0 )); then
  printf 'Usage: %s <plugin-directory> [export-option...] [<plugin-directory> ...]\n' "$0" >&2
  exit 1
fi

workspace_root=$(pwd -P)
repo_root=$(CDPATH='' cd -- "$workspace_root/../.." && pwd -P)
resolver="$repo_root/.agents/skills/devportal-context/scripts/resolve-devportal-local-dir.sh"
devportal_local_dir=$("$resolver")
dynamic_plugins_root="$devportal_local_dir/dynamic-plugins-root-dev"
# The export lands beside the runner's plugin root, never inside it. The
# portal scans every directory under the root, so an export sitting there is
# loaded a second time next to the copy the installer writes, and a backend
# plugin then dies with "Plugin '<id>' is already registered".
export_source_root="$devportal_local_dir/dynamic-plugins-src-dev"
workspace_dynamic_config="$workspace_root/dynamic-plugins.yaml"
# Keep the default equal to `cli` in versions.json of devportal-plugin-export-overlays,
# the CLI the published artifacts are built with. An unpinned `latest` broke this
# export when 2.1.2 came out: its frontend export has no dist-scalprum, which the
# runner needs.
rhdh_cli_version=${RHDH_CLI_VERSION:-1.11.2}

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

declare -a source_package_config_refs=()
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
  # for -common; the overlay passes --embed-package for the rest, and so does this,
  # from the plugin's workspace: dependencies and from the --embed-package its own
  # export-dynamic script declares, unless the caller already passed that one.
  local -a embed_args=()
  mapfile -t embed_args < <(node -e '
    const pkg = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    if (!["backend-plugin", "backend-plugin-module"].includes(pkg.backstage?.role)) process.exit(0);
    const workspaceDependencies = Object.entries(pkg.dependencies ?? {})
      .filter(([, spec]) => spec.startsWith("workspace:"))
      .map(([name]) => name);
    const declared = [...(pkg.scripts?.["export-dynamic"] ?? "").matchAll(/--embed-package\s+(\S+)/g)]
      .map(([, name]) => name);
    const passed = process.argv.slice(2);
    const embedded = [...new Set([...workspaceDependencies, ...declared])]
      .filter((name) => !passed.includes(name));
    if (embedded.length > 0) console.log(["--embed-package", ...embedded].join("\n"));
  ' "$plugin_path/package.json" "${export_options[@]}")
  printf 'Exporting %s to %s with @red-hat-developer-hub/cli@%s\n' "$plugin_dir" "$export_source_root" "$rhdh_cli_version"
  (
    cd -- "$plugin_path"
    YARN_ENABLE_IMMUTABLE_INSTALLS=false \
      npx --yes --package="@red-hat-developer-hub/cli@$rhdh_cli_version" \
      rhdh-cli plugin export \
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

  local source_package_config_ref
  # shellcheck disable=SC2016
  if ! source_package_config_ref=$(node -e '
    const fs = require("node:fs");
    const [configPath, packageBase] = process.argv.slice(1);
    const refs = [...fs.readFileSync(configPath, "utf8").matchAll(
      /^\s*-\s*package:\s*(?:"([^"]+)"|\x27([^\x27]+)\x27|(\S+))/gm,
    )].map(([, doubleQuoted, singleQuoted, plain]) =>
      doubleQuoted ?? singleQuoted ?? plain,
    );
    const prefixes = ["./dynamic-plugins/dist/", "./dynamic-plugins-src/"];
    const packageBases = [packageBase];
    if (packageBase.endsWith("-dynamic")) {
      packageBases.push(packageBase.slice(0, -"-dynamic".length));
    } else {
      packageBases.push(`${packageBase}-dynamic`);
    }
    const candidates = prefixes.flatMap((prefix) =>
      packageBases.map((base) => `${prefix}${base}`),
    );
    const match = refs.find((ref) => candidates.includes(ref));
    if (match) process.stdout.write(match);
    else process.exit(1);
  ' "$workspace_dynamic_config" "$source_package_base"); then
    printf 'Workspace dynamic plugin config has no package entry for %s\n' "$package_name" >&2
    exit 1
  fi

  source_package_config_refs+=("$source_package_config_ref")
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
temporary_catalog_index_dir=""
catalog_index_container=""
cleanup_export_temporary_files() {
  if [[ -n "$catalog_index_container" ]]; then
    docker rm -f "$catalog_index_container" >/dev/null 2>&1 || true
  fi
  rm -f "$temporary_dynamic_config"
  if [[ -n "$temporary_catalog_index_dir" ]]; then
    rm -rf "$temporary_catalog_index_dir"
  fi
}
trap cleanup_export_temporary_files EXIT

# Carry the devportal-local operator config's `includes:` (the catalog-index
# defaults, plus the product face on 3.0.x) into the generated config.
# merge-dynamic-plugins.js writes the mounted operator config verbatim and does
# not re-inject defaults, so without these includes the portal comes up with
# only the workspace plugin and no catalog-index defaults.
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

for index in "${!source_package_config_refs[@]}"; do
  sed -i \
    "s#${source_package_config_refs[$index]}#./dynamic-plugins-src/${exported_plugin_dirs[$index]}#g" \
    "$temporary_dynamic_config"
done

# A local package reference left after export is either a plugin the image
# ships (a host plugin the workspace extends, such as the kubernetes backend)
# or a workspace plugin that was not exported; only the second is a mistake.
unexported_workspace_plugins=$(node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const [config, pluginsRoot, ...exportedNames] = process.argv.slice(1);
  const normalize = (name) => name.replace(/^@/, "").replace("/", "-").replace(/-dynamic$/, "");
  const refs = [...fs.readFileSync(config, "utf8").matchAll(
    /^\s*-\s*package:\s*(?:\.\/dynamic-plugins\/dist\/|\.\/dynamic-plugins-src\/)(\S+)/gm,
  )].map(([, ref]) => path.posix.basename(ref));
  const workspacePackages = new Set(fs.readdirSync(pluginsRoot)
    .filter((dir) => fs.existsSync(path.join(pluginsRoot, dir, "package.json")))
    .map((dir) => JSON.parse(fs.readFileSync(path.join(pluginsRoot, dir, "package.json"), "utf8")).name)
    .map(normalize));
  const exportedPackages = new Set(exportedNames.map(normalize));
  console.log([...new Set(refs.map(normalize).filter((ref) =>
    workspacePackages.has(ref) && !exportedPackages.has(ref),
  ))].join(" "));
' "$temporary_dynamic_config" "$workspace_root/plugins" "${exported_plugin_dirs[@]}" "${exported_package_names[@]}")
if [[ -n "$unexported_workspace_plugins" ]]; then
  printf 'Workspace dynamic plugin config references unexported workspace plugins: %s. Pass every plugin directory listed in dynamic-plugins.yaml.\n' "$unexported_workspace_plugins" >&2
  exit 1
fi

# A factory plugin already enabled from the catalog index would load twice on
# the runner (the indexed copy and this export), and the backend refuses the
# second registration. DevPortal 3.1 keeps its factory references in
# factory-plugins.yaml; 3.0.x keeps the product face in
# dynamic-plugins.veecode.yaml. Prefer the 3.1 list and fall back to the face
# file for older images, then disable matching references with a level-1
# override as described in devportal-chart docs/product-face-overrides.md.
devportal_image=${DEVPORTAL_IMAGE:-$({ grep -o -m1 'DEVPORTAL_IMAGE:-[^}]*' "$devportal_local_dir/docker-compose.yml" || true; } | sed 's/^DEVPORTAL_IMAGE:-//')}
if [[ -z "$devportal_image" ]]; then
  printf 'Could not find the runner image: set DEVPORTAL_IMAGE or check %s\n' "$devportal_local_dir/docker-compose.yml" >&2
  exit 1
fi
if factory_plugins=$(docker run --rm --entrypoint cat "$devportal_image" /opt/app-root/src/factory-plugins.yaml); then
  factory_plugin_entries=$(printf '%s\n' "$factory_plugins" | awk '
$1 == "-" && $2 == "repository:" { repository = $3; next }
$1 == "repository:" { repository = $2; next }
$1 == "-" && $2 == "path:" && repository != "" { print repository "\t" $3; next }
$1 == "path:" && repository != "" { print repository "\t" $2 }
')
  if [[ -z "$factory_plugin_entries" ]]; then
    printf 'Could not parse factory plugin names from %s; refusing to risk duplicate loads.\n' "$devportal_image" >&2
    exit 1
  fi
  catalog_index_image=$({ awk '
    /^[[:space:]]*CATALOG_INDEX_IMAGE:[[:space:]]*/ {
      sub(/^[[:space:]]*CATALOG_INDEX_IMAGE:[[:space:]]*/, "")
      gsub(/[\047]/, "")
      gsub(/["]/, "")
      sub(/^[[:space:]]+/, "")
      sub(/[[:space:]]+$/, "")
      print
      exit
    }
  ' "$devportal_local_dir/docker-compose.yml" || true; })
  if [[ -z "$catalog_index_image" ]]; then
    printf 'Could not find CATALOG_INDEX_IMAGE in %s; cannot identify factory plugin references.\n' \
      "$devportal_local_dir/docker-compose.yml" >&2
    exit 1
  fi
  temporary_catalog_index_dir=$(mktemp -d)
  if ! catalog_index_container=$(docker create "$catalog_index_image" /bin/true); then
    printf 'Could not create a read-only container for catalog index %s.\n' \
      "$catalog_index_image" >&2
    exit 1
  fi
  if ! docker cp "$catalog_index_container:/dynamic-plugins.default.yaml" \
    "$temporary_catalog_index_dir/dynamic-plugins.default.yaml" >/dev/null; then
    printf 'Could not extract /dynamic-plugins.default.yaml from %s.\n' \
      "$catalog_index_image" >&2
    exit 1
  fi
  docker rm "$catalog_index_container" >/dev/null
  catalog_index_container=""
  catalog_default=$(cat "$temporary_catalog_index_dir/dynamic-plugins.default.yaml")
  # shellcheck disable=SC2016
  product_plugin_references=$(printf '%s\n' "$catalog_default" | node -e '
    const factoryEntries = process.argv.slice(1).join("\n").split(/\r?\n/)
      .filter(Boolean)
      .map((entry) => {
        const [repository, pluginPath] = entry.split("\t");
        return { repository, pluginPath };
      });
    const config = require("node:fs").readFileSync(0, "utf8");
    const refs = [...config.matchAll(/^\s*-\s*package:\s*(?:"([^"]+)"|\x27([^\x27]+)\x27|(\S+))/gm)]
      .map(([, doubleQuoted, singleQuoted, plain]) => doubleQuoted ?? singleQuoted ?? plain);
    const identityOf = (ref) => {
      if (ref.startsWith("oci://")) {
        const bang = ref.lastIndexOf("!");
        const repository = ref.slice("oci://".length, bang === -1 ? undefined : bang).split("@")[0];
        const factory = factoryEntries.find((entry) => entry.repository === repository);
        if (!factory) return null;
        return bang === -1 ? `${ref}!${factory.pluginPath}` : ref;
      }
      return null;
    };
    const matches = refs.filter((ref) => identityOf(ref) !== null)
      .map((ref) => identityOf(ref));
    process.stdout.write([...new Set(matches)].join("\n"));
  ' "$factory_plugin_entries")
  if [[ -z "$product_plugin_references" ]]; then
    printf 'Could not match factory plugin names to %s; refusing to risk duplicate loads.\n' \
      "$catalog_index_image" >&2
    exit 1
  fi
else
  if ! product_face=$(docker run --rm --entrypoint cat "$devportal_image" /opt/app-root/src/dynamic-plugins.veecode.yaml); then
    printf 'Could not read factory plugins or the 3.0.x product face from %s; refusing to risk duplicate loads.\n' "$devportal_image" >&2
    exit 1
  fi
  # shellcheck disable=SC2016
  product_plugin_references=$(printf '%s\n' "$product_face" | node -e '
    const face = require("node:fs").readFileSync(0, "utf8");
    const refs = [...face.matchAll(/^\s*-\s*package:\s*(?:"([^"]+)"|\x27([^\x27]+)\x27|(\S+))/gm)]
      .map(([, doubleQuoted, singleQuoted, plain]) => doubleQuoted ?? singleQuoted ?? plain);
    process.stdout.write(refs.join("\n"));
  ')
  if [[ -z "$product_plugin_references" ]]; then
    printf 'Could not parse product-face plugin references from %s; refusing to risk duplicate loads.\n' "$devportal_image" >&2
    exit 1
  fi
fi
package_indent=$({ grep -m1 -o '^[[:space:]]*- package:' "$temporary_dynamic_config" || true; } | sed 's/- package://')
# shellcheck disable=SC2016
printf '%s\n' "$product_plugin_references" | node -e '
  const [indent, ...exported] = process.argv.slice(1);
  const flatten = (name) => name.replace(/^@/, "").replace("/", "-").replace(/-dynamic$/, "");
  const identities = new Set();
  for (const name of exported) {
    identities.add(name);
    identities.add(flatten(name));
  }
  const identityOf = (ref) => {
    if (ref.startsWith("oci://")) return ref.slice(ref.lastIndexOf("!") + 1).split("/").pop();
    if (ref.startsWith("./")) return ref.split("/").pop();
    const at = ref.indexOf("@", ref.startsWith("@") ? 1 : 0);
    return at === -1 ? ref : ref.slice(0, at);
  };
  const references = require("node:fs").readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean);
  for (const ref of references) {
    const id = identityOf(ref);
    if (!identities.has(id) && !identities.has(flatten(id))) continue;
    process.stderr.write(`Disabling duplicate plugin entry ${ref}\n`);
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

# The catalog fixtures a workspace's dynamic-plugins.yaml registers live in its
# examples/; the portal reads them at the path the per-workspace composes used.
if [[ -d "$workspace_root/examples" ]]; then
  printf '  devportal:\n    volumes:\n      - "%s:/opt/app-root/src/examples:ro"\n' "$workspace_root/examples" >> "$local_compose_override"
fi

printf '\nRun in devportal-local:\n'
printf 'cd %q && docker compose -f docker-compose.yml -f docker-compose.dynamic-plugins-root.yml -f dynamic-plugins-root-dev/docker-compose.dynamic-plugins-root.local.yml up -d\n' "$devportal_local_dir"

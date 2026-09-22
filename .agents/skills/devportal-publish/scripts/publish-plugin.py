#!/usr/bin/env python3
"""Generate/update a plugin's entry in devportal-plugin-export-overlays and
verify the 4-way version coherence before anything is published.

Reads (never writes) from the devportal-plugins workspace:
  workspaces/<ws>/plugins/<plugin>/package.json   -> name, version, backstage.role/pluginId
  workspaces/<ws>/backstage.json                  -> repo-backstage-version
  workspaces/<ws>/dynamic-plugins.yaml             -> which plugins are wired (report only)

Writes (only with --write) under the overlays repo's workspaces/<ws>/:
  source.json                  (repo, repo-ref, repo-backstage-version)
  plugins-list.yaml            (adds "plugins/<plugin-dir>:" if missing)
  metadata/<flattened>.yaml    (kind: Package; created from template or version-bumped in place)
  ../../catalog-entities/extensions/plugins/<flattened-short>.yaml  (kind: Plugin, optional)
  ../../catalog-entities/extensions/plugins/all.yaml                (adds the Plugin's line)

The 4-way coherence check (package.json .version <-> metadata spec.version <->
the tag in spec.dynamicArtifact <-> the SHA/ref in source.json) always runs
before --write finishes and always runs again before --open-pr is honored.
Opening the PR itself requires --write, --open-pr AND --yes together; without
all three the script only prints what it would do.

See ../SKILL.md for the full design and the file-by-file contract.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:  # pragma: no cover
    print("PyYAML is required (python3 -c 'import yaml' failed).", file=sys.stderr)
    sys.exit(2)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def flatten_package_name(pkg_name: str) -> str:
    """"@scope/name" -> "scope-name". Matches the transform devportal-plugin-
    export-utils' export-dynamic.sh applies to package.json .name, and the
    filenames/metadata.name already in use for veecode-homepage and
    ai-resources (workspaces/veecode-homepage/metadata/veecode-platform-plugin-
    veecode-homepage.yaml, workspaces/ai-resources/metadata/veecode-platform-
    backstage-plugin-catalog-backend-module-ai-resources.yaml)."""
    return pkg_name.lstrip("@").replace("/", "-")


def run(cmd: list[str], cwd: Optional[Path] = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, check=check, capture_output=True, text=True)


def registry_backstage_version(overlays_repo: Path) -> str:
    """The bs_<version> segment in every dynamicArtifact tag comes from the
    overlays repo's root versions.json .backstage -- NOT from any workspace's
    own backstage.json / source.json repo-backstage-version, which can (and
    does) lag it. Evidence: workspaces/mcp-integrations/source.json says
    repo-backstage-version 1.54.1, but all four of its metadata tags are
    bs_1.52.0, matching versions.json's 1.52.0. See plugin-releaser.md line 18-19
    and its Backstage-line check in step 2."""
    data = read_json(overlays_repo / "versions.json")
    bs = data.get("backstage")
    if not bs:
        die(f"{overlays_repo / 'versions.json'} has no .backstage")
    return bs


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Reading the devportal-plugins side
# ---------------------------------------------------------------------------

@dataclass
class PluginFacts:
    workspace: str
    plugin_dir: str          # e.g. "about", "about-backend" (folder under plugins/)
    package_json_path: Path
    package_name: str        # "@veecode-platform/backstage-plugin-about"
    version: str
    role: Optional[str]
    plugin_id: Optional[str]
    backstage_version: str   # from workspace backstage.json


def find_plugin_package(devportal_plugins_repo: Path, workspace: str, plugin_arg: Optional[str]) -> PluginFacts:
    ws_dir = devportal_plugins_repo / "workspaces" / workspace
    if not ws_dir.is_dir():
        die(f"no such workspace: {ws_dir}")

    backstage_json = ws_dir / "backstage.json"
    if not backstage_json.is_file():
        die(f"missing {backstage_json}; cannot determine repo-backstage-version")
    backstage_version = read_json(backstage_json).get("version")
    if not backstage_version:
        die(f"{backstage_json} has no .version")

    plugins_dir = ws_dir / "plugins"
    if plugin_arg:
        candidates = [plugins_dir / plugin_arg]
    else:
        candidates = sorted(p.parent for p in plugins_dir.glob("*/package.json"))

    valid = [c for c in candidates if (c / "package.json").is_file()]
    if len(valid) == 0:
        die(f"no publishable plugin package.json found under {plugins_dir}. "
            f"Pass --plugin <dir> explicitly; refusing to guess.")
    if len(valid) > 1:
        names = ", ".join(p.name for p in valid)
        die(f"{plugins_dir} has multiple plugin packages ({names}). "
            f"Pass --plugin <dir> to pick one; the skill publishes one plugin at a time.")

    plugin_dir = valid[0]
    pkg = read_json(plugin_dir / "package.json")
    name = pkg.get("name")
    version = pkg.get("version")
    if not name or not version:
        die(f"{plugin_dir / 'package.json'} is missing .name or .version")

    backstage_meta = pkg.get("backstage", {})
    return PluginFacts(
        workspace=workspace,
        plugin_dir=plugin_dir.name,
        package_json_path=plugin_dir / "package.json",
        package_name=name,
        version=version,
        role=backstage_meta.get("role"),
        plugin_id=backstage_meta.get("pluginId"),
        backstage_version=backstage_version,
    )


def report_dynamic_plugins_wiring(ws_dir: Path, plugin_dir_name: str) -> str:
    """Read-only sanity note: is this plugin actually wired in the workspace's
    dynamic-plugins.yaml? Never blocks; just surfaced in the plan output."""
    dp_path = ws_dir / "dynamic-plugins.yaml"
    if not dp_path.is_file():
        return "no dynamic-plugins.yaml found in workspace (nothing to cross-check)"
    doc = yaml.safe_load(dp_path.read_text()) or {}
    entries = [p.get("package", "") for p in doc.get("plugins", [])]
    hit = any(f"-{plugin_dir_name}" in e or e.endswith(plugin_dir_name) or plugin_dir_name in e for e in entries)
    return "wired in dynamic-plugins.yaml" if hit else (
        f"WARNING: no dynamic-plugins.yaml entry looks like it matches plugins/{plugin_dir_name} "
        f"(found: {entries})"
    )


def proof2_trace(devportal_plugins_repo: Path, facts: PluginFacts) -> tuple[bool, str]:
    """Proof 2 is the default before publishing, not a gate: this looks for
    the trace `yarn dev:dynamic` leaves in devportal-local (an export of this
    package at this version, staged in dynamic-plugins.local.yaml) so the PR
    can say whether it ran. It cannot see whether the portal was opened."""
    resolver = devportal_plugins_repo / ".agents/skills/devportal-context/scripts/resolve-devportal-local-dir.sh"
    res = run(["bash", str(resolver)], cwd=devportal_plugins_repo, check=False)
    if res.returncode != 0:
        return False, f"devportal-local checkout not found: {res.stderr.strip()}"
    local_dir = Path(res.stdout.strip())
    local_config = local_dir / "dynamic-plugins-root-dev" / "dynamic-plugins.local.yaml"
    for manifest in sorted((local_dir / "dynamic-plugins-src-dev").glob("*/package.json")):
        exported = read_json(manifest)
        if exported.get("name") not in (facts.package_name, f"{facts.package_name}-dynamic"):
            continue
        if exported.get("version") != facts.version:
            return False, (f"the export in {manifest.parent} is version {exported.get('version')}, "
                           f"not {facts.version}; run `yarn dev:dynamic` again")
        if local_config.is_file() and f"./dynamic-plugins-src/{manifest.parent.name}" in local_config.read_text():
            return True, f"{facts.package_name}@{facts.version} exported and staged in {local_config}"
        return False, f"exported to {manifest.parent} but not staged in {local_config}"
    return False, f"no export of {facts.package_name} in {local_dir / 'dynamic-plugins-src-dev'}; run `yarn dev:dynamic`"


def repo_remote_url(devportal_plugins_repo: Path) -> str:
    res = run(["git", "remote", "get-url", "origin"], cwd=devportal_plugins_repo, check=False)
    url = res.stdout.strip()
    if not url:
        return "https://github.com/veecode-platform/devportal-plugins"
    # normalize ssh remotes to the https form source.json uses elsewhere in the overlays repo
    m = re.match(r"git@github\.com:(.+?)(\.git)?$", url)
    if m:
        return f"https://github.com/{m.group(1)}"
    return url.removesuffix(".git")


def resolve_ref(devportal_plugins_repo: Path, ref_arg: Optional[str]) -> tuple[str, Optional[str]]:
    """Returns (sha, warning). The warning fires when the ref is not reachable
    from any remote branch -- CI in the overlays repo fetches this SHA from
    the public remote, so a purely-local commit (e.g. HEAD of an unpushed
    worktree branch) would fail there with no local signal otherwise."""
    if ref_arg:
        sha = ref_arg
    else:
        res = run(["git", "rev-parse", "HEAD"], cwd=devportal_plugins_repo)
        sha = res.stdout.strip()
    reachable = run(["git", "branch", "-r", "--contains", sha], cwd=devportal_plugins_repo, check=False)
    if reachable.returncode == 0 and reachable.stdout.strip():
        return sha, None
    # A checkout whose fetch refspec tracks only some branches has no
    # remote-tracking ref for a pushed branch outside it; ask the remote
    # whether any branch tip is this commit (the usual case: a pushed HEAD).
    tips = run(["git", "ls-remote", "--heads", "origin"], cwd=devportal_plugins_repo, check=False)
    if tips.returncode != 0 or not any(line.split("\t", 1)[0] == sha for line in tips.stdout.splitlines()):
        return sha, (f"'{sha}' is not reachable on origin from "
                      f"{devportal_plugins_repo}. Push it before the overlay PR is opened, "
                      f"or CI there will not be able to fetch this ref.")
    return sha, None


def ref_contains_version(devportal_plugins_repo: Path, ref: str, workspace: str, plugin_dir: str, expected_version: str) -> tuple[bool, str]:
    """Does <ref>'s package.json for this plugin already carry expected_version?
    This is the check that stops a stale SHA in source.json from shipping an
    older commit under a version string that looks right."""
    rel = f"workspaces/{workspace}/plugins/{plugin_dir}/package.json"
    res = run(["git", "show", f"{ref}:{rel}"], cwd=devportal_plugins_repo, check=False)
    if res.returncode != 0:
        return False, f"'{ref}' does not contain {rel} ({res.stderr.strip()})"
    try:
        pkg = json.loads(res.stdout)
    except json.JSONDecodeError as exc:
        return False, f"{rel} at {ref} is not valid JSON: {exc}"
    actual = pkg.get("version")
    if actual != expected_version:
        return False, f"{rel} at {ref} is version {actual!r}, not {expected_version!r}"
    return True, f"{rel} at {ref} matches version {expected_version!r}"


# ---------------------------------------------------------------------------
# The overlays side
# ---------------------------------------------------------------------------

PER_PLUGIN_TAG_RE = re.compile(r"^oci://quay\.io/veecode/(?P<image>[^:]+):bs_(?P<bs>[^_]+(?:\.[^_]+)*)__(?P<version>.+)$")
BUNDLE_TAG_RE = re.compile(r"^oci://quay\.io/veecode/(?P<image>[^:]+):bs_(?P<bs>[^!]+)!(?P<pkg>.+)$")


@dataclass
class TagInfo:
    form: str  # "per-plugin" | "bundle" | "unknown"
    backstage_segment: Optional[str]
    version_segment: Optional[str]  # only for per-plugin form


def parse_dynamic_artifact(tag: str) -> TagInfo:
    m = PER_PLUGIN_TAG_RE.match(tag)
    if m:
        return TagInfo("per-plugin", m.group("bs"), m.group("version"))
    m = BUNDLE_TAG_RE.match(tag)
    if m:
        return TagInfo("bundle", m.group("bs"), None)
    return TagInfo("unknown", None, None)


def overlay_workspace_dir(overlays_repo: Path, workspace: str) -> Path:
    """Convention: the overlay workspace directory shares the devportal-plugins
    workspace name 1:1. Evidenced by workspaces/veecode-homepage and
    workspaces/ai-resources existing under both repos with the same name.
    The skill never invents a different name."""
    return overlays_repo / "workspaces" / workspace


def build_source_json(repo_url: str, ref: str, backstage_version: str) -> dict:
    return {
        "repo": repo_url,
        "repo-ref": ref,
        "repo-flat": False,
        "repo-backstage-version": backstage_version,
    }


def write_source_json(path: Path, data: dict, write: bool) -> str:
    # match the compact single-line style already used in this repo's source.json files
    text = json.dumps(data, separators=(", ", ": "))
    existing = path.read_text() if path.is_file() else None
    if existing is not None and json.loads(existing) == data:
        return f"unchanged: {path}"
    if write:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return f"{'wrote' if write else 'would write'}: {path}"


def update_plugins_list(path: Path, plugin_dir: str, write: bool) -> str:
    key = f"plugins/{plugin_dir}:"
    if path.is_file():
        text = path.read_text()
        lines = [l for l in text.splitlines() if l.strip()]
    else:
        text = ""
        lines = []
    if any(l.strip() == key for l in lines):
        return f"unchanged: {path} already lists {key}"
    lines.append(key)
    new_text = "\n".join(lines) + "\n"
    if write:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(new_text)
    return f"{'wrote' if write else 'would add'} {key} to {path}"


PACKAGE_METADATA_TEMPLATE = """apiVersion: extensions.backstage.io/v1alpha1
kind: Package
metadata:
  # TODO(devportal-publish): fill in title/links/support before merging.
  name: {flattened}
  namespace: veecode
  title: "TODO: human-readable plugin title"
  links:
    - url: {repo_url}
      title: Source Repository
  annotations:
    backstage.io/source-location: url:{repo_url}/tree/main/workspaces/{workspace}/plugins/{plugin_dir}
  tags: []
spec:
  packageName: "{package_name}"
  dynamicArtifact: {dynamic_artifact}
  version: {version}
  # TODO(devportal-publish): if the plugin needs app-config, drop the opt-out
  # below and fill appConfigExamples. The overlay gate
  # (scripts/validate-app-config-examples.py) rejects an empty list without it.
  appConfigNotRequired: true
  appConfigExamples: []
  backstage:
    role: {role}
    supportedVersions: {backstage_version}
  author: VeeCode
  support: community
  lifecycle: active
  partOf:
    - {plugin_dir}
"""


def render_new_metadata(facts: PluginFacts, flattened: str, repo_url: str, dynamic_artifact: str) -> str:
    return PACKAGE_METADATA_TEMPLATE.format(
        flattened=flattened,
        repo_url=repo_url,
        workspace=facts.workspace,
        plugin_dir=facts.plugin_dir,
        package_name=facts.package_name,
        dynamic_artifact=dynamic_artifact,
        version=facts.version,
        role=facts.role or "TODO-role",
        backstage_version=facts.backstage_version,
    )


VERSION_LINE_RE = re.compile(r"^(\s*version:\s*)(\S+)\s*$", re.MULTILINE)
DYNAMIC_ARTIFACT_LINE_RE = re.compile(r"^(\s*dynamicArtifact:\s*)(\S+)\s*$", re.MULTILINE)


def bump_existing_metadata(text: str, new_version: str, migrate_to_per_plugin: bool,
                            flattened: str, backstage_version: str) -> tuple[str, list[str]]:
    """Targeted text edits only -- never a full YAML re-dump, so the hand-
    written explanatory comments in these files (see ai-resources' and
    mcp-integrations' techdocs-mcp-extras metadata) survive untouched."""
    notes: list[str] = []

    m = DYNAMIC_ARTIFACT_LINE_RE.search(text)
    if not m:
        notes.append("could not find a dynamicArtifact: line; leaving metadata untouched")
        return text, notes
    tag = m.group(2)
    info = parse_dynamic_artifact(tag)

    new_text = VERSION_LINE_RE.sub(lambda mm: f"{mm.group(1)}{new_version}", text, count=1)

    if info.form == "per-plugin":
        new_tag = f"oci://quay.io/veecode/{flattened}:bs_{info.backstage_segment}__{new_version}"
        new_text = DYNAMIC_ARTIFACT_LINE_RE.sub(lambda mm: f"{mm.group(1)}{new_tag}", new_text, count=1)
        notes.append(f"bumped dynamicArtifact tag to {new_tag} (per-plugin form)")
    elif info.form == "bundle":
        if migrate_to_per_plugin:
            new_tag = f"oci://quay.io/veecode/{flattened}:bs_{info.backstage_segment}__{new_version}"
            new_text = DYNAMIC_ARTIFACT_LINE_RE.sub(lambda mm: f"{mm.group(1)}{new_tag}", new_text, count=1)
            notes.append(f"migrated dynamicArtifact from bundle to per-plugin form: {new_tag} "
                         f"(precedent: commit 57b54e73 in devportal-plugin-export-overlays)")
        else:
            notes.append("dynamicArtifact is bundle form (no version segment) -- left unchanged per "
                         "plugin-releaser's rule; pass --migrate-to-per-plugin to switch it explicitly")
    else:
        notes.append(f"dynamicArtifact tag {tag!r} matched neither known form; leaving it untouched")

    return new_text, notes


PLUGIN_ENTITY_TEMPLATE = """apiVersion: extensions.backstage.io/v1alpha1
kind: Plugin
metadata:
  name: {short_name}
  namespace: veecode
  title: "TODO: human-readable plugin title"
  links:
    - title: Source Repository
      url: {repo_url}
  tags: []
  description: |
    TODO(devportal-publish): one-paragraph description for the Extensions UI.
spec:
  author: VeeCode
  support: community
  lifecycle: active
  highlights:
    - "TODO: fill in highlights"
  packages:
    - {flattened}
  installation: |
    ## Installation

    ```yaml
    includes:
      - dynamic-plugins.default.yaml
    plugins:
      - package: {dynamic_artifact}
        disabled: false
    ```
"""


# ---------------------------------------------------------------------------
# Coherence check -- the whole point of this script
# ---------------------------------------------------------------------------

@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str


def coherence_check(facts: PluginFacts, metadata_text: str, source_json: dict,
                     devportal_plugins_repo: Path, registry_bs_version: str) -> list[CheckResult]:
    results: list[CheckResult] = []

    m_version = None
    vm = VERSION_LINE_RE.search(metadata_text)
    if vm:
        m_version = vm.group(2)
    results.append(CheckResult(
        "package.json .version == metadata spec.version",
        m_version == facts.version,
        f"package.json={facts.version!r} metadata={m_version!r}",
    ))

    tag = None
    tm = DYNAMIC_ARTIFACT_LINE_RE.search(metadata_text)
    if tm:
        tag = tm.group(2)
    info = parse_dynamic_artifact(tag) if tag else TagInfo("unknown", None, None)
    if info.form == "per-plugin":
        results.append(CheckResult(
            "metadata spec.version == dynamicArtifact tag version segment",
            info.version_segment == facts.version,
            f"metadata={facts.version!r} tag_segment={info.version_segment!r} tag={tag!r}",
        ))
    elif info.form == "bundle":
        results.append(CheckResult(
            "dynamicArtifact tag version segment (bundle form -- no version segment to check)",
            True,
            f"tag={tag!r} carries the package name, not a version; per plugin-releaser's rule this "
            f"is not a mismatch",
        ))
    else:
        results.append(CheckResult(
            "dynamicArtifact tag form recognized",
            False,
            f"tag={tag!r} matched neither per-plugin nor bundle form",
        ))

    ref = source_json.get("repo-ref")
    ref_ok, ref_detail = (False, "source.json has no repo-ref") if not ref else \
        ref_contains_version(devportal_plugins_repo, ref, facts.workspace, facts.plugin_dir, facts.version)
    results.append(CheckResult(
        "source.json repo-ref actually contains this package.json version",
        ref_ok,
        ref_detail,
    ))

    # Fifth check, beyond the brief's four: the tag's bs_ segment must match the
    # overlays repo's registry-wide versions.json .backstage, not the workspace's
    # own backstage.json / source.json repo-backstage-version (those can lag it;
    # see registry_backstage_version()'s docstring). plugin-releaser.md step 2
    # treats this as a hard gate ("A stale Backstage segment publishes to a line
    # nobody resolves"), so it blocks here too.
    results.append(CheckResult(
        "dynamicArtifact bs_ segment matches versions.json .backstage (5th check, registry-wide)",
        info.backstage_segment == registry_bs_version,
        f"versions.json .backstage={registry_bs_version!r} tag_bs_segment={info.backstage_segment!r}",
    ))

    return results


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workspace", required=True, help="devportal-plugins workspace name, e.g. 'about'")
    ap.add_argument("--plugin", help="plugin folder under workspaces/<ws>/plugins/ (required if there is more than one)")
    ap.add_argument("--devportal-plugins-repo", type=Path, default=Path.cwd(),
                     help="checkout of devportal-plugins containing the workspace (default: cwd)")
    ap.add_argument("--overlays-repo", type=Path,
                     default=Path.home() / "workspace/content-export/devportal-plugin-export-overlays",
                     help="checkout of devportal-plugin-export-overlays")
    ap.add_argument("--ref", help="override the SHA written to source.json repo-ref (default: HEAD of --devportal-plugins-repo)")
    ap.add_argument("--catalog-entry", dest="catalog_entry", action="store_true", default=False,
                     help="also create the Plugin entity + all.yaml line (default: OFF -- every "
                          "existing VeeCode workspace in the overlays repo, e.g. ai-resources and "
                          "veecode-homepage, deliberately carries no Plugin entity; opt in explicitly "
                          "when this plugin is meant to appear in the Extensions UI)")
    ap.add_argument("--migrate-to-per-plugin", action="store_true",
                     help="when bumping an existing bundle-form entry, switch it to per-plugin form "
                          "instead of leaving the tag's version segment absent")
    ap.add_argument("--write", action="store_true", help="actually write the overlay files (default: plan only, read-only)")
    ap.add_argument("--open-pr", action="store_true", help="push a branch and open the overlay PR. Requires --write and --yes.")
    ap.add_argument("--yes", action="store_true", help="confirm --open-pr. Without it --open-pr is refused even if passed.")
    ap.add_argument("--base-branch", default="main")
    ap.add_argument("--skip-proof2", metavar="REASON",
                     help="publish without proof 2 on purpose (e.g. a hotfix); the reason goes in the PR body")
    args = ap.parse_args()

    if args.open_pr and not (args.write and args.yes):
        die("--open-pr requires both --write and --yes (two-gate confirmation; never runs implicitly)")

    devportal_plugins_repo = args.devportal_plugins_repo.resolve()
    overlays_repo = args.overlays_repo.resolve()
    if not (overlays_repo / "versions.json").is_file():
        die(f"{overlays_repo} does not look like devportal-plugin-export-overlays (no versions.json)")

    facts = find_plugin_package(devportal_plugins_repo, args.workspace, args.plugin)
    ws_dir = devportal_plugins_repo / "workspaces" / args.workspace
    print(f"# plugin: {facts.package_name}@{facts.version}  (workspaces/{facts.workspace}/plugins/{facts.plugin_dir})")
    print(f"# {report_dynamic_plugins_wiring(ws_dir, facts.plugin_dir)}")

    flattened = flatten_package_name(facts.package_name)
    repo_url = repo_remote_url(devportal_plugins_repo)
    ref, ref_warning = resolve_ref(devportal_plugins_repo, args.ref)
    if ref_warning:
        print(f"# WARNING: {ref_warning}")
    registry_bs = registry_backstage_version(overlays_repo)

    overlay_ws_dir = overlay_workspace_dir(overlays_repo, facts.workspace)
    source_json_path = overlay_ws_dir / "source.json"
    plugins_list_path = overlay_ws_dir / "plugins-list.yaml"
    metadata_path = overlay_ws_dir / "metadata" / f"{flattened}.yaml"
    plugin_entity_path = overlays_repo / "catalog-entities" / "extensions" / "plugins" / f"{facts.plugin_dir}.yaml"
    all_yaml_path = overlays_repo / "catalog-entities" / "extensions" / "plugins" / "all.yaml"

    new_source_json = build_source_json(repo_url, ref, facts.backstage_version)
    print()
    print("## source.json")
    print(write_source_json(source_json_path, new_source_json, args.write))

    print()
    print("## plugins-list.yaml")
    print(update_plugins_list(plugins_list_path, facts.plugin_dir, args.write))

    print()
    print("## metadata/" + metadata_path.name)
    default_tag = f"oci://quay.io/veecode/{flattened}:bs_{registry_bs}__{facts.version}"
    if metadata_path.is_file():
        old_text = metadata_path.read_text()
        new_text, notes = bump_existing_metadata(
            old_text, facts.version, args.migrate_to_per_plugin, flattened, facts.backstage_version)
        for n in notes:
            print(f"  - {n}")
        if new_text != old_text:
            print(f"{'wrote' if args.write else 'would update'}: {metadata_path}")
            if args.write:
                metadata_path.write_text(new_text)
        else:
            print(f"unchanged: {metadata_path}")
        metadata_text_for_check = new_text
    else:
        new_text = render_new_metadata(facts, flattened, repo_url, default_tag)
        print(f"{'wrote' if args.write else 'would create'}: {metadata_path} (NEW -- has TODO placeholders for "
              f"title/links/support/appConfigExamples; fill those in before opening the PR)")
        if args.write:
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            metadata_path.write_text(new_text)
        metadata_text_for_check = new_text

    if args.catalog_entry:
        print()
        print("## catalog-entities/extensions/plugins/" + plugin_entity_path.name)
        if plugin_entity_path.is_file():
            print(f"unchanged: {plugin_entity_path} already exists (not overwritten -- edit by hand)")
        else:
            entity_text = PLUGIN_ENTITY_TEMPLATE.format(
                short_name=facts.plugin_dir, repo_url=repo_url, flattened=flattened,
                dynamic_artifact=default_tag,
            )
            print(f"{'wrote' if args.write else 'would create'}: {plugin_entity_path} (NEW -- has TODO placeholders)")
            if args.write:
                plugin_entity_path.parent.mkdir(parents=True, exist_ok=True)
                plugin_entity_path.write_text(entity_text)

        print()
        print("## catalog-entities/extensions/plugins/all.yaml")
        line = f"    - ./{facts.plugin_dir}.yaml"
        if all_yaml_path.is_file():
            text = all_yaml_path.read_text()
            if line in text.splitlines():
                print(f"unchanged: {all_yaml_path} already lists {facts.plugin_dir}.yaml")
            else:
                lines = text.splitlines()
                targets_idx = next((i for i, l in enumerate(lines) if l.strip() == "targets:"), None)
                if targets_idx is None:
                    print(f"could not find 'targets:' in {all_yaml_path}; not modified")
                else:
                    insert_at = len(lines)
                    for i in range(targets_idx + 1, len(lines)):
                        if lines[i].strip().startswith("- ") and lines[i].strip() > f"- ./{facts.plugin_dir}.yaml":
                            insert_at = i
                            break
                        if not lines[i].strip().startswith("- "):
                            insert_at = i
                            break
                    lines.insert(insert_at, line)
                    print(f"{'wrote' if args.write else 'would add'} {line.strip()} to {all_yaml_path}")
                    if args.write:
                        all_yaml_path.write_text("\n".join(lines) + "\n")
        else:
            print(f"{all_yaml_path} not found; skipped")

    print()
    print("## 4-way coherence check")
    results = coherence_check(facts, metadata_text_for_check, new_source_json, devportal_plugins_repo, registry_bs)
    all_ok = True
    for r in results:
        status = "OK  " if r.ok else "FAIL"
        print(f"  [{status}] {r.name}\n         {r.detail}")
        all_ok = all_ok and r.ok

    if not all_ok:
        print()
        print("Coherence check FAILED. Not opening a PR.")
        return 1

    print()
    print("Coherence check passed.")

    if metadata_text_for_check.count("TODO(devportal-publish)") or "TODO:" in metadata_text_for_check:
        print("NOTE: newly generated metadata/entity files still have TODO placeholders "
              "(title, links, support, appConfigExamples, description). Fill those in by hand "
              "before opening the PR -- the coherence check does not and cannot validate prose.")

    print()
    print("## proof 2 (the default before publishing)")
    proof2_ok, proof2_detail = proof2_trace(devportal_plugins_repo, facts)
    # The PR is public: record the outcome, never the local paths in the detail.
    if proof2_ok:
        proof2_line = f"Proof 2: ran (`{facts.package_name}@{facts.version}` exported and staged in devportal-local)."
        print(f"  found: {proof2_detail}")
    else:
        reason = args.skip_proof2 or "no reason given"
        proof2_line = f"Proof 2: **not run** ({reason})."
        print(f"  WARNING: {proof2_detail}")
        print("  The official flow proves the export in devportal-local before publishing. Run proof 2,")
        print("  or pass --skip-proof2 \"<reason>\" to publish anyway; the PR body records it either way.")

    if not args.open_pr:
        print()
        print("(dry run / no PR: pass --write to apply the files above, and --write --open-pr --yes to also push and open the PR)")
        return 0

    # --open-pr path: only reached with --write --open-pr --yes already verified above,
    # and only after coherence passed.
    branch = f"publish/{flattened}-{facts.version}"
    print()
    print(f"## opening PR on branch {branch}")
    # Always branch from the remote base: the local checkout may sit on a
    # previous publish branch and would otherwise carry its commits along.
    run(["git", "fetch", "origin", args.base_branch], cwd=overlays_repo)
    run(["git", "checkout", "-B", branch, f"origin/{args.base_branch}"], cwd=overlays_repo)
    run(["git", "add",
         str(source_json_path.relative_to(overlays_repo)),
         str(plugins_list_path.relative_to(overlays_repo)),
         str(metadata_path.relative_to(overlays_repo))],
        cwd=overlays_repo)
    if args.catalog_entry and plugin_entity_path.is_file():
        run(["git", "add", str(plugin_entity_path.relative_to(overlays_repo)),
             str(all_yaml_path.relative_to(overlays_repo))], cwd=overlays_repo)
    run(["git", "commit", "-m", f"feat: publish {facts.package_name}@{facts.version}"], cwd=overlays_repo)
    run(["git", "push", "-u", "origin", branch], cwd=overlays_repo)
    body = (
        f"Publishes `{facts.package_name}@{facts.version}` from `{args.workspace}/{facts.plugin_dir}` "
        f"at `{ref}`.\n\n4-way coherence check passed (package.json, metadata spec.version, "
        f"dynamicArtifact tag, source.json repo-ref).\n\n{proof2_line}\n"
    )
    pr = run(["gh", "pr", "create", "--base", args.base_branch, "--head", branch,
              "--title", f"publish: {facts.package_name}@{facts.version}", "--body", body],
             cwd=overlays_repo)
    pr_url = pr.stdout.strip()
    print(pr_url)
    # pr-actions.yaml listens to issue_comment only; a slash command in the PR
    # body never fires. Post it as a comment so the candidate build starts.
    run(["gh", "pr", "comment", pr_url, "--body", "/publish"], cwd=overlays_repo)
    print("posted /publish comment; pr-actions.yaml builds the pr_<n>__<version> candidate")
    return 0


if __name__ == "__main__":
    sys.exit(main())

/*
 * Copyright The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { ExtensionsPackage } from '@red-hat-developer-hub/backstage-plugin-extensions-common';
import type { PackageEntry } from './InstallationStorage';

/**
 * Orphan installation DETECTION (T1.3 item 3, option 1: detect, don't
 * migrate — authorized explicitly by the human).
 *
 * `marketplace_installations` keys a row by `package_name`, and that value
 * is the full OCI ref:
 *
 *   oci://quay.io/veecode/marketplace:bs_1.53.0!devportal-marketplace-backend
 *          └──────── where it comes from ───────┘ └────── which plugin ─────┘
 *
 * The key mixes the two. When a line retargets (e.g. bs_1.53.0 to some
 * later tag), the catalog's ref for that plugin changes even though the
 * plugin itself did not. The old row is left behind under a key nothing
 * looks up by anymore — an orphan.
 *
 * This module only detects that split and classifies it; it does not repair
 * it. Re-keying the row (or migrating its config_yaml to the new ref) is a
 * separate, future task ("option 2"). Rewriting the primary key here would
 * break the OFS rollback path — it only ever knew `package_name` — and that
 * is a hard stop for this task.
 */

export type OrphanClassification = 'retargeted' | 'unknown';

export interface OrphanInstallation {
  /** The persisted primary key, verbatim — `package_name` / `.package`. */
  packageName: string;
  /**
   * The stable identity extracted from `packageName` — see
   * extractSelector(). Null only for a malformed OCI ref (`oci://` with no
   * `!`): there was nothing to extract, which is why it is classified
   * 'unknown' rather than 'retargeted' below.
   */
  selector: string | null;
  classification: OrphanClassification;
  /**
   * Set only for 'retargeted': the ref the catalog currently advertises for
   * this same plugin. This is the value an operator's fix would move the
   * installation row to — this module does not perform that move.
   */
  currentRef?: string;
}

/**
 * The stable identity of a package ref, independent of registry and tag.
 *
 * Mirrors `plugin_identity()` in devportal-platform's
 * `docker/install-dynamic-plugins.py` (T1.2): for an OCI ref
 * (`oci://<registry>:<tag>!<selector>`) the selector — the part after `!` —
 * is the npm package name. It is globally unique, so it identifies the
 * plugin no matter which registry or tag it was actually pulled through.
 *
 * A non-OCI ref (a bare npm package name, or a local `./` path) has no such
 * split to begin with — there is no registry/tag prefix to strip, so the
 * whole ref already IS the stable identity. This is the explicit choice for
 * that case: rather than inventing a "no selector" sentinel, a non-OCI ref
 * is its own selector. One consequence worth being explicit about: if the
 * exact same npm package name is later republished as the selector of an
 * OCI bundle, this makes the two forms compare equal — which is correct,
 * since it is the same npm package Backstage actually loads either way, and
 * OCI wrapping is only ever a distribution detail on top of it.
 *
 * Returns null only for a malformed OCI ref — one that starts with
 * `oci://` but has no `!` at all. There is no identity to compute for it,
 * and the caller (detectOrphanInstallations below) must not throw on it.
 */
export function extractSelector(ref: string): string | null {
  if (!ref.startsWith('oci://')) return ref;
  const bang = ref.indexOf('!');
  if (bang === -1) return null;
  return ref.slice(bang + 1);
}

/**
 * Detect installations whose row key no longer resolves to a catalog entry.
 *
 * An installation is reported only when its exact `packageName` is not one
 * of the catalog's current `spec.dynamicArtifact` refs — an exact match
 * means the row and the catalog still agree, so there is nothing orphaned
 * to report for it.
 *
 * Every reported installation is classified:
 *
 *  - 'retargeted': the plugin's SELECTOR still matches a current catalog
 *    entry, just under a different ref (the registry or tag moved). The
 *    plugin still exists — the correct operator action is to move the
 *    installation to `currentRef`, not to treat it as gone.
 *
 *  - 'unknown': the selector matches nothing in the catalog at all. Either
 *    the plugin was genuinely removed / never existed in this catalog, or
 *    (for a malformed OCI ref with no selector to extract at all) the row
 *    cannot be resolved either way. Malformed refs are deliberately grouped
 *    here rather than silently dropped: a row this detector fails to
 *    explain is exactly the kind of orphan it exists to surface, not a
 *    reason to hide it.
 *
 * A disabled installation is still checked. `disabled` means "not
 * currently loaded", not "this row's key is void of meaning" — it can
 * orphan exactly like an enabled one.
 *
 * Pure by design: takes both lists as parameters instead of reading the
 * database or calling ExtensionsApi itself, so it has no I/O to mock in
 * tests and no dependency on DatabaseInstallationStorage.
 */
export function detectOrphanInstallations(
  installations: readonly PackageEntry[],
  packages: readonly ExtensionsPackage[],
): OrphanInstallation[] {
  const currentRefs = new Set<string>();
  const currentRefBySelector = new Map<string, string>();

  for (const pkg of packages) {
    const ref = pkg.spec?.dynamicArtifact;
    if (!ref) continue;
    currentRefs.add(ref);

    const selector = extractSelector(ref);
    // First ref wins for a given selector. A genuine collision — two live
    // catalog entries claiming the same selector — is the host installer's
    // check to make (T1.2's check_backend_plugin_id_collisions), not this
    // detector's; it only needs ONE current ref to classify an orphan.
    if (selector !== null && !currentRefBySelector.has(selector)) {
      currentRefBySelector.set(selector, ref);
    }
  }

  const orphans: OrphanInstallation[] = [];
  for (const installation of installations) {
    const packageName = installation.package;
    if (currentRefs.has(packageName)) continue; // exact match — not an orphan

    const selector = extractSelector(packageName);
    const currentRef =
      selector !== null ? currentRefBySelector.get(selector) : undefined;

    orphans.push(
      currentRef !== undefined
        ? { packageName, selector, classification: 'retargeted', currentRef }
        : { packageName, selector, classification: 'unknown' },
    );
  }
  return orphans;
}

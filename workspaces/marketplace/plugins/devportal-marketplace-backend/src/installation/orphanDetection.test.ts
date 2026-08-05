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
import { detectOrphanInstallations, extractSelector } from './orphanDetection';

function install(pkg: string, disabled = false): PackageEntry {
  return { package: pkg, disabled };
}

function catalogPackage(dynamicArtifact?: string): ExtensionsPackage {
  return {
    apiVersion: 'extensions.backstage.io/v1alpha1',
    kind: 'Package',
    metadata: { name: 'irrelevant-for-this-test' },
    spec: dynamicArtifact ? { dynamicArtifact } : undefined,
  } as ExtensionsPackage;
}

const MARKETPLACE_BACKEND_153 =
  'oci://quay.io/veecode/marketplace:bs_1.53.0!devportal-marketplace-backend';
const MARKETPLACE_BACKEND_154 =
  'oci://quay.io/veecode/marketplace:bs_1.54.0!devportal-marketplace-backend';
const CATALOG_MODULE_EXTENSIONS_153 =
  'oci://quay.io/veecode/extensions:bs_1.53.0!red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions';

describe('extractSelector', () => {
  it('extracts the part after "!" from a well-formed OCI ref', () => {
    expect(extractSelector(MARKETPLACE_BACKEND_153)).toBe(
      'devportal-marketplace-backend',
    );
    expect(extractSelector(CATALOG_MODULE_EXTENSIONS_153)).toBe(
      'red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions',
    );
  });

  it('returns null for a malformed OCI ref with no "!"', () => {
    expect(extractSelector('oci://quay.io/veecode/marketplace:bs_1.53.0')).toBeNull();
  });

  it('treats a non-OCI ref as its own identity — a bare npm package name', () => {
    expect(extractSelector('devportal-marketplace-backend')).toBe(
      'devportal-marketplace-backend',
    );
  });

  it('treats a non-OCI ref as its own identity — a local path', () => {
    expect(extractSelector('./my-local-plugin')).toBe('./my-local-plugin');
  });
});

describe('detectOrphanInstallations', () => {
  it('reports nothing when the persisted ref exactly matches a current catalog ref', () => {
    const orphans = detectOrphanInstallations(
      [install(MARKETPLACE_BACKEND_153)],
      [catalogPackage(MARKETPLACE_BACKEND_153)],
    );
    expect(orphans).toEqual([]);
  });

  it('classifies a selector that moved to a new tag as "retargeted", not "unknown"', () => {
    // The row was installed against bs_1.53.0; the catalog now only
    // advertises the same plugin under bs_1.54.0. Reported as retargeted:
    // the plugin exists, it just needs to be re-pointed, not reinstalled.
    const orphans = detectOrphanInstallations(
      [install(MARKETPLACE_BACKEND_153)],
      [catalogPackage(MARKETPLACE_BACKEND_154)],
    );
    expect(orphans).toEqual([
      {
        packageName: MARKETPLACE_BACKEND_153,
        selector: 'devportal-marketplace-backend',
        classification: 'retargeted',
        currentRef: MARKETPLACE_BACKEND_154,
      },
    ]);
  });

  it('classifies a selector absent from every catalog package as "unknown"', () => {
    const removedPlugin =
      'oci://quay.io/veecode/marketplace:bs_1.53.0!devportal-plugin-that-was-removed';
    const orphans = detectOrphanInstallations(
      [install(removedPlugin)],
      [catalogPackage(MARKETPLACE_BACKEND_153)],
    );
    expect(orphans).toEqual([
      {
        packageName: removedPlugin,
        selector: 'devportal-plugin-that-was-removed',
        classification: 'unknown',
      },
    ]);
  });

  it('does not crash on a malformed ref with no "!", and classifies it "unknown" with a null selector', () => {
    const malformed = 'oci://quay.io/veecode/marketplace:bs_1.53.0';
    expect(() =>
      detectOrphanInstallations([install(malformed)], [catalogPackage(MARKETPLACE_BACKEND_153)]),
    ).not.toThrow();

    const orphans = detectOrphanInstallations(
      [install(malformed)],
      [catalogPackage(MARKETPLACE_BACKEND_153)],
    );
    expect(orphans).toEqual([
      { packageName: malformed, selector: null, classification: 'unknown' },
    ]);
  });

  describe('non-OCI refs (local "./dir", bare npm name)', () => {
    it('matches exactly against a non-OCI catalog ref — not an orphan', () => {
      const orphans = detectOrphanInstallations(
        [install('./my-local-plugin')],
        [catalogPackage('./my-local-plugin')],
      );
      expect(orphans).toEqual([]);
    });

    it('is "unknown" when no catalog package carries that exact ref or that selector', () => {
      const orphans = detectOrphanInstallations(
        [install('some-npm-plugin')],
        [catalogPackage(MARKETPLACE_BACKEND_153)],
      );
      expect(orphans).toEqual([
        { packageName: 'some-npm-plugin', selector: 'some-npm-plugin', classification: 'unknown' },
      ]);
    });

    it('documented consequence: a bare npm name matches an OCI catalog entry whose selector is the same npm package', () => {
      // devportal-marketplace-backend was installed before the catalog wrapped
      // it in an OCI bundle. Same npm package either way, so this is a
      // legitimate retargeting, not a fresh unknown.
      const orphans = detectOrphanInstallations(
        [install('devportal-marketplace-backend')],
        [catalogPackage(MARKETPLACE_BACKEND_153)],
      );
      expect(orphans).toEqual([
        {
          packageName: 'devportal-marketplace-backend',
          selector: 'devportal-marketplace-backend',
          classification: 'retargeted',
          currentRef: MARKETPLACE_BACKEND_153,
        },
      ]);
    });
  });

  it('still checks a disabled installation — disabled is not an exemption from orphan detection', () => {
    const removedPlugin =
      'oci://quay.io/veecode/marketplace:bs_1.53.0!devportal-plugin-that-was-removed';
    const orphans = detectOrphanInstallations(
      [install(removedPlugin, /* disabled */ true)],
      [catalogPackage(MARKETPLACE_BACKEND_153)],
    );
    expect(orphans).toHaveLength(1);
    expect(orphans[0].classification).toBe('unknown');
  });

  it('ignores catalog packages with no dynamicArtifact instead of crashing on them', () => {
    const orphans = detectOrphanInstallations(
      [install(MARKETPLACE_BACKEND_153)],
      [catalogPackage(undefined), catalogPackage(MARKETPLACE_BACKEND_154)],
    );
    expect(orphans).toEqual([
      {
        packageName: MARKETPLACE_BACKEND_153,
        selector: 'devportal-marketplace-backend',
        classification: 'retargeted',
        currentRef: MARKETPLACE_BACKEND_154,
      },
    ]);
  });

  it('handles a realistic mixed batch: one healthy, one retargeted, one unknown', () => {
    const removedPlugin = 'oci://quay.io/veecode/old:bs_1.40.0!devportal-plugin-long-gone';
    const orphans = detectOrphanInstallations(
      [
        install(CATALOG_MODULE_EXTENSIONS_153), // exact match — healthy
        install(MARKETPLACE_BACKEND_153), // retargeted to bs_1.54.0 below
        install(removedPlugin), // unknown
      ],
      [catalogPackage(CATALOG_MODULE_EXTENSIONS_153), catalogPackage(MARKETPLACE_BACKEND_154)],
    );

    expect(orphans.map(o => o.packageName)).toEqual([
      MARKETPLACE_BACKEND_153,
      removedPlugin,
    ]);
    expect(orphans.map(o => o.classification)).toEqual(['retargeted', 'unknown']);
  });

  it('returns nothing for an empty installation list', () => {
    expect(detectOrphanInstallations([], [catalogPackage(MARKETPLACE_BACKEND_153)])).toEqual([]);
  });

  it('classifies everything as unknown when the catalog is empty', () => {
    const orphans = detectOrphanInstallations([install(MARKETPLACE_BACKEND_153)], []);
    expect(orphans).toEqual([
      {
        packageName: MARKETPLACE_BACKEND_153,
        selector: 'devportal-marketplace-backend',
        classification: 'unknown',
      },
    ]);
  });
});

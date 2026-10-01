// The shared test vectors of section 1 of the image-shipped plugins contract:
// two package references and whether they name one plugin. The core pre-step
// tests the same rows in JavaScript, so keep the two copies identical.
export const PLUGIN_KEY_VECTORS: Array<[string, string, boolean]> = [
  [
    'oci://quay.io/veecode/x@sha256:A',
    'oci://quay.io/veecode/x@sha256:B',
    true,
  ],
  [
    'oci://quay.io/veecode/x:bs_1.52.0__1.0.0',
    'oci://quay.io/veecode/x@sha256:A!x',
    true,
  ],
  [
    'oci://quay.io/veecode/x@sha256:A!x',
    'oci://quay.io/veecode/x@sha256:B!x',
    true,
  ],
  [
    'oci://quay.io/veecode/x@sha256:A!x',
    'oci://quay.io/veecode/x@sha256:B!y',
    false,
  ],
  ['oci://quay.io/veecode/x!a', 'oci://quay.io/veecode/y!a', false],
  ['oci://localhost:5000/x:1', 'oci://localhost:5000/x:2', true],
  ['oci://localhost:5000/x:1', 'oci://localhost:5001/x:1', false],
  ['./dynamic-plugins/dist/a', './dynamic-plugins/dist/a', true],
  ['./dynamic-plugins/dist/a', './dynamic-plugins/dist/a-dynamic', false],
  ['./dynamic-plugins/dist/a', 'oci://quay.io/veecode/a@sha256:A', false],
  ['@scope/pkg@1.0.0', '@scope/pkg@2.0.0', true],
];

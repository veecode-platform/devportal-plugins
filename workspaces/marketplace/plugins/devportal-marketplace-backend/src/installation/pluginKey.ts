// A row is keyed by its whole reference, but a newer reference of an installed
// plugin names the same plugin. The rule is section 1 of the image-shipped
// plugins contract, and the core install pre-step applies the same one.

interface OciRef {
  image: string;
  selector: string | undefined;
}

function splitOciRef(ref: string): OciRef | undefined {
  if (!ref.startsWith('oci://')) {
    return undefined;
  }
  const bang = ref.indexOf('!');
  return bang === -1
    ? { image: ref, selector: undefined }
    : { image: ref.slice(0, bang), selector: ref.slice(bang + 1) };
}

// The registry and repository of an image, without its tag or digest. A ':'
// only separates a tag when it comes after the last '/', because a registry
// port (host:5000/x) contains one too.
function ociRepository(image: string): string {
  const noDigest = image.replace(/^oci:\/\//, '').split('@')[0];
  const lastColon = noDigest.lastIndexOf(':');
  const lastSlash = noDigest.lastIndexOf('/');
  return lastColon > lastSlash ? noDigest.slice(0, lastColon) : noDigest;
}

// Local paths stay as they are and npm names lose the trailing @version.
function normalizePluginKey(ref: string): string {
  if (ref.startsWith('./')) {
    return ref;
  }
  const oci = splitOciRef(ref);
  if (oci) {
    const repository = `oci://${ociRepository(oci.image)}`;
    return oci.selector === undefined
      ? repository
      : `${repository}!${oci.selector}`;
  }
  const at = ref.lastIndexOf('@');
  return at > 0 ? ref.slice(0, at) : ref;
}

/**
 * Whether two package references name one plugin: the same OCI registry and
 * repository, where the selector may be missing on one side but must match
 * when both have one, or the same normalized key for anything else.
 */
export function samePlugin(a: string, b: string): boolean {
  const ociA = splitOciRef(a);
  const ociB = splitOciRef(b);
  if (ociA && ociB && ociRepository(ociA.image) === ociRepository(ociB.image)) {
    return (
      ociA.selector === undefined ||
      ociB.selector === undefined ||
      ociA.selector === ociB.selector
    );
  }
  return normalizePluginKey(a) === normalizePluginKey(b);
}

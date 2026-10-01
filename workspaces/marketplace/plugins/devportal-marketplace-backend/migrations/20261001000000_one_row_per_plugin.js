// @ts-check

const TABLE = 'marketplace_installations';

// Migrations are loaded from the package root and cannot import the bundle, so
// this copies samePlugin from src/installation/pluginKey.ts, frozen as of this
// migration.
function splitOciRef(ref) {
  if (!ref.startsWith('oci://')) {
    return undefined;
  }
  const bang = ref.indexOf('!');
  return bang === -1
    ? { image: ref, selector: undefined }
    : { image: ref.slice(0, bang), selector: ref.slice(bang + 1) };
}

function ociRepository(image) {
  const noDigest = image.replace(/^oci:\/\//, '').split('@')[0];
  const lastColon = noDigest.lastIndexOf(':');
  const lastSlash = noDigest.lastIndexOf('/');
  return lastColon > lastSlash ? noDigest.slice(0, lastColon) : noDigest;
}

function normalizePluginKey(ref) {
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

function samePlugin(a, b) {
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

function hasAmbiguousPluginMatch(reference, candidates) {
  const target = splitOciRef(reference);
  if (!target) return false;

  const repository = ociRepository(target.image);
  const selectors = new Set();
  for (const candidateRef of candidates) {
    const candidate = splitOciRef(candidateRef);
    if (
      candidate &&
      ociRepository(candidate.image) === repository &&
      candidate.selector !== undefined
    ) {
      selectors.add(candidate.selector);
    }
  }
  return selectors.size > 1;
}

const writtenAt = row =>
  row.updated_at ? new Date(row.updated_at).getTime() : 0;

// The order the install pre-step uses to pick one of two rows that name one
// plugin: an enabled row beats a disabled one, then the later updated_at wins,
// then the later package_name.
function isPreferred(row, other) {
  if (Boolean(row.disabled) !== Boolean(other.disabled)) {
    return !row.disabled;
  }
  if (writtenAt(row) !== writtenAt(other)) {
    return writtenAt(row) > writtenAt(other);
  }
  return row.package_name > other.package_name;
}

/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  await knex.transaction(async trx => {
    const rows = await trx(TABLE).select(
      'package_name',
      'disabled',
      'updated_at',
    );
    const ambiguous = new Set();
    for (const row of rows) {
      const matches = rows.filter(other =>
        samePlugin(row.package_name, other.package_name),
      );
      if (
        hasAmbiguousPluginMatch(
          row.package_name,
          matches.map(match => match.package_name),
        )
      ) {
        matches.forEach(match => ambiguous.add(match.package_name));
      }
    }

    const unambiguousRows = rows.filter(
      row => !ambiguous.has(row.package_name),
    );
    const losers = unambiguousRows.filter(row =>
      unambiguousRows.some(
        other =>
          samePlugin(row.package_name, other.package_name) &&
          isPreferred(other, row),
      ),
    );
    if (losers.length > 0) {
      await trx(TABLE)
        .whereIn(
          'package_name',
          losers.map(row => row.package_name),
        )
        .delete();
    }
  });
};

/** @param {import("knex").Knex} _knex */
exports.down = async function down(_knex) {
  // Nothing to undo: the rows that up deleted cannot be restored, and the
  // remaining rows are valid under the old schema.
};

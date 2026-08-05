// @ts-check
//
// D-G8 / T1.3 — separate what the operator ASKED FOR from what was actually
// resolved, so a restart never silently re-resolves a moving tag.
//
// Purely additive and nullable, and the primary key is untouched on purpose:
//
//   * `package_name` stays the PK and keeps holding the full
//     `spec.dynamicArtifact` the operator selected. Changing the key would orphan
//     every existing installation row.
//   * Every reader in this repo and in the platform image selects columns by
//     NAME — DatabaseInstallationStorage uses
//     .select('config_yaml','package_name','disabled') and
//     .select('package_name','disabled'), and the platform's stateless pre-step
//     (docker/regenerate-extensions-install.js) selects the same three
//     explicitly. There is no `SELECT *` and no positional access, so adding
//     columns cannot break a reader that predates them.
//   * Both columns are nullable with no default, so existing rows stay valid and
//     an OFS rollback keeps reading the table it always read.
//
// Who writes what:
//   requested_ref   — this backend, at install time. It is the reference the
//                     operator asked for (tag or digest), recorded verbatim. No
//                     registry access is involved.
//   resolved_digest — the platform pre-step, the first time it materialises a row
//                     whose digest is still null. It resolves the reference once
//                     via skopeo, writes the digest back, and every later boot
//                     reuses it instead of re-resolving the tag.
//
// The backend deliberately does NOT resolve digests: it has no registry client
// today (no skopeo, no child_process, no manifest call), and giving it one would
// put network, credentials and timeouts on the install path.

/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('marketplace_installations', table => {
    table.text('requested_ref').nullable();
    table.text('resolved_digest').nullable();
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('marketplace_installations', table => {
    table.dropColumn('requested_ref');
    table.dropColumn('resolved_digest');
  });
};

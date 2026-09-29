// @ts-check

/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('marketplace_installations', table => {
    // Read by the install pre-step in devportal-core
    // (veecode/regenerate-extensions-install.js) when the columns exist. It
    // stores the digest it resolves for an OCI package in resolved_digest and
    // reuses it on later boots, so a restart installs the same image. This
    // backend never writes either column.
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

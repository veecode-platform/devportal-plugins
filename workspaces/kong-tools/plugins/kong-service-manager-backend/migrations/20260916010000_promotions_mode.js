// @ts-check

/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('promotions', table => {
    // How the promotion reaches the chart (issue #135, "edit in code"):
    // `experiment` (the original flow — tagged, frozen, deleted at merge) or
    // `code-only` (edits an already code-owned plugin directly, no
    // experiment ever created in Kong). Nullable with no default so an
    // older backend reading this table ignores the column; the application
    // layer treats a null/missing value as `experiment`.
    table.string('mode', 32).nullable();
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('promotions', table => {
    table.dropColumn('mode');
  });
};

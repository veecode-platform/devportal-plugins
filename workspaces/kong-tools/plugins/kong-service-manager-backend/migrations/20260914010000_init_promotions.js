// @ts-check

/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('promotions', table => {
    table.increments('id').primary();
    // Caller-supplied dedupe key (derived from instance+service+route+plugin
    // by the promote endpoint, Task P3). A retried promote for the same
    // in-flight draft must resolve to the same row instead of opening a
    // second MR; this column, not the surrogate id, carries that guarantee.
    table.string('idempotency_key', 500).notNullable();
    table.string('instance', 255).notNullable();
    table.string('service_name', 500).notNullable();
    table.string('route_id', 255).notNullable();
    table.string('plugin_type', 255).notNullable();
    // Normalized live plugin config at promotion time; the finalizer's
    // restore path (Task P4) recreates the experimental plugin from this.
    table.text('config_snapshot').notNullable();
    table.string('state', 32).notNullable().defaultTo('draft');
    // Set once the MR opens (Task P3); null while the record is still a draft.
    table.string('mr_ref', 500).nullable();
    table.string('requester_ref', 500).notNullable();
    table.text('detail').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['state'], 'promotions_state_idx');
    table.unique(['idempotency_key'], 'promotions_idempotency_key_unique');
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTable('promotions');
};

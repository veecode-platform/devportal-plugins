// @ts-check

/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('teardown_operations', table => {
    table.increments('id').primary();
    table.string('project_slug', 500).notNullable();
    table.string('host', 255).notNullable();
    table.integer('pipeline_id').notNullable();
    table.integer('job_id').notNullable();
    table.string('requester_ref', 500).notNullable();
    table.string('state', 32).notNullable().defaultTo('pending');
    table.text('detail').nullable();
    table.string('unregister_commit_sha', 64).nullable();
    // Tracks consecutive GitLab-call failures for this operation so the
    // reconciler can bound retries (mark failed after too many attempts)
    // even across process restarts.
    table.integer('attempts').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['state'], 'teardown_operations_state_idx');
    table.unique(['host', 'project_slug', 'job_id'], 'teardown_operations_host_project_job_unique');
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTable('teardown_operations');
};

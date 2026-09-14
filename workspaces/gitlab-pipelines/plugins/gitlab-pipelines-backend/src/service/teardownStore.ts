import path from 'path';
import type { Knex } from 'knex';
import { TeardownState } from '@veecode-platform/gitlab-pipelines-common';

const TABLE = 'teardown_operations';

export interface TeardownOperationRow {
  id: number;
  host: string;
  project_slug: string;
  pipeline_id: number;
  job_id: number;
  requester_ref: string;
  state: TeardownState;
  detail: string | null;
  unregister_commit_sha: string | null;
  attempts: number;
  created_at: Date;
  updated_at: Date;
}

export interface NewTeardownOperation {
  host: string;
  projectSlug: string;
  pipelineId: number;
  jobId: number;
  requesterRef: string;
}

export interface TeardownStore {
  insertPending(op: NewTeardownOperation): Promise<void>;
  listPending(): Promise<TeardownOperationRow[]>;
  listForProject(host: string, projectSlug: string): Promise<TeardownOperationRow[]>;
  markState(
    id: number,
    state: TeardownState,
    extra?: { detail?: string | null; unregisterCommitSha?: string | null },
  ): Promise<void>;
  incrementAttempts(id: number): Promise<number>;
}

export class KnexTeardownStore implements TeardownStore {
  constructor(private readonly db: Knex) {}

  static async create(db: Knex): Promise<KnexTeardownStore> {
    // __dirname points to dist/service/ at runtime;
    // migrations/ lives at the package root (two levels up from dist/service/)
    const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
    await db.migrate.latest({ directory: migrationsDir });
    return new KnexTeardownStore(db);
  }

  async insertPending(op: NewTeardownOperation): Promise<void> {
    await this.db(TABLE)
      .insert({
        host: op.host,
        project_slug: op.projectSlug,
        pipeline_id: op.pipelineId,
        job_id: op.jobId,
        requester_ref: op.requesterRef,
        state: 'pending',
        updated_at: this.db.fn.now(),
      })
      .onConflict(['host', 'project_slug', 'job_id'])
      .ignore();
  }

  listPending(): Promise<TeardownOperationRow[]> {
    return this.db<TeardownOperationRow>(TABLE).where('state', 'pending').orderBy('id', 'asc');
  }

  listForProject(host: string, projectSlug: string): Promise<TeardownOperationRow[]> {
    return this.db<TeardownOperationRow>(TABLE)
      .where({ host, project_slug: projectSlug })
      .orderBy('created_at', 'desc');
  }

  async markState(
    id: number,
    state: TeardownState,
    extra: { detail?: string | null; unregisterCommitSha?: string | null } = {},
  ): Promise<void> {
    await this.db(TABLE)
      .where('id', id)
      .update({
        state,
        ...(extra.detail !== undefined ? { detail: extra.detail } : {}),
        ...(extra.unregisterCommitSha !== undefined
          ? { unregister_commit_sha: extra.unregisterCommitSha }
          : {}),
        updated_at: this.db.fn.now(),
      });
  }

  async incrementAttempts(id: number): Promise<number> {
    await this.db(TABLE)
      .where('id', id)
      .update({
        attempts: this.db.raw('?? + 1', ['attempts']),
        updated_at: this.db.fn.now(),
      });
    const row = await this.db<TeardownOperationRow>(TABLE).where('id', id).first();
    return row?.attempts ?? 0;
  }
}
